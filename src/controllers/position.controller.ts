import type { Context } from "hono";
import { z } from "zod";
import { PositionService } from "../services/position.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import { closePositionSchema } from "../schemas/position.schema.js";

export class PositionController {
  constructor(private positionService = new PositionService()) {}

  async getUserPositions(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const query = c.req.query();
      const marketId = query.marketId;
      const minQuantity = query.minQuantity
        ? parseFloat(query.minQuantity)
        : undefined;
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      const result = await this.positionService.getUserPositions(userId, {
        marketId,
        minQuantity,
        page,
        limit,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get user positions");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getMarketPositions(c: Context) {
    try {
      const marketId = c.req.param("marketId");
      const query = c.req.query();
      const outcomeId = query.outcomeId;
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      const result = await this.positionService.getMarketPositions(marketId, {
        outcomeId,
        page,
        limit,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get market positions");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getPosition(c: Context) {
    try {
      const userId = c.get("userId");
      const positionId = c.req.param("id");

      const position = await this.positionService.getPosition(
        positionId,
        userId
      );

      return c.json({ position });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get position");

      return c.json(formatError(error as Error), 500);
    }
  }

  async closePosition(c: Context) {
    try {
      const userId = c.get("userId");
      const positionId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const { quantity, price } = closePositionSchema.parse(body);

      const result = await this.positionService.closePosition(
        positionId,
        userId,
        {
          quantity,
          price,
        }
      );

      const logger = c.get("logger");
      logger.info({ userId, positionId }, "Position closed");

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to close position");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async getPositionStats(c: Context) {
    try {
      const query = c.req.query();
      const userId = query.userId;
      const marketId = query.marketId;

      const stats = await this.positionService.getPositionStats({
        userId,
        marketId,
      });

      return c.json({ stats });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get position stats");

      return c.json(formatError(error as Error), 500);
    }
  }
}
