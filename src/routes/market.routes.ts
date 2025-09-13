import { Hono } from "hono";
import * as marketsController from "../controllers/markets.controller.js";
import {
  authMiddleware,
  optionalAuth,
  requireAdmin,
} from "../middleware/auth.js";
const marketsRoutes = new Hono();
marketsRoutes.get("/", optionalAuth(), marketsController.getMarkets);
marketsRoutes.get("/:id", optionalAuth(), marketsController.getMarketById);
marketsRoutes.post(
  "/",
  authMiddleware,
  requireAdmin(),
  marketsController.createNewMarket
);
marketsRoutes.post("/:id/bet", authMiddleware, marketsController.placeBet);
marketsRoutes.post(
  "/:id/close",
  authMiddleware,
  requireAdmin(),
  marketsController.closeMarketById
);
marketsRoutes.post(
  "/:id/resolve",
  authMiddleware,
  requireAdmin(),
  marketsController.resolveMarketById
);
marketsRoutes.get("/positions", authMiddleware, marketsController.getPositions);

export default marketsRoutes;
