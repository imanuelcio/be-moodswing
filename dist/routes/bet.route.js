import { Hono } from "hono";
import { BetController } from "../controllers/bet.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";
import { createRateLimitMiddleware, publicRateLimit, } from "../core/rateLimit.js";
const bet = new Hono();
const betController = new BetController();
// Public endpoints (with rate limiting)
bet.use("/public/*", createRateLimitMiddleware(publicRateLimit));
bet.get("/public", betController.listBets.bind(betController));
bet.get("/public/:id", betController.getBet.bind(betController));
bet.get("/public/market/:marketId", betController.getMarketBets.bind(betController));
bet.get("/public/stats", betController.getBetStats.bind(betController));
// Protected endpoints (require JWT)
bet.use("/*", createJwtMiddleware());
// User bet operations
bet.post("/", betController.placeBet.bind(betController));
bet.get("/me", betController.getUserBets.bind(betController));
bet.post("/:id/cancel", betController.cancelBet.bind(betController));
export { bet };
