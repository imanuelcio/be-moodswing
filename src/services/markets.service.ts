/**
 * Service for managing prediction markets
 */

import { supabaseAdmin } from "../config/supabase.js";
import { withMarketLock } from "../lib/locks.js";
import { sseBroadcaster } from "../lib/sse.js";
import type {
  BetInput,
  CreateMarketInput,
  MarketQuery,
  ResolveMarketInput,
} from "../schemas/index.js";
import type { Market, Position } from "../types/index.js";
import { buyNo, buyYes, calcPrice } from "./cpmm.service.js";
import { addPoints, getUserBalance, subtractPoints } from "./points.service.js";

/**
 * Create a new CPMM market
 */
export async function createMarket(
  params: CreateMarketInput,
  createdBy: string
): Promise<Market> {
  const { title, topic, k, seedYes = 1, seedNo = 1, closeAt } = params;

  try {
    const marketData = {
      title,
      topic,
      yes_shares: seedYes,
      no_shares: seedNo,
      k_liquidity: k,
      status: "OPEN" as const,
      close_at: closeAt,
      created_by: createdBy,
    };

    const { data: market, error } = await supabaseAdmin
      .from("markets")
      .insert(marketData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create market: ${error.message}`);
    }

    // Broadcast initial snapshot
    const prices = calcPrice(seedYes, seedNo);
    await sseBroadcaster.publish(market.id, {
      marketId: market.id,
      yesShares: seedYes,
      noShares: seedNo,
      priceYes: prices.priceYes,
      priceNo: prices.priceNo,
      ts: new Date().toISOString(),
    });

    return market;
  } catch (error) {
    console.error("Failed to create market:", error);
    throw error;
  }
}

/**
 * Close a market (admin only)
 */
export async function closeMarket(marketId: string): Promise<Market> {
  try {
    const { data: market, error } = await supabaseAdmin
      .from("markets")
      .update({ status: "CLOSED", updated_at: new Date().toISOString() })
      .eq("id", marketId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to close market: ${error.message}`);
    }

    // Broadcast market closure
    const prices = calcPrice(market.yes_shares, market.no_shares);
    await sseBroadcaster.publish(marketId, {
      marketId,
      yesShares: market.yes_shares,
      noShares: market.no_shares,
      priceYes: prices.priceYes,
      priceNo: prices.priceNo,
      ts: new Date().toISOString(),
    });

    return market;
  } catch (error) {
    console.error("Failed to close market:", error);
    throw error;
  }
}

/**
 * Resolve a market with outcome (admin only)
 */
export async function resolveMarket(
  marketId: string,
  outcome: ResolveMarketInput
): Promise<Market> {
  return withMarketLock(marketId, async () => {
    try {
      // Update market status and outcome
      const { data: market, error: updateError } = await supabaseAdmin
        .from("markets")
        .update({
          status: "RESOLVED",
          resolved_outcome: outcome.outcome,
          updated_at: new Date().toISOString(),
        })
        .eq("id", marketId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to resolve market: ${updateError.message}`);
      }

      // Get all positions for this market
      const { data: positions, error: positionsError } = await supabaseAdmin
        .from("positions")
        .select("*")
        .eq("market_id", marketId);

      if (positionsError) {
        throw new Error(`Failed to fetch positions: ${positionsError.message}`);
      }

      // Calculate and distribute payouts
      const payouts = new Map<string, number>();

      for (const position of positions || []) {
        const userId = position.user_id;
        let payout = 0;

        // Calculate payout based on outcome
        if (outcome.outcome === "YES" && position.side === "YES") {
          payout = position.shares; // Each YES share pays 1 point
        } else if (outcome.outcome === "NO" && position.side === "NO") {
          payout = position.shares; // Each NO share pays 1 point
        }

        if (payout > 0) {
          const currentPayout = payouts.get(userId) || 0;
          payouts.set(userId, currentPayout + payout);
        }
      }

      // Distribute payouts
      const payoutPromises = Array.from(payouts.entries()).map(
        ([userId, amount]) =>
          addPoints(userId, amount, "payout", "market", marketId)
      );

      await Promise.all(payoutPromises);

      // Broadcast final market state
      const prices = calcPrice(market.yes_shares, market.no_shares);
      await sseBroadcaster.publish(marketId, {
        marketId,
        yesShares: market.yes_shares,
        noShares: market.no_shares,
        priceYes: prices.priceYes,
        priceNo: prices.priceNo,
        ts: new Date().toISOString(),
      });

      return market;
    } catch (error) {
      console.error("Failed to resolve market:", error);
      throw error;
    }
  });
}

/**
 * List markets with optional filtering
 */
export async function listMarkets(query: MarketQuery = {}): Promise<Market[]> {
  try {
    let supabaseQuery = supabaseAdmin
      .from("markets")
      .select("*")
      .order("created_at", { ascending: false });

    if (query.status) {
      supabaseQuery = supabaseQuery.eq("status", query.status);
    }

    const { data: markets, error } = await supabaseQuery;

    if (error) {
      throw new Error(`Failed to list markets: ${error.message}`);
    }

    return markets || [];
  } catch (error) {
    console.error("Failed to list markets:", error);
    throw error;
  }
}

/**
 * Get market by ID
 */
export async function getMarket(marketId: string): Promise<Market | null> {
  try {
    const { data: market, error } = await supabaseAdmin
      .from("markets")
      .select("*")
      .eq("id", marketId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Market not found
      }
      throw new Error(`Failed to get market: ${error.message}`);
    }

    return market;
  } catch (error) {
    console.error("Failed to get market:", error);
    throw error;
  }
}

/**
 * Place a bet on a market
 */
export async function bet(
  marketId: string,
  userId: string,
  betData: BetInput
): Promise<{ position: Position; newBalance: number; market: Market }> {
  return withMarketLock(marketId, async () => {
    try {
      // Verify market is open
      const market = await getMarket(marketId);
      if (!market) {
        throw new Error("Market not found");
      }

      if (market.status !== "OPEN") {
        throw new Error("Market is not open for betting");
      }

      // Check if market is past close time
      if (market.close_at && new Date(market.close_at) < new Date()) {
        throw new Error("Market has expired");
      }

      // Verify user has enough points
      const userBalance = await getUserBalance(userId);
      if (userBalance < betData.points) {
        throw new Error("Insufficient points balance");
      }

      // Calculate CPMM trade
      const cpmmResult =
        betData.side === "YES"
          ? buyYes(market.yes_shares, market.no_shares, betData.points)
          : buyNo(market.yes_shares, market.no_shares, betData.points);

      // Update market shares
      const { data: updatedMarket, error: marketError } = await supabaseAdmin
        .from("markets")
        .update({
          yes_shares: cpmmResult.newYes,
          no_shares: cpmmResult.newNo,
          updated_at: new Date().toISOString(),
        })
        .eq("id", marketId)
        .select()
        .single();

      if (marketError) {
        throw new Error(`Failed to update market: ${marketError.message}`);
      }

      // Create position record
      const { data: position, error: positionError } = await supabaseAdmin
        .from("positions")
        .insert({
          user_id: userId,
          market_id: marketId,
          side: betData.side,
          shares: cpmmResult.shares,
          points_spent: betData.points,
        })
        .select()
        .single();

      if (positionError) {
        throw new Error(`Failed to create position: ${positionError.message}`);
      }

      // Subtract points from user balance
      const newBalance = await subtractPoints(
        userId,
        betData.points,
        "bet",
        "market",
        marketId
      );

      // Broadcast market update
      const prices = calcPrice(cpmmResult.newYes, cpmmResult.newNo);
      await sseBroadcaster.publish(marketId, {
        marketId,
        yesShares: cpmmResult.newYes,
        noShares: cpmmResult.newNo,
        priceYes: prices.priceYes,
        priceNo: prices.priceNo,
        ts: new Date().toISOString(),
      });

      return {
        position,
        newBalance,
        market: updatedMarket,
      };
    } catch (error) {
      console.error("Failed to place bet:", error);
      throw error;
    }
  });
}

/**
 * Get user's positions in a market
 */
export async function getUserPositions(
  userId: string,
  marketId?: string
): Promise<Position[]> {
  try {
    let query = supabaseAdmin
      .from("positions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    const { data: positions, error } = await query;

    if (error) {
      throw new Error(`Failed to get user positions: ${error.message}`);
    }

    return positions || [];
  } catch (error) {
    console.error("Failed to get user positions:", error);
    throw error;
  }
}

/**
 * Get market positions summary
 */
export async function getMarketPositions(marketId: string): Promise<any[]> {
  try {
    const { data: positions, error } = await supabaseAdmin
      .from("positions")
      .select(
        `
        user_id,
        side,
        shares,
        points_spent,
        created_at,
        users (address)
      `
      )
      .eq("market_id", marketId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get market positions: ${error.message}`);
    }

    return positions || [];
  } catch (error) {
    console.error("Failed to get market positions:", error);
    throw error;
  }
}
