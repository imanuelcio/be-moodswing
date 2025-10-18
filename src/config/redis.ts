import { env } from "./env.js";
import { logger } from "../core/logger.js";
import { Redis } from "ioredis";
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export const redisPub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

export const redisSub = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redisPub.on("error", (err) => {
  logger.error({ err }, "Redis publisher error");
});

redisSub.on("error", (err) => {
  logger.error({ err }, "Redis subscriber error");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  redis.disconnect();
  redisPub.disconnect();
  redisSub.disconnect();
});
