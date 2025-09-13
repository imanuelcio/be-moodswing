import { Hono } from "hono";
import * as sseController from "../controllers/sse.controller.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
const sseRoutes = new Hono();
sseRoutes.get("/markets", sseController.marketUpdates);
sseRoutes.get("/health", sseController.sseHealth);
sseRoutes.get("/stats", authMiddleware, requireAdmin(), sseController.sseStats);

export default sseRoutes;
