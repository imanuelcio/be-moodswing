/**
 * Service for managing leaderboards and rankings
 */

import { supabaseAdmin } from "../config/supabase.js";
import type { LeaderboardQuery } from "../schemas/index.js";
import type { LeaderboardEntry } from "../types/index.js";

/**
 * Get leaderboard for specified period
 */
export async function getLeaderboard(
  query: LeaderboardQuery
): Promise<LeaderboardEntry[]> {
  const { period } = query;

  try {
    // First try to get from cached leaderboards table
    const cachedLeaderboard = await getCachedLeaderboard(period);

    if (cachedLeaderboard && cachedLeaderboard.length > 0) {
      return cachedLeaderboard;
    }

    // Fallback to live calculation
    return await calculateLiveLeaderboard(period);
  } catch (error) {
    console.error("Failed to get leaderboard:", error);
    throw error;
  }
}

/**
 * Get cached leaderboard from database
 */
async function getCachedLeaderboard(
  period: string
): Promise<LeaderboardEntry[]> {
  try {
    const { data: leaderboard, error } = await supabaseAdmin
      .from("leaderboards")
      .select("*")
      .eq("period", period)
      .order("rank", { ascending: true })
      .limit(100);

    if (error) {
      console.warn("Failed to get cached leaderboard:", error);
      return [];
    }

    return leaderboard || [];
  } catch (error) {
    console.warn("Error accessing cached leaderboard:", error);
    return [];
  }
}

/**
 * Calculate leaderboard live from points_ledger
 */
async function calculateLiveLeaderboard(
  period: string
): Promise<LeaderboardEntry[]> {
  try {
    const timeFilter = getTimeFilter(period);

    // Get PnL data (betting profits/losses)
    let pnlQuery = supabaseAdmin
      .from("points_ledger")
      .select("user_id, delta, ref_id")
      .in("reason", ["bet", "payout"]);

    if (timeFilter) {
      pnlQuery = pnlQuery.gte("created_at", timeFilter.toISOString());
    }

    const { data: pnlData, error: pnlError } = await pnlQuery;

    if (pnlError) {
      throw new Error(`Failed to get PnL data: ${pnlError.message}`);
    }

    // Get resolved positions for accuracy calculation
    const { data: resolvedMarkets, error: marketsError } = await supabaseAdmin
      .from("markets")
      .select("id, resolved_outcome")
      .eq("status", "RESOLVED");

    if (marketsError) {
      throw new Error(
        `Failed to get resolved markets: ${marketsError.message}`
      );
    }

    const resolvedMarketIds = new Set(resolvedMarkets?.map((m) => m.id) || []);
    const marketOutcomes = new Map(
      resolvedMarkets?.map((m) => [m.id, m.resolved_outcome]) || []
    );

    // Get positions for accuracy calculation
    let positionsQuery = supabaseAdmin
      .from("positions")
      .select("user_id, market_id, side")
      .in("market_id", Array.from(resolvedMarketIds));

    if (timeFilter) {
      positionsQuery = positionsQuery.gte(
        "created_at",
        timeFilter.toISOString()
      );
    }

    const { data: positions, error: positionsError } = await positionsQuery;

    if (positionsError) {
      throw new Error(`Failed to get positions: ${positionsError.message}`);
    }

    // Calculate user stats
    const userStats = new Map<
      string,
      {
        pnl: number;
        correctPredictions: number;
        totalPredictions: number;
      }
    >();

    // Process PnL data
    for (const record of pnlData || []) {
      const existing = userStats.get(record.user_id) || {
        pnl: 0,
        correctPredictions: 0,
        totalPredictions: 0,
      };
      existing.pnl += record.delta;
      userStats.set(record.user_id, existing);
    }

    // Process accuracy data
    for (const position of positions || []) {
      if (!resolvedMarketIds.has(position.market_id)) continue;

      const existing = userStats.get(position.user_id) || {
        pnl: 0,
        correctPredictions: 0,
        totalPredictions: 0,
      };

      existing.totalPredictions += 1;

      const outcome = marketOutcomes.get(position.market_id);
      if (outcome === position.side) {
        existing.correctPredictions += 1;
      }

      userStats.set(position.user_id, existing);
    }

    // Convert to leaderboard entries and rank
    const entries: LeaderboardEntry[] = Array.from(userStats.entries())
      .map(([userId, stats]) => ({
        user_id: userId,
        pnl: stats.pnl,
        accuracy:
          stats.totalPredictions > 0
            ? stats.correctPredictions / stats.totalPredictions
            : 0,
        rank: 0, // Will be set below
      }))
      .sort((a, b) => {
        // Primary sort: PnL descending
        if (b.pnl !== a.pnl) return b.pnl - a.pnl;
        // Secondary sort: Accuracy descending
        return b.accuracy - a.accuracy;
      });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return entries.slice(0, 100); // Top 100
  } catch (error) {
    console.error("Failed to calculate live leaderboard:", error);
    throw error;
  }
}

/**
 * Get enhanced leaderboard with user details
 */
export async function getEnhancedLeaderboard(
  query: LeaderboardQuery
): Promise<any[]> {
  try {
    const leaderboard = await getLeaderboard(query);

    if (leaderboard.length === 0) {
      return [];
    }

    const userIds = leaderboard.map((entry) => entry.user_id);

    // Get user details
    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, address")
      .in("id", userIds);

    if (usersError) {
      throw new Error(`Failed to get user details: ${usersError.message}`);
    }

    const userMap = new Map(users?.map((u) => [u.id, u]) || []);

    // Combine leaderboard with user details
    return leaderboard.map((entry) => ({
      ...entry,
      user: userMap.get(entry.user_id) || {
        id: entry.user_id,
        address: "Unknown",
      },
    }));
  } catch (error) {
    console.error("Failed to get enhanced leaderboard:", error);
    throw error;
  }
}

/**
 * Update cached leaderboard (for admin/cron use)
 */
export async function updateCachedLeaderboard(period: string): Promise<void> {
  try {
    const leaderboard = await calculateLiveLeaderboard(period);

    if (leaderboard.length === 0) {
      console.log(`No data for leaderboard period: ${period}`);
      return;
    }

    // Clear existing cached data for this period
    const { error: deleteError } = await supabaseAdmin
      .from("leaderboards")
      .delete()
      .eq("period", period);

    if (deleteError) {
      console.warn("Failed to clear old leaderboard cache:", deleteError);
    }

    // Insert new leaderboard data
    const leaderboardRecords = leaderboard.map((entry) => ({
      period,
      user_id: entry.user_id,
      pnl: entry.pnl,
      accuracy: entry.accuracy,
      rank: entry.rank,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("leaderboards")
      .insert(leaderboardRecords);

    if (insertError) {
      throw new Error(`Failed to cache leaderboard: ${insertError.message}`);
    }

    console.log(
      `Updated cached leaderboard for ${period}: ${leaderboard.length} entries`
    );
  } catch (error) {
    console.error("Failed to update cached leaderboard:", error);
    throw error;
  }
}

/**
 * Get user's position in leaderboard
 */
export async function getUserLeaderboardPosition(
  userId: string,
  period: string
): Promise<{ rank: number; pnl: number; accuracy: number } | null> {
  try {
    // Try cached first
    const { data: cached, error: cachedError } = await supabaseAdmin
      .from("leaderboards")
      .select("rank, pnl, accuracy")
      .eq("period", period)
      .eq("user_id", userId)
      .single();

    if (cached && !cachedError) {
      return cached;
    }

    // Calculate live
    const leaderboard = await calculateLiveLeaderboard(period);
    const userEntry = leaderboard.find((entry) => entry.user_id === userId);

    return userEntry
      ? {
          rank: userEntry.rank,
          pnl: userEntry.pnl,
          accuracy: userEntry.accuracy,
        }
      : null;
  } catch (error) {
    console.error("Failed to get user leaderboard position:", error);
    return null;
  }
}

/**
 * Get time filter for period
 */
function getTimeFilter(period: string): Date | null {
  const now = new Date();

  switch (period) {
    case "daily":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "monthly":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null; // All time
  }
}

/**
 * Get leaderboard summary stats
 */
export async function getLeaderboardStats(period: string): Promise<{
  totalUsers: number;
  totalPnL: number;
  averageAccuracy: number;
  topPnL: number;
}> {
  try {
    const leaderboard = await getLeaderboard({ period: period as any });

    if (leaderboard.length === 0) {
      return {
        totalUsers: 0,
        totalPnL: 0,
        averageAccuracy: 0,
        topPnL: 0,
      };
    }

    const totalPnL = leaderboard.reduce((sum, entry) => sum + entry.pnl, 0);
    const averageAccuracy =
      leaderboard.reduce((sum, entry) => sum + entry.accuracy, 0) /
      leaderboard.length;
    const topPnL = leaderboard[0]?.pnl || 0;

    return {
      totalUsers: leaderboard.length,
      totalPnL,
      averageAccuracy,
      topPnL,
    };
  } catch (error) {
    console.error("Failed to get leaderboard stats:", error);
    return {
      totalUsers: 0,
      totalPnL: 0,
      averageAccuracy: 0,
      topPnL: 0,
    };
  }
}
