import type { Context } from "hono";
import { LeaderboardQuerySchema } from "../schemas/index.js";
import {
  getEnhancedLeaderboard,
  getUserLeaderboardPosition,
  getLeaderboardStats,
  updateCachedLeaderboard,
} from "../services/leaderboard.service.js";
import { ApiResponseBuilder } from "../utils/apiResponse.js";

export async function getLeaderboard(c: Context) {
  try {
    const period = c.req.query("period") || "weekly";
    const validatedQuery = LeaderboardQuerySchema.parse({ period });

    const leaderboard = await getEnhancedLeaderboard(validatedQuery);

    return ApiResponseBuilder.success(c, {
      leaderboard,
      "Success message": `Leaderboard fetched for period: ${period}`,
    });
  } catch (error) {
    console.error("Failed to get leaderboard:", error);
    return ApiResponseBuilder.error(c, "Failed to get leaderboard");
  }
}

export async function getUserPosition(c: Context) {
  try {
    const userId = c.req.param("userId");
    const period = c.req.query("period") || "weekly";

    const position = await getUserLeaderboardPosition(userId, period);

    return ApiResponseBuilder.success(c, {
      position,
      "Success message": `User position fetched for period: ${period}`,
    });
  } catch (error) {
    console.error("Failed to get user position:", error);
    return ApiResponseBuilder.error(c, "Failed to get user position");
  }
}

export async function getStats(c: Context) {
  try {
    const period = c.req.query("period") || "weekly";

    const stats = await getLeaderboardStats(period);

    return ApiResponseBuilder.success(
      c,
      stats,
      `Leaderboard stats fetched for period: ${period}`
    );
  } catch (error) {
    console.error("Failed to get leaderboard stats:", error);
    return ApiResponseBuilder.error(c, "Failed to get leaderboard stats");
  }
}

export async function refreshLeaderboard(c: Context) {
  try {
    const period = c.req.query("period") || "weekly";

    await updateCachedLeaderboard(period);

    return ApiResponseBuilder.success(c, {
      "Success message": `Leaderboard refreshed for period: ${period}`,
    });
  } catch (error) {
    console.error("Failed to refresh leaderboard:", error);
    return ApiResponseBuilder.error(c, "Failed to refresh leaderboard");
  }
}
