import { z } from "zod";
import { ResolutionService, } from "../services/resolution.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import { listResolutionsSchema, resolveMarketSchema, updateResolutionSchema, } from "../schemas/resolution.schema.js";
export class ResolutionController {
    resolutionService;
    constructor(resolutionService = new ResolutionService()) {
        this.resolutionService = resolutionService;
    }
    async resolveMarket(c) {
        try {
            const marketId = c.req.param("marketId");
            const userId = c.get("userId"); // From admin middleware
            const body = await c.req.json();
            const request = resolveMarketSchema.parse(body);
            const result = await this.resolutionService.resolveMarket(marketId, request, userId);
            const logger = c.get("logger");
            logger.info({
                marketId,
                resolutionId: result.resolution.id,
                outcomeKey: request.outcomeKey,
                userId,
            }, "Market resolved");
            return c.json(result, 201);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to resolve market");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async getResolution(c) {
        try {
            const resolutionId = c.req.param("id");
            const resolution = await this.resolutionService.getResolution(resolutionId);
            return c.json({ resolution });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get resolution");
            return c.json(formatError(error), 500);
        }
    }
    async getMarketResolution(c) {
        try {
            const marketId = c.req.param("marketId");
            const resolution = await this.resolutionService.getMarketResolution(marketId);
            return c.json({ resolution });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get market resolution");
            return c.json(formatError(error), 500);
        }
    }
    async listResolutions(c) {
        try {
            const query = c.req.query();
            const params = listResolutionsSchema.parse(query);
            const { source, marketId, page, limit, order_by, order_dir } = params;
            const result = await this.resolutionService.listResolutions({
                source,
                marketId,
                page,
                limit,
                orderBy: order_by,
                orderDir: order_dir,
            });
            return c.json(result);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to list resolutions");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async updateResolution(c) {
        try {
            const resolutionId = c.req.param("id");
            const userId = c.get("userId");
            const body = await c.req.json();
            const updateData = updateResolutionSchema.parse(body);
            const resolution = await this.resolutionService.updateResolution(resolutionId, updateData, userId);
            const logger = c.get("logger");
            logger.info({ resolutionId, userId }, "Resolution updated");
            return c.json({ resolution });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to update resolution");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async validateResolution(c) {
        try {
            const marketId = c.req.param("marketId");
            const validation = await this.resolutionService.validateResolutionEligibility(marketId);
            return c.json({ validation });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to validate resolution");
            return c.json(formatError(error), 500);
        }
    }
    async getResolutionStats(c) {
        try {
            const query = c.req.query();
            const source = query.source;
            const period = query.period || "all";
            const stats = await this.resolutionService.getResolutionStats({
                source,
                period,
            });
            return c.json({ stats });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get resolution stats");
            return c.json(formatError(error), 500);
        }
    }
}
