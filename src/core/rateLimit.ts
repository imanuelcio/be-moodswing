import { redis } from "../config/redis.js";
import { RateLimitError } from "./errors.js";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

// Token bucket rate limiter using Redis
export class TokenBucketRateLimit {
  constructor(private options: RateLimitOptions) {}

  async checkLimit(identifier: string): Promise<void> {
    const key = `${this.options.keyPrefix || "rl"}:${identifier}`;
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Use Redis pipeline for atomic operations
    const pipeline = redis.pipeline();

    // Remove expired tokens
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Count current tokens
    pipeline.zcard(key);

    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);

    // Set expiry
    pipeline.expire(key, Math.ceil(this.options.windowMs / 1000));

    const results = await pipeline.exec();

    if (!results) {
      throw new Error("Rate limit check failed");
    }

    const currentCount = results[1][1] as number;

    if (currentCount >= this.options.maxRequests) {
      // Remove the request we just added since it exceeds limit
      await redis.zrem(key, `${now}-${Math.random()}`);
      throw new RateLimitError(
        `Rate limit exceeded. Max ${this.options.maxRequests} requests per ${
          this.options.windowMs / 1000
        }s`
      );
    }
  }
}

// Pre-configured rate limiters
export const publicRateLimit = new TokenBucketRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyPrefix: "public",
});

export const b2bRateLimit = new TokenBucketRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10000,
  keyPrefix: "b2b",
});

// Helper to create rate limiter middleware
export function createRateLimitMiddleware(rateLimiter: TokenBucketRateLimit) {
  return async (c: any, next: any) => {
    const identifier =
      c.get("apiKeyId") ||
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      "unknown";

    try {
      await rateLimiter.checkLimit(identifier);
      await next();
    } catch (error) {
      if (error instanceof RateLimitError) {
        return c.json(
          { error: { code: error.code, message: error.message } },
          429
        );
      }
      throw error;
    }
  };
}
