// /services/airdrop.ts

import { supabaseAdmin } from "../config/supabase.js";
import type { AirdropSnapshotInput } from "../schemas/index.js";
import { calculateUserPnL, getUserBalance } from "./points.service.js";

/**
 * Service for managing airdrop snapshots and calculations
 */

/**
 * Create airdrop snapshot for a given period (admin only)
 */
export async function createSnapshot(
  params: AirdropSnapshotInput
): Promise<string> {
  const { period } = params;

  try {
    // Check if snapshot already exists for this period
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("airdrop_snapshots")
      .select("id")
      .eq("period", period)
      .limit(1);

    if (existingError && existingError.code !== "PGRST116") {
      throw new Error(
        `Failed to check existing snapshot: ${existingError.message}`
      );
    }

    if (existing && existing.length > 0) {
      throw new Error(`Snapshot already exists for period: ${period}`);
    }

    // Get all users with activity
    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, address, created_at");

    if (usersError) {
      throw new Error(`Failed to get users: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      throw new Error("No users found for snapshot");
    }

    console.log(`Creating snapshot for ${users.length} users`);

    // Calculate metrics for each user
    const snapshotData = [];

    for (const user of users) {
      try {
        const [balance, pnl, accuracy] = await Promise.all([
          getUserBalance(user.id),
          calculateUserPnL(user.id),
          calculateUserAccuracy(user.id),
        ]);

        // Calculate airdrop score using a simple formula
        // This can be customized based on your tokenomics
        const airdropScore = calculateAirdropScore(balance, pnl, accuracy);

        snapshotData.push({
          period,
          user_id: user.id,
          points_balance: balance,
          pnl: pnl,
          accuracy: accuracy,
          airdrop_score: airdropScore,
        });
      } catch (error) {
        console.error(
          `Failed to calculate metrics for user ${user.id}:`,
          error
        );
        // Continue with other users
      }
    }

    if (snapshotData.length === 0) {
      throw new Error("No valid user data for snapshot");
    }

    // Insert snapshot data
    const { error: insertError } = await supabaseAdmin
      .from("airdrop_snapshots")
      .insert(snapshotData);

    if (insertError) {
      throw new Error(`Failed to insert snapshot data: ${insertError.message}`);
    }

    // Generate CSV file
    const csvFilename = await generateSnapshotCSV(period, snapshotData);

    console.log(
      `Airdrop snapshot created: ${snapshotData.length} users, file: ${csvFilename}`
    );

    return csvFilename;
  } catch (error) {
    console.error("Failed to create airdrop snapshot:", error);
    throw error;
  }
}

/**
 * Calculate user accuracy from resolved markets
 */
async function calculateUserAccuracy(userId: string): Promise<number> {
  try {
    // Get user positions in resolved markets
    const { data: positions, error: positionsError } = await supabaseAdmin
      .from("positions")
      .select(
        `
        side,
        markets!inner (
          resolved_outcome,
          status
        )
      `
      )
      .eq("user_id", userId)
      .eq("markets.status", "RESOLVED");

    if (positionsError) {
      console.warn(
        `Failed to get positions for user ${userId}:`,
        positionsError
      );
      return 0;
    }

    if (!positions || positions.length === 0) {
      return 0;
    }

    const correctPredictions = positions.filter(
      (position) => position.side === position.markets[0].resolved_outcome
    ).length;

    return correctPredictions / positions.length;
  } catch (error) {
    console.warn(`Error calculating accuracy for user ${userId}:`, error);
    return 0;
  }
}

/**
 * Calculate airdrop score based on user metrics
 * This is a simple formula - customize based on your tokenomics
 */
function calculateAirdropScore(
  balance: number,
  pnl: number,
  accuracy: number
): number {
  // Simple scoring formula (can be made more sophisticated)
  const balanceScore = Math.min(balance / 1000, 100); // Cap at 100 points for balance
  const pnlScore = Math.max(pnl / 100, 0); // Positive PnL only
  const accuracyScore = accuracy * 50; // Up to 50 points for 100% accuracy

  return Math.round(balanceScore + pnlScore + accuracyScore);
}

/**
 * Generate CSV file for airdrop snapshot
 */
async function generateSnapshotCSV(
  period: string,
  data: any[]
): Promise<string> {
  try {
    // Get user addresses for the CSV
    const userIds = data.map((row) => row.user_id);
    const { data: users, error: usersError } = await supabaseAdmin
      .from("users")
      .select("id, address")
      .in("id", userIds);

    if (usersError) {
      throw new Error(`Failed to get user addresses: ${usersError.message}`);
    }

    const userMap = new Map(users?.map((u) => [u.id, u.address]) || []);

    // Create CSV content
    const headers = [
      "address",
      "user_id",
      "points_balance",
      "pnl",
      "accuracy",
      "airdrop_score",
    ];
    const csvRows = [headers.join(",")];

    // Sort by airdrop score descending
    const sortedData = data.sort((a, b) => b.airdrop_score - a.airdrop_score);

    for (const row of sortedData) {
      const address = userMap.get(row.user_id) || "unknown";
      const csvRow = [
        address,
        row.user_id,
        row.points_balance,
        row.pnl,
        row.accuracy.toFixed(4),
        row.airdrop_score,
      ];
      csvRows.push(csvRow.join(","));
    }

    const csvContent = csvRows.join("\n");
    const filename = `snapshot_${period}.csv`;

    // In a real application, you'd save this to a file system or cloud storage
    // For this example, we'll store it in a simple way
    console.log(`Generated CSV with ${sortedData.length} rows`);

    // TODO: Save to actual file system or cloud storage
    // For now, we'll just return the filename
    return filename;
  } catch (error) {
    console.error("Failed to generate CSV:", error);
    throw error;
  }
}

/**
 * Get airdrop snapshot data for a period
 */
export async function getSnapshotData(
  period: string,
  limit: number = 100,
  offset: number = 0
): Promise<any[]> {
  try {
    const { data: snapshot, error } = await supabaseAdmin
      .from("airdrop_snapshots")
      .select(
        `
        *,
        users (address)
      `
      )
      .eq("period", period)
      .order("airdrop_score", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get snapshot data: ${error.message}`);
    }

    return snapshot || [];
  } catch (error) {
    console.error("Failed to get snapshot data:", error);
    throw error;
  }
}

/**
 * Get available snapshot periods
 */
export async function getSnapshotPeriods(): Promise<string[]> {
  try {
    const { data: periods, error } = await supabaseAdmin
      .from("airdrop_snapshots")
      .select("period")
      .order("period", { ascending: false });
    //   .group("period");

    if (error) {
      throw new Error(`Failed to get snapshot periods: ${error.message}`);
    }

    return periods?.map((p) => p.period) || [];
  } catch (error) {
    console.error("Failed to get snapshot periods:", error);
    throw error;
  }
}

/**
 * Get user's airdrop allocation for a period
 */
export async function getUserAirdropAllocation(
  userId: string,
  period: string
): Promise<any | null> {
  try {
    const { data: allocation, error } = await supabaseAdmin
      .from("airdrop_snapshots")
      .select("*")
      .eq("period", period)
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      throw new Error(`Failed to get user allocation: ${error.message}`);
    }

    return allocation;
  } catch (error) {
    console.error("Failed to get user airdrop allocation:", error);
    return null;
  }
}

/**
 * Get airdrop snapshot statistics
 */
export async function getSnapshotStats(period: string): Promise<{
  totalUsers: number;
  totalScore: number;
  averageScore: number;
  topScore: number;
  totalBalance: number;
  totalPnL: number;
}> {
  try {
    const { data: stats, error } = await supabaseAdmin
      .from("airdrop_snapshots")
      .select("airdrop_score, points_balance, pnl")
      .eq("period", period);

    if (error) {
      throw new Error(`Failed to get snapshot stats: ${error.message}`);
    }

    if (!stats || stats.length === 0) {
      return {
        totalUsers: 0,
        totalScore: 0,
        averageScore: 0,
        topScore: 0,
        totalBalance: 0,
        totalPnL: 0,
      };
    }

    const totalUsers = stats.length;
    const totalScore = stats.reduce((sum, row) => sum + row.airdrop_score, 0);
    const averageScore = totalScore / totalUsers;
    const topScore = Math.max(...stats.map((row) => row.airdrop_score));
    const totalBalance = stats.reduce(
      (sum, row) => sum + row.points_balance,
      0
    );
    const totalPnL = stats.reduce((sum, row) => sum + row.pnl, 0);

    return {
      totalUsers,
      totalScore,
      averageScore: Math.round(averageScore * 100) / 100,
      topScore,
      totalBalance,
      totalPnL,
    };
  } catch (error) {
    console.error("Failed to get snapshot stats:", error);
    return {
      totalUsers: 0,
      totalScore: 0,
      averageScore: 0,
      topScore: 0,
      totalBalance: 0,
      totalPnL: 0,
    };
  }
}

/**
 * Delete airdrop snapshot (admin only)
 */
export async function deleteSnapshot(period: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from("airdrop_snapshots")
      .delete()
      .eq("period", period);

    if (error) {
      throw new Error(`Failed to delete snapshot: ${error.message}`);
    }

    console.log(`Deleted airdrop snapshot for period: ${period}`);
  } catch (error) {
    console.error("Failed to delete snapshot:", error);
    throw error;
  }
}
