import type { Context } from "hono";
import {
  claimMonthlyPoints,
  getUserBalance,
  getPointsHistory,
} from "../services/points.service.js";
import { storeIdempotentResponse } from "../lib/idempotency.js";

/**
 * Controller for points-related operations
 */

/**
 * Claim monthly points grant
 * POST /points/claim-monthly
 */
export async function claimMonthly(c: Context) {
  try {
    const userId = c.get("userId");

    const result = await claimMonthlyPoints(userId);

    const response = {
      success: true,
      data: {
        balance: result.balance,
        granted: result.granted,
        message:
          result.granted > 0
            ? `Claimed ${result.granted} monthly points`
            : "Monthly points already claimed for this period",
      },
    };

    // Store for idempotency
    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to claim monthly points:", error);

    const errorResponse = {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to claim monthly points",
      },
    };

    return c.json(errorResponse, 500);
  }
}

/**
 * Get user's current points balance
 * GET /points/balance
 */
export async function getBalance(c: Context) {
  try {
    const userId = c.get("userId");

    const balance = await getUserBalance(userId);

    return c.json({
      success: true,
      data: { balance },
    });
  } catch (error) {
    console.error("Failed to get balance:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get balance",
        },
      },
      500
    );
  }
}

/**
 * Get user's points history
 * GET /points/history?limit=50&offset=0
 */
export async function getHistory(c: Context) {
  try {
    const userId = c.get("userId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    if (limit > 100) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Limit cannot exceed 100",
          },
        },
        400
      );
    }

    const history = await getPointsHistory(userId, limit, offset);

    return c.json({
      success: true,
      data: {
        history,
        pagination: {
          limit,
          offset,
          count: history.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get points history:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get points history",
        },
      },
      500
    );
  }
}
