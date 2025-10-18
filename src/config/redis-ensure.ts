// Pastikan koneksi Redis hanya sekali per cold-start
import { logger } from "../core/logger.js";
import { redis, redisPub, redisSub } from "./redis.js";

let _ready: Promise<void> | null = null;

export function ensureRedis(): Promise<void> {
  if (_ready) return _ready; // idempotent

  _ready = (async () => {
    // ioredis dengan lazyConnect=true perlu connect() manual
    if (redis.status !== "ready" && redis.status !== "connecting") {
      await redis.connect();
      logger.info("ensureRedis: redis connected");
    }

    if (redisPub.status !== "ready" && redisPub.status !== "connecting") {
      await redisPub.connect();
      logger.info("ensureRedis: redisPub connected");
    }

    if (redisSub.status !== "ready" && redisSub.status !== "connecting") {
      await redisSub.connect();
      logger.info("ensureRedis: redisSub connected");
    }

    // contoh: subscribe channel sekali
    // aman dipanggil berulang karena kita cek status di atas
    // await redisSub.subscribe("auth:events");
    // redisSub.on("message", (channel, msg) => {
    //   logger.info({ channel, msg }, "Redis message");
    // });
  })().catch((err) => {
    // kalau gagal, reset supaya percobaan berikutnya bisa ulang
    _ready = null;
    logger.error({ err }, "ensureRedis: failed to connect");
    throw err;
  });

  return _ready;
}
