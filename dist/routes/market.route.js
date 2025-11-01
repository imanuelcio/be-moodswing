import { Hono } from "hono";
import { MarketController } from "../controllers/market.controller.js";
import { OutcomeController } from "../controllers/outcome.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";
import { createRateLimitMiddleware, publicRateLimit, } from "../core/rateLimit.js";
const market = new Hono();
const marketController = new MarketController();
const outcomeController = new OutcomeController();
// Public endpoints (with rate limiting)
market.use("/public/*", createRateLimitMiddleware(publicRateLimit));
market.get("/public", marketController.listMarkets.bind(marketController));
market.get("/public/:id", marketController.getMarket.bind(marketController));
market.get("/public/slug/:slug", marketController.getMarketBySlug.bind(marketController));
market.get("/public/:marketId/outcomes", outcomeController.listOutcomes.bind(outcomeController));
market.get("/public/outcomes/:id", outcomeController.getOutcome.bind(outcomeController));
// Protected endpoints (require JWT)
market.use("/*", createJwtMiddleware());
// Market CRUD
market.post("/", marketController.createMarket.bind(marketController));
market.put("/:id", marketController.updateMarket.bind(marketController));
market.delete("/:id", marketController.deleteMarket.bind(marketController));
// Market actions
market.post("/:id/open", marketController.openMarket.bind(marketController));
market.post("/:id/close", marketController.closeMarket.bind(marketController));
// Outcome CRUD (nested under markets)
market.post("/:marketId/outcomes", outcomeController.createOutcome.bind(outcomeController));
market.put("/:marketId/outcomes/:id", outcomeController.updateOutcome.bind(outcomeController));
market.delete("/:marketId/outcomes/:id", outcomeController.deleteOutcome.bind(outcomeController));
export { market };
