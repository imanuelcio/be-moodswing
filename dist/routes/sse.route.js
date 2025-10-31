import { Hono } from "hono";
import { SSEController } from "../controllers/sse.controller.js";
import { createRateLimitMiddleware, publicRateLimit, } from "../core/rateLimit.js";
const sse = new Hono();
const sseController = new SSEController();
// Apply rate limiting to all SSE endpoints
// sse.use("/*", createRateLimitMiddleware(publicRateLimit));
// Market streams
sse.get("/markets/:id", sseController.streamMarketTicker.bind(sseController));
// Sentiment streams
sse.get("/sentiment", sseController.streamSentiment.bind(sseController));
// Leaderboard streams
sse.get("/leaderboard", sseController.streamLeaderboard.bind(sseController));
// Stats endpoint
sse.get("/stats", sseController.getSSEStats.bind(sseController));
export { sse };
