import type { Context } from "hono";
import { z } from "zod";
import { AuthService } from "../services/auth.service.js";
import {
  formatError,
  UnauthorizedError,
  ValidationError,
} from "../core/errors.js";
import StoreCookieInResponse from "../utils/jwt.js";
import { setCookie } from "hono/cookie";
import {
  createApiKeySchema,
  nonceSchema,
  verifySchema,
} from "../schemas/auth.schema.js";

function getHostFromRequest(c: Context) {
  // Prioritaskan Origin, fallback ke Host header, terakhir dari URL
  const origin = c.req.header("origin") || c.req.header("Origin");
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch (_) {
      /* noop */
    }
  }
  const host = c.req.header("host") || c.req.header("Host");
  if (host) return host.split(":")[0];
  return new URL(c.req.url).hostname;
}
function deriveCookieDomain(hostname: string | undefined) {
  if (!hostname) return undefined;
  if (hostname.endsWith(".vercel.app")) {
    // Preview domains berbeda-beda per deploy → pakai host-only cookie (undefined)
    return undefined;
  }
  // custom domain → ambil eTLD+1 sederhana
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    const base = parts.slice(-2).join(".");
    return `.${base}`;
  }
  return undefined;
}
export class AuthController {
  constructor(private authService = new AuthService()) {}

  async generateNonce(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = nonceSchema.parse(body);

      const hostname = getHostFromRequest(c);
      const domain = (parsed.domain ?? hostname)?.toLowerCase();
      if (!domain) throw new ValidationError("Domain is required");

      const { nonce, message, expiresInSec } =
        await this.authService.generateNonceForWallet(
          parsed.address,
          parsed.chainKind,
          domain
        );

      if (!nonce || !message) {
        throw new Error("Failed to generate nonce");
      }
      return c.json({ nonce, message, expiresInSec });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to generate nonce");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error)),
          400
        );
      }
      if (error instanceof ValidationError) {
        return c.json(formatError(error), 400);
      }
      return c.json(formatError(error as Error), 500);
    }
  }
  safeLogger(c: Context) {
    const l = c.get("logger") as any;
    return {
      info: (obj: any, msg?: string) =>
        l?.info ? l.info(obj, msg) : console.info(msg ?? "", obj),
      error: (obj: any, msg?: string) =>
        l?.error ? l.error(obj, msg) : console.error(msg ?? "", obj),
    };
  }

  async verifySignature(c: Context) {
    try {
      const body = await c.req.json();
      const parsed = verifySchema.parse(body);

      const hostname = getHostFromRequest(c);
      const domain = (parsed.domain ?? hostname)?.toLowerCase();
      if (!domain) throw new ValidationError("Domain is required");

      const { token, user, wallet } =
        await this.authService.verifyWalletSignature({
          address: parsed.address,
          chainKind: parsed.chainKind,
          domain,
          nonce: parsed.nonce,
          signature: parsed.signature,
        });

      const logger = this.safeLogger(c);
      logger.info(
        { userId: user.id, address: wallet.address, chain: wallet.chainKind },
        "User authenticated"
      );

      const cookieDomain = deriveCookieDomain(hostname);
      setCookie(c, "token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // di production harus secure
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30, // 30 hari
        // domain: cookieDomain,
      });

      return c.json({
        success: true,
        user: { id: user.id, handle: user.handle },
        wallet: { address: wallet.address, chainKind: wallet.chainKind },
        message: "Authentication successful",
      });
    } catch (err) {
      const logger = this.safeLogger(c);
      logger.error({ err }, "Authentication failed");

      // pakai formatError kamu → bungkus status di sini
      const status =
        err instanceof z.ZodError
          ? 400
          : err instanceof ValidationError
          ? 400
          : err instanceof UnauthorizedError
          ? 401
          : 500;

      return c.json(formatError(err as Error), status);
    }
  }

  async createApiKey(c: Context) {
    try {
      const userId = c.get("userId"); // From JWT middleware
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const { plan, rateLimitPerHour } = createApiKeySchema.parse(body);

      const result = await this.authService.createApiKey({
        ownerUserId: userId,
        plan,
        rateLimitPerHour,
      });

      const logger = c.get("logger");
      logger.info({ userId, keyId: result.id }, "API key created");

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to create API key");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async revokeApiKey(c: Context) {
    try {
      const userId = c.get("userId");
      const keyId = c.req.param("keyId");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      await this.authService.revokeApiKey(keyId, userId);

      const logger = c.get("logger");
      logger.info({ userId, keyId }, "API key revoked");

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to revoke API key");

      return c.json(formatError(error as Error), 500);
    }
  }

  async listApiKeys(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const apiKeys = await this.authService.listApiKeys(userId);

      return c.json({ apiKeys });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to list API keys");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getProfile(c: Context) {
    try {
      const userId = c.get("userId");
      const walletId = c.get("walletId");
      const address = c.get("address");
      const chainKind = c.get("chainKind");

      return c.json({
        user: { id: userId },
        wallet: { id: walletId, address, chainKind },
      });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get profile");

      return c.json(formatError(error as Error), 500);
    }
  }
}
