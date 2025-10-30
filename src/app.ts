import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as pinoLogger } from "./core/logger.js";
import { env } from "./config/env.js";
import { auth } from "./routes/auth.route.js";
import { user } from "./routes/user.route.js";
import { wallet } from "./routes/wallet.route.js";
import { chain } from "./routes/chain.route.js";
import { market } from "./routes/market.route.js";
import { bet } from "./routes/bet.route.js";
import { points } from "./routes/points.route.js";
import { position } from "./routes/position.route.js";
import { ws } from "./routes/ws.route.js";
import { admin } from "./routes/admin.route.js";
import { sse } from "./routes/sse.route.js";
import { ensureRedis } from "./config/redis-ensure.js";
import { redis } from "./config/redis.js";
import { nftRoutes } from "./routes/nft.route.js";

export const app = new Hono();

// --- CORS FIRST ---
const ALLOWED = env.CORS_ORIGINS.split(",").map((s) =>
  s.trim().replace(/^"+|"+$/g, "")
);

app.use(
  "*",
  cors({
    origin: "http://localhost:5173",
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Access-Control-Allow-Origin",
      "Authorization",
    ],
    exposeHeaders: ["Content-Length", "X-Requested-With", "Content-Type"],
    maxAge: 86400,
  })
);

// Optional: early return untuk preflight biar super cepat
app.options("*", (c) => c.body(null, 204));

// --- Redis middleware (skip OPTIONS) ---
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") return next();
  await ensureRedis();
  return next();
});

// Health
app.get("/api/v1/healthz", async (c) => {
  try {
    const pong = await redis.ping();
    return c.json({ ok: true, redis: pong });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// Routes (wajib pakai leading slash '/')
app.route("/api/v1/auth", auth);
app.route("/api/v1/user", user);
app.route("/api/v1/wallet", wallet);
app.route("/api/v1/chain", chain);
app.route("/api/v1/market", market);
app.route("/api/v1/bet", bet);
app.route("/api/v1/points", points);
app.route("/api/v1/position", position);
app.route("/api/v1/ws", ws);
app.route("/api/v1/sse", sse);
app.route("/api/v1/admin", admin);
app.route("/api/v1/nft", nftRoutes);
// Error handler
app.onError((err, c) => {
  pinoLogger.error({ err });
  const status = (err as any).status ?? 500;
  return c.json(
    { error: { message: err.message ?? "Internal Error" } },
    status
  );
});
