// /services/points.ts

import { supabaseAdmin } from "../config/supabase.js";

/**
 * Service for managing user points and monthly grants
 */

/**
 * Claim monthly points grant (idempotent per period)
 */
export async function claimMonthlyPoints(
  userId: string
): Promise<{ balance: number; granted: number }> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}`;
  const grantAmount = 50000;

  try {
    // Check if user already claimed for this period
    const { data: existingGrant, error: checkError } = await supabaseAdmin
      .from("points_ledger")
      .select("id")
      .eq("user_id", userId)
      .eq("reason", "monthly_grant")
      .eq("ref_id", period)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // Not found is OK
      throw new Error(`Failed to check existing grant: ${checkError.message}`);
    }

    if (existingGrant) {
      // Already claimed, return current balance
      const balance = await getUserBalance(userId);
      return { balance, granted: 0 };
    }

    // Get current balance
    const currentBalance = await getUserBalance(userId);
    const newBalance = currentBalance + grantAmount;

    // Insert grant record
    const { error: insertError } = await supabaseAdmin
      .from("points_ledger")
      .insert({
        user_id: userId,
        delta: grantAmount,
        balance: newBalance,
        reason: "monthly_grant",
        ref_type: "system",
        ref_id: period,
      });

    if (insertError) {
      throw new Error(`Failed to grant monthly points: ${insertError.message}`);
    }

    return { balance: newBalance, granted: grantAmount };
  } catch (error) {
    console.error("Monthly points claim failed:", error);
    throw error;
  }
}

/**
 * Get user's current points balance
 */
export async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("points_ledger")
    .select("balance")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No records found
      return 0;
    }
    throw new Error(`Failed to get user balance: ${error.message}`);
  }

  return data?.balance || 0;
}

/**
 * Add points to user's balance
 */
export async function addPoints(
  userId: string,
  amount: number,
  reason: string,
  refType?: string,
  refId?: string
): Promise<number> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const currentBalance = await getUserBalance(userId);
  const newBalance = currentBalance + amount;

  const { error } = await supabaseAdmin.from("points_ledger").insert({
    user_id: userId,
    delta: amount,
    balance: newBalance,
    reason,
    ref_type: refType,
    ref_id: refId,
  });

  if (error) {
    throw new Error(`Failed to add points: ${error.message}`);
  }

  return newBalance;
}

/**
 * Subtract points from user's balance
 */
export async function subtractPoints(
  userId: string,
  amount: number,
  reason: string,
  refType?: string,
  refId?: string
): Promise<number> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  const currentBalance = await getUserBalance(userId);

  if (currentBalance < amount) {
    throw new Error("Insufficient points balance");
  }

  const newBalance = currentBalance - amount;

  const { error } = await supabaseAdmin.from("points_ledger").insert({
    user_id: userId,
    delta: -amount,
    balance: newBalance,
    reason,
    ref_type: refType,
    ref_id: refId,
  });

  if (error) {
    throw new Error(`Failed to subtract points: ${error.message}`);
  }

  return newBalance;
}

/**
 * Transfer points between users (for tips)
 */
export async function transferPoints(
  fromUserId: string,
  toUserId: string,
  amount: number,
  reason: string,
  refId?: string
): Promise<{ fromBalance: number; toBalance: number }> {
  if (amount <= 0) {
    throw new Error("Amount must be positive");
  }

  // Use transaction for atomic transfer
  const { data, error } = await supabaseAdmin.rpc("transfer_points", {
    from_user_id: fromUserId,
    to_user_id: toUserId,
    amount: amount,
    reason: reason,
    ref_id: refId,
  });

  if (error) {
    throw new Error(`Failed to transfer points: ${error.message}`);
  }

  return data;
}

/**
 * Get user's points history
 */
export async function getPointsHistory(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<any[]> {
  const { data, error } = await supabaseAdmin
    .from("points_ledger")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(`Failed to get points history: ${error.message}`);
  }

  return data || [];
}

/**
 * Calculate user's profit/loss from betting
 */
export async function calculateUserPnL(
  userId: string,
  period?: string
): Promise<number> {
  let query = supabaseAdmin
    .from("points_ledger")
    .select("delta")
    .eq("user_id", userId)
    .in("reason", ["bet", "payout"]);

  if (period) {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case "daily":
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "weekly":
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case "monthly":
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      default:
        startDate = new Date(0); // All time
    }

    query = query.gte("created_at", startDate.toISOString());
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to calculate PnL: ${error.message}`);
  }

  return data?.reduce((sum, record) => sum + record.delta, 0) || 0;
}

/**
 * Initialize user with starting points
 */
export async function initializeUserPoints(
  userId: string,
  initialAmount: number = 1000
): Promise<number> {
  // Check if user already has points
  const currentBalance = await getUserBalance(userId);

  if (currentBalance > 0) {
    return currentBalance; // Already initialized
  }

  const { error } = await supabaseAdmin.from("points_ledger").insert({
    user_id: userId,
    delta: initialAmount,
    balance: initialAmount,
    reason: "initial",
    ref_type: "system",
    ref_id: "signup",
  });

  if (error) {
    throw new Error(`Failed to initialize user points: ${error.message}`);
  }

  return initialAmount;
}
