import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt.js";
import { getCookie } from "hono/cookie";
export async function authMiddleware(c: Context, next: Next) {
  try {
    const authcookie = getCookie(c, "AuthToken");

    if (!authcookie) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authcookie;

    const payload = verifyToken(token);

    c.set("payload", payload);

    await next();
  } catch (error) {
    return c.json({ error: "Invalid token" }, 401);
  }
}
