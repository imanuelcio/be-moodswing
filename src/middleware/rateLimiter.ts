import type { Context, Next } from "hono";
import { ApiResponseBuilder } from "../utils/apiResponse.js";

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

export function rateLimiter(
  maxRequests: number = 100,
  windowMs: number = 60 * 1000 // 1 minute
) {
  return async (c: Context, next: Next) => {
    const identifier =
      c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";

    const now = Date.now();
    const resetTime = now + windowMs;

    if (!store[identifier] || store[identifier].resetTime < now) {
      store[identifier] = {
        count: 1,
        resetTime,
      };
    } else {
      store[identifier].count++;
    }

    if (store[identifier].count > maxRequests) {
      const retryAfter = Math.ceil((store[identifier].resetTime - now) / 1000);
      return ApiResponseBuilder.tooManyRequests(c, retryAfter);
    }

    // Set rate limit headers
    c.header("X-RateLimit-Limit", maxRequests.toString());
    c.header(
      "X-RateLimit-Remaining",
      (maxRequests - store[identifier].count).toString()
    );
    c.header("X-RateLimit-Reset", store[identifier].resetTime.toString());

    await next();
  };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}, 60 * 1000);
