import type { Context } from "hono";
import { z } from "zod";
import {
  MarketService,
  type CreateMarketRequest,
  type UpdateMarketRequest,
} from "../services/market.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import {
  createMarketSchema,
  listMarketsSchema,
  updateMarketSchema,
} from "../schemas/market.schema.js";

export class MarketController {
  constructor(private marketService = new MarketService()) {}

  async createMarket(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const request = createMarketSchema.parse(body) as CreateMarketRequest;

      const market = await this.marketService.createMarket(userId, request);

      const logger = c.get("logger");
      logger.info({ userId, marketId: market.id }, "Market created");

      return c.json({ market }, 201);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to create market");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async updateMarket(c: Context) {
    try {
      const userId = c.get("userId");
      const marketId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const request = updateMarketSchema.parse(body) as UpdateMarketRequest;

      const market = await this.marketService.updateMarket(
        marketId,
        userId,
        request
      );

      const logger = c.get("logger");
      logger.info({ userId, marketId }, "Market updated");

      return c.json({ market });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to update market");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async getMarket(c: Context) {
    try {
      const marketId = c.req.param("id");

      const market = await this.marketService.getMarketWithStats(marketId);

      return c.json({ market });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get market");
      return c.json(formatError(error as Error), 500);
    }
  }

  async getMarketBySlug(c: Context) {
    try {
      const slug = c.req.param("slug");

      const market = await this.marketService.getMarketBySlug(slug);

      return c.json({ market });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get market by slug");

      return c.json(formatError(error as Error), 500);
    }
  }

  async listMarkets(c: Context) {
    try {
      const query = c.req.query();
      const params = listMarketsSchema.parse(query);

      const {
        status,
        category,
        creator_user_id,
        search,
        open_after,
        close_before,
        page,
        limit,
        order_by,
        order_dir,
      } = params;

      const result = await this.marketService.listMarkets({
        filters: {
          status,
          category,
          creator_user_id,
          search,
          open_after,
          close_before,
        },
        page,
        limit,
        orderBy: order_by,
        orderDir: order_dir,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to list markets");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async deleteMarket(c: Context) {
    try {
      const userId = c.get("userId");
      const marketId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      await this.marketService.deleteMarket(marketId, userId);

      const logger = c.get("logger");
      logger.info({ userId, marketId }, "Market deleted");

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to delete market");

      return c.json(formatError(error as Error), 500);
    }
  }

  async openMarket(c: Context) {
    try {
      const userId = c.get("userId");
      const marketId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const market = await this.marketService.openMarket(marketId, userId);

      const logger = c.get("logger");
      logger.info({ userId, marketId }, "Market opened");

      return c.json({ market });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to open market");

      return c.json(formatError(error as Error), 500);
    }
  }

  async closeMarket(c: Context) {
    try {
      const userId = c.get("userId");
      const marketId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const market = await this.marketService.closeMarket(marketId, userId);

      const logger = c.get("logger");
      logger.info({ userId, marketId }, "Market closed");

      return c.json({ market });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to close market");

      return c.json(formatError(error as Error), 500);
    }
  }
}
