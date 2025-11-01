import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class ResolutionRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("market_resolutions")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find resolution: ${error.message}`);
        }
        return data;
    }
    async findByMarket(marketId) {
        const { data, error } = await supabase
            .from("market_resolutions")
            .select("*")
            .eq("market_id", marketId)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find resolution by market: ${error.message}`);
        }
        return data;
    }
    async findWithDetails(id) {
        const { data, error } = await supabase
            .from("market_resolutions")
            .select(`
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `)
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find resolution with details: ${error.message}`);
        }
        return data;
    }
    async create(resolutionData) {
        return executeQuery(supabase
            .from("market_resolutions")
            .insert({
            ...resolutionData,
            resolved_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create resolution");
    }
    async update(id, resolutionData) {
        const resolution = await this.findById(id);
        if (!resolution) {
            throw new NotFoundError("Resolution", id);
        }
        return executeQuery(supabase
            .from("market_resolutions")
            .update(resolutionData)
            .eq("id", id)
            .select("*")
            .single(), "update resolution");
    }
    async delete(id) {
        const resolution = await this.findById(id);
        if (!resolution) {
            throw new NotFoundError("Resolution", id);
        }
        await executeQuery(supabase.from("market_resolutions").delete().eq("id", id), "delete resolution");
    }
    async list(params = {}) {
        const { source, marketId, offset = 0, limit = 50, orderBy = "resolved_at", orderDir = "desc", } = params;
        let query = supabase.from("market_resolutions").select(`
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `, { count: "exact" });
        if (source) {
            query = query.eq("source", source);
        }
        if (marketId) {
            query = query.eq("market_id", marketId);
        }
        query = query
            .order(orderBy, { ascending: orderDir === "asc" })
            .range(offset, offset + limit - 1);
        const { data, error, count } = await query;
        if (error) {
            throw new Error(`Failed to list resolutions: ${error.message}`);
        }
        return {
            resolutions: data || [],
            total: count || 0,
        };
    }
    async getResolutionStats(params = {}) {
        const { source, period = "all" } = params;
        let startDate;
        if (period !== "all") {
            const now = new Date();
            switch (period) {
                case "24h":
                    startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "7d":
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
                    break;
                case "30d":
                    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                    break;
            }
        }
        let query = supabase
            .from("market_resolutions")
            .select("source, resolved_at");
        if (source) {
            query = query.eq("source", source);
        }
        if (startDate) {
            query = query.gte("resolved_at", startDate);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(`Failed to get resolution stats: ${error.message}`);
        }
        const resolutions = data || [];
        // Group by source
        const bySource = resolutions.reduce((acc, resolution) => {
            const source = resolution.source;
            if (!acc[source]) {
                acc[source] = 0;
            }
            acc[source]++;
            return acc;
        }, {});
        return {
            totalResolutions: resolutions.length,
            bySource,
            period,
        };
    }
}
