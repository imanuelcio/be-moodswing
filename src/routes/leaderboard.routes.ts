import { Hono } from "hono";
import * as leaderboardController from "../controllers/leaderboard.controller.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";

const leaderboardRoutes = new Hono();
leaderboardRoutes.get("/", leaderboardController.getLeaderboard);
leaderboardRoutes.get("/user/:userId", leaderboardController.getUserPosition);
leaderboardRoutes.get("/stats", leaderboardController.getStats);
leaderboardRoutes.post(
  "/refresh",
  authMiddleware,
  requireAdmin(),
  leaderboardController.refreshLeaderboard
);

export default leaderboardRoutes;
