import { Hono } from "hono";
import { PointsController } from "../controllers/points.controller.js";
import {
  createJwtMiddleware,
  createAdminMiddleware,
} from "../middleware/auth.middleware.js";
import {
  createRateLimitMiddleware,
  publicRateLimit,
} from "../core/rateLimit.js";

const points = new Hono();
const pointsController = new PointsController();

// Public endpoints (with rate limiting)
points.use("/public/*", createRateLimitMiddleware(publicRateLimit));
points.get(
  "/public/leaderboard",
  pointsController.getLeaderboard.bind(pointsController)
);
points.get(
  "/public/stats",
  pointsController.getPointsStats.bind(pointsController)
);

// Protected endpoints (require JWT)
points.use("/me/*", createJwtMiddleware());
points.get(
  "/me/balance",
  pointsController.getUserBalance.bind(pointsController)
);
points.get(
  "/me/history",
  pointsController.getUserHistory.bind(pointsController)
);
points.post(
  "/me/transfer",
  pointsController.transferPoints.bind(pointsController)
);
points.post(
  "/me/daily-bonus",
  pointsController.claimDailyBonus.bind(pointsController)
);

// Admin endpoints
points.use("/admin/*", createAdminMiddleware());
points.post(
  "/admin/award",
  pointsController.awardPoints.bind(pointsController)
);
points.post(
  "/admin/bulk-award",
  pointsController.bulkAwardPoints.bind(pointsController)
);

export { points };
