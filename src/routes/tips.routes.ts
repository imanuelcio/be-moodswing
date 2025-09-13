import { Hono } from "hono";
import * as tipsController from "../controllers/tips.controller.js";
import { authMiddleware } from "../middleware/auth.js";
const tipsRoutes = new Hono();
tipsRoutes.post("/", authMiddleware, tipsController.sendTip);
tipsRoutes.get("/sent", authMiddleware, tipsController.getSentTips);
tipsRoutes.get("/received", authMiddleware, tipsController.getReceivedTips);
tipsRoutes.get("/stats", authMiddleware, tipsController.getTipStats);
tipsRoutes.get("/activity", tipsController.getRecentActivity);
tipsRoutes.get("/leaderboard", tipsController.useGetTopTippers);

export default tipsRoutes;
