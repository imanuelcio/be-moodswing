import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface Market {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  source?: string;
  symbol?: string;
  pyth_price_id?: string;
  resolution_rule?: {};
  visibility?: string;
  binance_symbol?: string;
  tags?: string[];
  settlement_type: "manual" | "oracle" | "community";
  status: "draft" | "OPEN" | "CLOSED" | "RESOLVED" | "disputed" | "cancelled";
  open_at?: string;
  close_at?: string;
  resolve_by?: string;
  creator_user_id: string;
  metadata?: any;
  created_at: string;
}

export interface MarketWithOutcomes extends Market {
  market_outcomes: MarketOutcome[];
}

export interface MarketWithStats extends Market {
  market_outcomes: MarketOutcome[];
  stats?: {
    volume_24h?: number;
    open_interest?: number;
    total_bets?: number;
    unique_bettors?: number;
  };
}

export interface CreateMarketData {
  slug: string;
  title: string;
  description?: string;
  category?: string;
  source?: string;
  settlement_type: "manual" | "oracle" | "community";
  open_at?: string;
  close_at?: string;
  resolve_by?: string;
  creator_user_id: string;
  metadata?: any;
}

export interface UpdateMarketData {
  title?: string;
  description?: string;
  category?: string;
  source?: string;
  settlement_type?: "manual" | "oracle" | "community";
  status?: "draft" | "open" | "closed" | "resolved" | "disputed" | "cancelled";
  open_at?: string;
  close_at?: string;
  resolve_by?: string;
  metadata?: any;
}

export interface MarketFilters {
  status?: string[];
  category?: string[];
  creator_user_id?: string;
  search?: string;
  open_after?: string;
  close_before?: string;
}

export interface MarketOutcome {
  id: string;
  market_id: string;
  key: string;
  name: string;
  initial_price?: number;
  created_at: string;
}

export class MarketRepository {
  async findById(id: string): Promise<Market | null> {
    const { data, error } = await supabase
      .from("markets")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find market: ${error.message}`);
    }

    return data;
  }

  async findBySlug(slug: string): Promise<Market | null> {
    const { data, error } = await supabase
      .from("markets")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find market by slug: ${error.message}`);
    }

    return data;
  }

  async findWithOutcomes(id: string): Promise<MarketWithOutcomes | null> {
    const { data, error } = await supabase
      .from("markets")
      .select(
        `
        *,
        market_outcomes (
          id, market_id, key, name, initial_price, created_at
        )
      `
      )
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find market with outcomes: ${error.message}`);
    }

    return data;
  }

  async create(marketData: CreateMarketData): Promise<Market> {
    return executeQuery<Market>(
      supabase
        .from("markets")
        .insert({
          ...marketData,
          status: "draft",
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create market"
    );
  }

  async update(id: string, marketData: UpdateMarketData): Promise<Market> {
    const market = await this.findById(id);
    if (!market) {
      throw new NotFoundError("Market", id);
    }

    return executeQuery<Market>(
      supabase
        .from("markets")
        .update(marketData)
        .eq("id", id)
        .select("*")
        .single(),
      "update market"
    );
  }

  async delete(id: string): Promise<void> {
    const market = await this.findById(id);
    if (!market) {
      throw new NotFoundError("Market", id);
    }

    await executeQuery(
      supabase.from("markets").delete().eq("id", id),
      "delete market"
    );
  }

  async list(
    params: {
      filters?: MarketFilters;
      offset?: number;
      limit?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    } = {}
  ): Promise<{ markets: MarketWithOutcomes[]; total: number }> {
    const {
      filters = {},
      offset = 0,
      limit = 50,
      orderBy = "created_at",
      orderDir = "desc",
    } = params;

    let query = supabase.from("markets").select(
      `
        *,
        market_outcomes (
          id, market_id, key, name, initial_price, created_at
        )
      `,
      { count: "exact" }
    );

    // Apply filters
    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }

    if (filters.category && filters.category.length > 0) {
      query = query.in("category", filters.category);
    }

    if (filters.creator_user_id) {
      query = query.eq("creator_user_id", filters.creator_user_id);
    }

    if (filters.search) {
      query = query.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
      );
    }

    if (filters.open_after) {
      query = query.gte("open_at", filters.open_after);
    }

    if (filters.close_before) {
      query = query.lte("close_at", filters.close_before);
    }

    // Apply ordering and pagination
    query = query
      .order(orderBy, { ascending: orderDir === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list markets: ${error.message}`);
    }

    return {
      markets: data || [],
      total: count || 0,
    };
  }

  async getMarketStats(marketId: string) {
    // Coba RPC lebih dulu
    const { data: stats, error } = await supabase.rpc("get_market_stats", {
      p_market_id: marketId,
    });

    if (!error && stats) return stats;

    // Fallback manual (DB-side filters, bukan filter array di JS)
    const yesterdayISO = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const [bets24hRes, betsAllRes, positionsRes] = await Promise.all([
      supabase
        .from("bets")
        .select("stake_points, created_at", { count: "exact", head: false })
        .eq("market_id", marketId)
        .eq("status", "filled")
        .gte("created_at", yesterdayISO),

      supabase
        .from("bets")
        .select("id", { count: "exact", head: true }) // hanya butuh total count
        .eq("market_id", marketId)
        .eq("status", "filled"),

      supabase
        .from("positions")
        .select("qty_points, user_id")
        .eq("market_id", marketId),
    ]);

    const bets24h = bets24hRes.data ?? [];
    const volume24h = bets24h.reduce(
      (sum, b) => sum + (b.stake_points ?? 0),
      0
    );

    const totalBets = betsAllRes.count ?? 0;
    const positions = positionsRes.data ?? [];
    const openInterest = positions.reduce(
      (sum, p) => sum + (p.qty_points ?? 0),
      0
    );
    const uniqueBettors = new Set(positions.map((p) => p.user_id)).size;

    return {
      volume_24h: volume24h,
      open_interest: openInterest,
      total_bets: totalBets,
      unique_bettors: uniqueBettors,
    };
  }

  async getMarketsByStatus(status: string[]): Promise<Market[]> {
    return executeQuery<Market[]>(
      supabase
        .from("markets")
        .select("*")
        .in("status", status)
        .order("created_at", { ascending: false }),
      "get markets by status"
    );
  }

  async getMarketsToClose(): Promise<Market[]> {
    const now = new Date().toISOString();

    return executeQuery<Market[]>(
      supabase
        .from("markets")
        .select("*")
        .eq("status", "open")
        .lte("close_at", now),
      "get markets to close"
    );
  }

  async getMarketsToResolve(): Promise<Market[]> {
    const now = new Date().toISOString();

    return executeQuery<Market[]>(
      supabase
        .from("markets")
        .select("*")
        .eq("status", "closed")
        .lte("resolve_by", now),
      "get markets to resolve"
    );
  }
}
