import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class MarketRepository {
    async findById(id) {
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
    async findBySlug(slug) {
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
    async findWithOutcomes(id) {
        const { data, error } = await supabase
            .from("markets")
            .select(`
        *,
        market_outcomes (
          id, market_id, key, name, initial_price, created_at
        )
      `)
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find market with outcomes: ${error.message}`);
        }
        return data;
    }
    async create(marketData) {
        return executeQuery(supabase
            .from("markets")
            .insert({
            ...marketData,
            status: "draft",
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create market");
    }
    async update(id, marketData) {
        const market = await this.findById(id);
        if (!market) {
            throw new NotFoundError("Market", id);
        }
        return executeQuery(supabase
            .from("markets")
            .update(marketData)
            .eq("id", id)
            .select("*")
            .single(), "update market");
    }
    async delete(id) {
        const market = await this.findById(id);
        if (!market) {
            throw new NotFoundError("Market", id);
        }
        await executeQuery(supabase.from("markets").delete().eq("id", id), "delete market");
    }
    async list(params = {}) {
        const { filters = {}, offset = 0, limit = 50, orderBy = "created_at", orderDir = "desc", } = params;
        let query = supabase.from("markets").select(`
        *,
        market_outcomes (
          id, market_id, key, name, initial_price, created_at
        )
      `, { count: "exact" });
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
            query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
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
    async getMarketStats(marketId) {
        // Coba RPC lebih dulu
        const { data: stats, error } = await supabase.rpc("get_market_stats", {
            p_market_id: marketId,
        });
        if (!error && stats)
            return stats;
        // Fallback manual (DB-side filters, bukan filter array di JS)
        const yesterdayISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
        const volume24h = bets24h.reduce((sum, b) => sum + (b.stake_points ?? 0), 0);
        const totalBets = betsAllRes.count ?? 0;
        const positions = positionsRes.data ?? [];
        const openInterest = positions.reduce((sum, p) => sum + (p.qty_points ?? 0), 0);
        const uniqueBettors = new Set(positions.map((p) => p.user_id)).size;
        return {
            volume_24h: volume24h,
            open_interest: openInterest,
            total_bets: totalBets,
            unique_bettors: uniqueBettors,
        };
    }
    async getMarketsByStatus(status) {
        return executeQuery(supabase
            .from("markets")
            .select("*")
            .in("status", status)
            .order("created_at", { ascending: false }), "get markets by status");
    }
    async getMarketsToClose() {
        const now = new Date().toISOString();
        return executeQuery(supabase
            .from("markets")
            .select("*")
            .eq("status", "open")
            .lte("close_at", now), "get markets to close");
    }
    async getMarketsToResolve() {
        const now = new Date().toISOString();
        return executeQuery(supabase
            .from("markets")
            .select("*")
            .eq("status", "closed")
            .lte("resolve_by", now), "get markets to resolve");
    }
}
