import { Hono } from "hono";
import { PositionController } from "../controllers/position.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";
import { createRateLimitMiddleware, publicRateLimit, } from "../core/rateLimit.js";
const position = new Hono();
const positionController = new PositionController();
// Public endpoints (with rate limiting)
position.use("/public/*", createRateLimitMiddleware(publicRateLimit));
position.get("/public/market/:marketId", positionController.getMarketPositions.bind(positionController));
position.get("/public/stats", positionController.getPositionStats.bind(positionController));
// Protected endpoints (require JWT)
position.use("/*", createJwtMiddleware());
// User position operations
position.get("/me", positionController.getUserPositions.bind(positionController));
position.get("/:id", positionController.getPosition.bind(positionController));
position.post("/:id/close", positionController.closePosition.bind(positionController));
export { position };
