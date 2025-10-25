import type { Context, Next } from "hono";
import { verifyJwtToken, validateApiKey } from "../core/auth.js";
import {
  formatError,
  UnauthorizedError,
  ForbiddenError,
} from "../core/errors.js";
import { getCookie } from "hono/cookie";

// JWT Authentication Middleware
export function createJwtMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      const tokenFromCookies = getCookie(c, "token");

      if (!tokenFromCookies) {
        return c.json(
          formatError(new UnauthorizedError("Missing JWT token")),
          401
        );
      }

      // PERBAIKAN: Cookie tidak pakai 'Bearer ', langsung token
      const token = tokenFromCookies;
      const payload = verifyJwtToken(token);

      // Set user context
      c.set("userId", payload.userId);
      c.set("walletId", payload.walletId);
      c.set("address", payload.address);
      c.set("chainKind", payload.chainKind);

      await next();
    } catch (err) {
      // PERBAIKAN: Handle logger yang mungkin undefined
      const logger = c.get("logger");
      if (logger?.error) {
        logger.error({ err }, "JWT authentication failed");
      } else {
        console.error("JWT authentication failed:", err);
      }

      return c.json(
        formatError(err instanceof Error ? err : new Error(String(err))),
        401
      );
    }
  };
}

// API Key Authentication Middleware
export function createApiKeyMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      const apiKey = c.req.header("x-api-key");

      if (!apiKey) {
        return c.json(
          formatError(new UnauthorizedError("Missing API key")),
          401
        );
      }

      const payload = await validateApiKey(apiKey);

      // Set API key context
      c.set("apiKeyId", payload.keyId);
      c.set("apiKeyOwnerId", payload.ownerId);
      c.set("apiKeyPlan", payload.plan);
      c.set("apiKeyRateLimit", payload.rateLimit);

      await next();
    } catch (err) {
      const logger = c.get("logger");
      if (logger?.error) {
        logger.error({ err }, "API key authentication failed");
      } else {
        console.error("API key authentication failed:", err);
      }

      return c.json(
        formatError(err instanceof Error ? err : new Error(String(err))),
        401
      );
    }
  };
}

// Admin Authentication Middleware (requires JWT + admin role)
export function createAdminMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      // First check JWT from cookie
      const tokenFromCookies = getCookie(c, "token");

      // Fallback to Authorization header if no cookie
      const authHeader = c.req.header("Authorization");

      let token: string | undefined;

      if (tokenFromCookies) {
        token = tokenFromCookies;
      } else if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      }

      if (!token) {
        return c.json(
          formatError(
            new UnauthorizedError("Missing or invalid authorization")
          ),
          401
        );
      }

      const payload = verifyJwtToken(token);

      // Set user context
      c.set("userId", payload.userId);
      c.set("walletId", payload.walletId);
      c.set("address", payload.address);
      c.set("chainKind", payload.chainKind);

      // TODO: Check if user has admin role in database
      // For now, we'll allow all authenticated users to perform admin actions
      // In production, you should check user roles/permissions

      await next();
    } catch (err) {
      const logger = c.get("logger");
      if (logger?.error) {
        logger.error({ err }, "Admin authentication failed");
      } else {
        console.error("Admin authentication failed:", err);
      }

      return c.json(
        formatError(err instanceof Error ? err : new Error(String(err))),
        401
      );
    }
  };
}
