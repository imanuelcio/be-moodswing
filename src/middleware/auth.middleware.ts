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

      if (!tokenFromCookies || !tokenFromCookies.startsWith("Bearer ")) {
        return c.json(
          formatError(new UnauthorizedError("Missing JWT token")),
          401
        );
      }

      const token = tokenFromCookies.substring(7); // Remove 'Bearer ' prefix
      const payload = verifyJwtToken(token);

      // Set user context
      c.set("userId", payload.userId);
      c.set("walletId", payload.walletId);
      c.set("address", payload.address);
      c.set("chainKind", payload.chainKind);

      await next();
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "JWT authentication failed");

      return c.json(formatError(error as Error), 401);
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
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "API key authentication failed");

      return c.json(formatError(error as Error), 401);
    }
  };
}

// Admin Authentication Middleware (requires JWT + admin role)
export function createAdminMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      // First check JWT
      const authHeader = c.req.header("Authorization");

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json(
          formatError(
            new UnauthorizedError("Missing or invalid authorization header")
          ),
          401
        );
      }

      const token = authHeader.substring(7);
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
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Admin authentication failed");

      return c.json(formatError(error as Error), 401);
    }
  };
}
