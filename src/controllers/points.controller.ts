import type { Context } from "hono";
import { z } from "zod";
import { PointsService } from "../services/points.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import {
  awardPointsSchema,
  bulkAwardSchema,
  transferPointsSchema,
} from "../schemas/point.schema.js";

export class PointsController {
  constructor(private pointsService = new PointsService()) {}

  async getUserBalance(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const balance = await this.pointsService.getUserBalance(userId);

      return c.json({ balance });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get user balance");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getUserHistory(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const query = c.req.query();
      const reason = query.reason;
      const refType = query.refType;
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "50");

      const result = await this.pointsService.getUserHistory(userId, {
        reason,
        refType,
        page,
        limit,
      });

      return c.json(result);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get user points history");

      return c.json(formatError(error as Error), 500);
    }
  }

  async transferPoints(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      const body = await c.req.json();
      const { toUserId, amount, reason } = transferPointsSchema.parse(body);

      await this.pointsService.transferPoints(userId, toUserId, amount, reason);

      const logger = c.get("logger");
      logger.info(
        { fromUserId: userId, toUserId, amount },
        "Points transferred"
      );

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to transfer points");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async claimDailyBonus(c: Context) {
    try {
      const userId = c.get("userId");
      if (!userId) {
        return c.json(
          formatError(new ValidationError("User ID required")),
          401
        );
      }

      await this.pointsService.awardDailyBonus(userId);

      const logger = c.get("logger");
      logger.info({ userId }, "Daily bonus claimed");

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to claim daily bonus");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getPointsStats(c: Context) {
    try {
      const query = c.req.query();
      const userId = query.userId;
      const period = query.period || "all";

      const stats = await this.pointsService.getPointsStats({
        userId,
        period,
      });

      return c.json({ stats });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get points stats");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getLeaderboard(c: Context) {
    try {
      const query = c.req.query();
      const limit = parseInt(query.limit || "100");
      const period = query.period || "all";

      const leaderboard = await this.pointsService.getLeaderboard({
        limit,
        period,
      });

      return c.json({ leaderboard });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get points leaderboard");

      return c.json(formatError(error as Error), 500);
    }
  }

  // Admin endpoints
  async awardPoints(c: Context) {
    try {
      const body = await c.req.json();
      const { userId, amount, reason, metadata } =
        awardPointsSchema.parse(body);

      await this.pointsService.addPoints(userId, amount, reason, metadata);

      const logger = c.get("logger");
      logger.info({ userId, amount, reason }, "Points awarded (admin)");

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to award points");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }

  async bulkAwardPoints(c: Context) {
    try {
      const body = await c.req.json();
      const { awards } = bulkAwardSchema.parse(body);

      await this.pointsService.bulkAwardPoints(awards);

      const logger = c.get("logger");
      logger.info({ count: awards.length }, "Bulk points awarded (admin)");

      return c.json({ success: true, count: awards.length });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to bulk award points");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), 500);
    }
  }
}
