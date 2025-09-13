import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt.js";
import { getCookie } from "hono/cookie";
import { supabaseAdmin } from "../config/supabase.js";
import type { JWTPayload } from "../types/index.js";
export async function authMiddleware() {
  return async (c: Context, next: Next) => {
    try {
      const authcookie = getCookie(c, "access_token");

      if (!authcookie) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const token = authcookie;

      const payload = verifyToken(token);

      c.set("userId", payload.userId);
      console.log("payload", payload);
      await next();
    } catch (error) {
      return c.json({ error: "Invalid token" }, 401);
    }
  };
}

export function requireAdmin() {
  return async (c: Context, next: Next) => {
    const userId = c.get("userId");

    if (!userId) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401
      );
    }

    try {
      // Check user role in database
      const { data: user, error } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("Failed to fetch user role:", error);
        return c.json(
          {
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to verify admin privileges",
            },
          },
          500
        );
      }

      if (!user || user.role !== "admin") {
        return c.json(
          {
            error: {
              code: "FORBIDDEN",
              message: "Admin privileges required",
            },
          },
          403
        );
      }

      return next();
    } catch (error) {
      console.error("Admin check failed:", error);
      return c.json(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to verify admin privileges",
          },
        },
        500
      );
    }
  };
}
export function optionalAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);

      try {
        const decoded = verifyToken(token) as JWTPayload;
        const userId = decoded.userId;

        if (userId) {
          c.set("userId", userId);
        }
      } catch (error) {
        // Ignore invalid tokens for optional auth
        console.warn("Optional auth failed:", error);
      }
    }

    return next();
  };
}
