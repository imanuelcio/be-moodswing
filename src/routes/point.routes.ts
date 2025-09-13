import { Hono } from "hono";
import * as pointsController from "../controllers/points.controller.js";
import { authMiddleware } from "../middleware/auth.js";
const pointsRoutes = new Hono();
pointsRoutes.post(
  "/claim-monthly",
  authMiddleware,
  pointsController.claimMonthly
);
pointsRoutes.get("/balance", authMiddleware, pointsController.getBalance);
pointsRoutes.get("/history", authMiddleware, pointsController.getHistory);

export default pointsRoutes;
