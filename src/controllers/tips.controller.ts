import type { Context } from "hono";
import { TipSchema } from "../schemas/index.js";
import {
  tipPoints,
  getTipsSent,
  getTipsReceived,
  getUserTipStats,
  getRecentTipActivity,
  getTopTippers,
} from "../services/tips.service.js";
import { storeIdempotentResponse } from "../lib/idempotency.js";

export async function sendTip(c: Context) {
  try {
    const fromUserId = c.get("userId");
    const body = await c.req.json();

    const validatedData = TipSchema.parse(body);

    const result = await tipPoints(fromUserId, validatedData);

    const response = {
      success: true,
      data: {
        tip: result.tip,
        fromBalance: result.fromBalance,
        toBalance: result.toBalance,
      },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to send tip:", error);

    if (error instanceof Error) {
      if (error.message.includes("validation")) {
        return c.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: "Invalid tip data",
            },
          },
          400
        );
      }

      if (
        error.message.includes("not found") ||
        error.message.includes("yourself") ||
        error.message.includes("does not belong")
      ) {
        return c.json(
          {
            error: {
              code: "UNPROCESSABLE_ENTITY",
              message: error.message,
            },
          },
          422
        );
      }

      if (error.message.includes("Insufficient")) {
        return c.json(
          {
            error: {
              code: "UNPROCESSABLE_ENTITY",
              message: error.message,
            },
          },
          422
        );
      }
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to send tip",
        },
      },
      500
    );
  }
}

export async function getSentTips(c: Context) {
  try {
    const userId = c.get("userId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const tips = await getTipsSent(userId, limit, offset);

    return c.json({
      success: true,
      data: { tips },
    });
  } catch (error) {
    console.error("Failed to get sent tips:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get sent tips",
        },
      },
      500
    );
  }
}

export async function getReceivedTips(c: Context) {
  try {
    const userId = c.get("userId");
    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const tips = await getTipsReceived(userId, limit, offset);

    return c.json({
      success: true,
      data: { tips },
    });
  } catch (error) {
    console.error("Failed to get received tips:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get received tips",
        },
      },
      500
    );
  }
}

export async function getTipStats(c: Context) {
  try {
    const userId = c.get("userId");

    const stats = await getUserTipStats(userId);

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Failed to get tip stats:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get tip stats",
        },
      },
      500
    );
  }
}

export async function getRecentActivity(c: Context) {
  try {
    const limit = parseInt(c.req.query("limit") || "20");
    const hours = parseInt(c.req.query("hours") || "24");

    const activity = await getRecentTipActivity(limit, hours);

    return c.json({
      success: true,
      data: { activity },
    });
  } catch (error) {
    console.error("Failed to get recent tip activity:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get recent tip activity",
        },
      },
      500
    );
  }
}

export async function useGetTopTippers(c: Context) {
  try {
    const period =
      (c.req.query("period") as "daily" | "weekly" | "monthly") || "weekly";
    const limit = parseInt(c.req.query("limit") || "10");

    const tippers = await getTopTippers(period, limit);

    return c.json({
      success: true,
      data: { tippers },
    });
  } catch (error) {
    console.error("Failed to get top tippers:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get top tippers",
        },
      },
      500
    );
  }
}
