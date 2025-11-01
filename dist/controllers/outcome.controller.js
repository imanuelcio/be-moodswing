import { z } from "zod";
import { OutcomeRepository, } from "../repo/outcome.repo.js";
import { MarketRepository } from "../repo/market.repo.js";
import { formatError, ValidationError, NotFoundError, ForbiddenError, } from "../core/errors.js";
import { createOutcomeSchema, updateOutcomeSchema, } from "../schemas/outcome.schema.js";
export class OutcomeController {
    outcomeRepo;
    marketRepo;
    constructor(outcomeRepo = new OutcomeRepository(), marketRepo = new MarketRepository()) {
        this.outcomeRepo = outcomeRepo;
        this.marketRepo = marketRepo;
    }
    async createOutcome(c) {
        try {
            const userId = c.get("userId");
            const marketId = c.req.param("marketId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            // Check if market exists and user can modify it
            const market = await this.marketRepo.findById(marketId);
            if (!market) {
                return c.json(formatError(new NotFoundError("Market", marketId)), 404);
            }
            if (market.creator_user_id !== userId) {
                return c.json(formatError(new ForbiddenError("Only market creator can add outcomes")), 403);
            }
            if (market.status !== "draft") {
                return c.json(formatError(new ValidationError("Can only add outcomes to draft markets")), 400);
            }
            const body = await c.req.json();
            const { key, name, initial_price } = createOutcomeSchema.parse(body);
            // Check if outcome key already exists for this market
            const existingOutcome = await this.outcomeRepo.findByMarketAndKey(marketId, key);
            if (existingOutcome) {
                return c.json(formatError(new ValidationError(`Outcome with key '${key}' already exists`)), 409);
            }
            const outcomeData = {
                market_id: marketId,
                key,
                name,
                initial_price,
            };
            const outcome = await this.outcomeRepo.create(outcomeData);
            const logger = c.get("logger");
            logger.info({ userId, marketId, outcomeId: outcome.id }, "Outcome created");
            return c.json({ outcome }, 201);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to create outcome");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async updateOutcome(c) {
        try {
            const userId = c.get("userId");
            const marketId = c.req.param("marketId");
            const outcomeId = c.req.param("id");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            // Check if market exists and user can modify it
            const market = await this.marketRepo.findById(marketId);
            if (!market) {
                return c.json(formatError(new NotFoundError("Market", marketId)), 404);
            }
            if (market.creator_user_id !== userId) {
                return c.json(formatError(new ForbiddenError("Only market creator can update outcomes")), 403);
            }
            if (market.status !== "draft") {
                return c.json(formatError(new ValidationError("Can only update outcomes in draft markets")), 400);
            }
            // Check if outcome exists and belongs to the market
            const outcome = await this.outcomeRepo.findById(outcomeId);
            if (!outcome || outcome.market_id !== marketId) {
                return c.json(formatError(new NotFoundError("Outcome")), 404);
            }
            const body = await c.req.json();
            const updateData = updateOutcomeSchema.parse(body);
            const updatedOutcome = await this.outcomeRepo.update(outcomeId, updateData);
            const logger = c.get("logger");
            logger.info({ userId, marketId, outcomeId }, "Outcome updated");
            return c.json({ outcome: updatedOutcome });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to update outcome");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async deleteOutcome(c) {
        try {
            const userId = c.get("userId");
            const marketId = c.req.param("marketId");
            const outcomeId = c.req.param("id");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            // Check if market exists and user can modify it
            const market = await this.marketRepo.findById(marketId);
            if (!market) {
                return c.json(formatError(new NotFoundError("Market", marketId)), 404);
            }
            if (market.creator_user_id !== userId) {
                return c.json(formatError(new ForbiddenError("Only market creator can delete outcomes")), 403);
            }
            if (market.status !== "draft") {
                return c.json(formatError(new ValidationError("Can only delete outcomes from draft markets")), 400);
            }
            // Check if outcome exists and belongs to the market
            const outcome = await this.outcomeRepo.findById(outcomeId);
            if (!outcome || outcome.market_id !== marketId) {
                return c.json(formatError(new NotFoundError("Outcome")), 404);
            }
            // Check if this would leave less than 2 outcomes
            const allOutcomes = await this.outcomeRepo.findByMarket(marketId);
            if (allOutcomes.length <= 2) {
                return c.json(formatError(new ValidationError("Market must have at least 2 outcomes")), 400);
            }
            await this.outcomeRepo.delete(outcomeId);
            const logger = c.get("logger");
            logger.info({ userId, marketId, outcomeId }, "Outcome deleted");
            return c.json({ success: true });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to delete outcome");
            return c.json(formatError(error), 500);
        }
    }
    async getOutcome(c) {
        try {
            const outcomeId = c.req.param("id");
            const outcome = await this.outcomeRepo.findById(outcomeId);
            if (!outcome) {
                return c.json(formatError(new NotFoundError("Outcome", outcomeId)), 404);
            }
            const stats = await this.outcomeRepo.getOutcomeStats(outcomeId);
            return c.json({
                outcome: { ...outcome, stats },
            });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get outcome");
            return c.json(formatError(error), 500);
        }
    }
    async listOutcomes(c) {
        try {
            const marketId = c.req.param("marketId");
            // Check if market exists
            const market = await this.marketRepo.findById(marketId);
            if (!market) {
                return c.json(formatError(new NotFoundError("Market", marketId)), 404);
            }
            const outcomes = await this.outcomeRepo.getOutcomesWithStats(marketId);
            return c.json({ outcomes });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to list outcomes");
            return c.json(formatError(error), 500);
        }
    }
}
