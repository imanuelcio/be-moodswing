import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface Bet {
  id: string;
  user_id: string;
  wallet_id: string;
  market_id: string;
  outcome_id: string;
  side: "yes" | "no" | "buy" | "sell";
  price: number;
  stake_points?: number;
  stake_token_amount?: number;
  token_symbol?: string;
  tx_hash?: string;
  status: "pending" | "filled" | "failed" | "cancelled";
  created_at: string;
}

export interface BetWithDetails extends Bet {
  markets: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  market_outcomes: {
    id: string;
    key: string;
    name: string;
  };
  users: {
    id: string;
    handle: string;
  };
}

export interface CreateBetData {
  user_id: string;
  wallet_id: string;
  market_id: string;
  outcome_id: string;
  side: "yes" | "no" | "buy" | "sell";
  price: number;
  stake_points?: number;
  stake_token_amount?: number;
  token_symbol?: string;
  tx_hash?: string;
}

export interface UpdateBetData {
  status?: "pending" | "filled" | "failed" | "cancelled";
  tx_hash?: string;
}

export interface BetFilters {
  user_id?: string;
  market_id?: string;
  outcome_id?: string;
  status?: string[];
  side?: string[];
  created_after?: string;
  created_before?: string;
}

export class BetRepository {
  async findById(id: string): Promise<Bet | null> {
    const { data, error } = await supabase
      .from("bets")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find bet: ${error.message}`);
    }

    return data;
  }

  async findWithDetails(id: string): Promise<BetWithDetails | null> {
    const { data, error } = await supabase
      .from("bets")
      .select(
        `
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name),
        users (id, handle)
      `
      )
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find bet with details: ${error.message}`);
    }

    return data;
  }

  async create(betData: CreateBetData): Promise<Bet> {
    return executeQuery<Bet>(
      supabase
        .from("bets")
        .insert({
          ...betData,
          status: "pending",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create bet"
    );
  }

  async update(id: string, betData: UpdateBetData): Promise<Bet> {
    const bet = await this.findById(id);
    if (!bet) {
      throw new NotFoundError("Bet", id);
    }

    return executeQuery<Bet>(
      supabase.from("bets").update(betData).eq("id", id).select("*").single(),
      "update bet"
    );
  }

  async list(
    params: {
      filters?: BetFilters;
      offset?: number;
      limit?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    } = {}
  ): Promise<{ bets: BetWithDetails[]; total: number }> {
    const {
      filters = {},
      offset = 0,
      limit = 50,
      orderBy = "created_at",
      orderDir = "desc",
    } = params;

    let query = supabase.from("bets").select(
      `
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name),
        users (id, handle)
      `,
      { count: "exact" }
    );

    // Apply filters
    if (filters.user_id) {
      query = query.eq("user_id", filters.user_id);
    }

    if (filters.market_id) {
      query = query.eq("market_id", filters.market_id);
    }

    if (filters.outcome_id) {
      query = query.eq("outcome_id", filters.outcome_id);
    }

    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    if (filters.side && filters.side.length > 0) {
      query = query.in("side", filters.side);
    }

    if (filters.created_after) {
      query = query.gte("created_at", filters.created_after);
    }

    if (filters.created_before) {
      query = query.lte("created_at", filters.created_before);
    }

    // Apply ordering and pagination
    query = query
      .order(orderBy, { ascending: orderDir === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list bets: ${error.message}`);
    }

    return {
      bets: data || [],
      total: count || 0,
    };
  }

  async getUserBets(
    userId: string,
    params: {
      marketId?: string;
      status?: string[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<BetWithDetails[]> {
    const { marketId, status, limit = 50, offset = 0 } = params;

    let query = supabase
      .from("bets")
      .select(
        `
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `
      )
      .eq("user_id", userId);

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    if (status && status.length > 0) {
      query = query.in("status", status);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return executeQuery<BetWithDetails[]>(query, "get user bets");
  }

  async getMarketBets(
    marketId: string,
    params: { outcomeId?: string; limit?: number; offset?: number } = {}
  ): Promise<BetWithDetails[]> {
    const { outcomeId, limit = 50, offset = 0 } = params;

    let query = supabase
      .from("bets")
      .select(
        `
      id, market_id, outcome_id, status, stake_points, stake_token_amount, created_at,
      market_outcomes (id, key, name),
      users (id, handle)
    `
      )
      .eq("market_id", marketId)
      .eq("status", "filled");

    if (outcomeId) query = query.eq("outcome_id", outcomeId);

    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return executeQuery<BetWithDetails[]>(query, "get market bets");
  }

  async getBetStats(
    params: {
      userId?: string;
      marketId?: string;
      period?: string; // '24h', '7d', '30d', 'all'
    } = {}
  ) {
    const { userId, marketId, period = "all" } = params;

    let startDate: string | undefined;
    if (period !== "all") {
      const now = new Date();
      switch (period) {
        case "24h":
          startDate = new Date(
            now.getTime() - 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "7d":
          startDate = new Date(
            now.getTime() - 7 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "30d":
          startDate = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
      }
    }

    let query = supabase
      .from("bets")
      .select("stake_points, stake_token_amount, status, created_at")
      .eq("status", "filled");

    if (userId) {
      query = query.eq("user_id", userId);
    }

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    if (startDate) {
      query = query.gte("created_at", startDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get bet stats: ${error.message}`);
    }

    const bets = data || [];

    return {
      totalBets: bets.length,
      totalVolumePoints: bets.reduce(
        (sum, bet) => sum + (bet.stake_points || 0),
        0
      ),
      totalVolumeTokens: bets.reduce(
        (sum, bet) => sum + (bet.stake_token_amount || 0),
        0
      ),
      period,
    };
  }
}
