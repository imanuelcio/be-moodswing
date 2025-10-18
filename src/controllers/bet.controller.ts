import type { Context } from "hono";
import { z } from "zod";
import { BetService, type PlaceBetRequest } from "../services/bet.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import { listBetsSchema, placeBetSchema } from "../schemas/bet.schema.js";

export class BetController {
  constructor(private betService = new BetService()) {}

  async placeBet(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const request = placeBetSchema.parse(body) as PlaceBetRequest;

      const result = await this.betService.placeBet(userId, request);

      const logger = c.get("logger");
      logger.info(
        {
          userId,
          betId: result.bet.id,
          marketId: request.marketId,
          outcomeKey: request.outcomeKey,
          stake: request.stakePoints || request.stakeTokenAmount,
        },
        "Bet placed"
      );

      return c.json(
        {
          bet: result.bet,
          position: result.position,
          pointsEntry: result.pointsEntry,
        },
        201
      );
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to place bet");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async getBet(c: Context) {
    try {
      const userId = c.get("userId");
      const betId = c.req.param("id");

      const bet = await this.betService.getBet(betId, userId);

      return c.json({ bet });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get bet");

      return c.json(formatError(error as Error), 500);
    }
  }

  async listBets(c: Context) {
    try {
      const query = c.req.query();
      const params = listBetsSchema.parse(query);

      const {
        user_id,
        market_id,
        outcome_id,
        status,
        side,
        created_after,
        created_before,
        page,
        limit,
        order_by,
        order_dir,
      } = params;

      const result = await this.betService.listBets({
        filters: {
          user_id,
          market_id,
          outcome_id,
          status,
          side,
          created_after,
          created_before,
        },
        page,
        limit,
        orderBy: order_by,
        orderDir: order_dir,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to list bets");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async getUserBets(c: Context) {
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
      const status = query.status ? query.status.split(",") : undefined;
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      const result = await this.betService.getUserBets(userId, {
        marketId,
        status,
        page,
        limit,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get user bets");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getMarketBets(c: Context) {
    try {
      const marketId = c.req.param("marketId");
      const query = c.req.query();
      const outcomeId = query.outcomeId;
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      const result = await this.betService.getMarketBets(marketId, {
        outcomeId,
        page,
        limit,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get market bets");

      return c.json(formatError(error as Error), 500);
    }
  }

  async cancelBet(c: Context) {
    try {
      const userId = c.get("userId");
      const betId = c.req.param("id");

      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const bet = await this.betService.cancelBet(betId, userId);

      const logger = c.get("logger");
      logger.info({ userId, betId }, "Bet cancelled");

      return c.json({ bet });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to cancel bet");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getBetStats(c: Context) {
    try {
      const query = c.req.query();
      const userId = query.userId;
      const marketId = query.marketId;
      const period = query.period || "all";

      const stats = await this.betService.getBetStats({
        userId,
        marketId,
        period,
      });

      return c.json({ stats });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get bet stats");

      return c.json(formatError(error as Error), 500);
    }
  }
}
