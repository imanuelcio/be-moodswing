import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class DisputeRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("disputes")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find dispute: ${error.message}`);
        }
        return data;
    }
    async findWithDetails(id) {
        const { data, error } = await supabase
            .from("disputes")
            .select(`
        *,
        markets (id, title, slug, status),
        users (id, handle),
        dispute_votes (
          id, user_id, vote, weight, created_at,
          users (id, handle)
        )
      `)
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find dispute with details: ${error.message}`);
        }
        return data;
    }
    async findByMarket(marketId) {
        return executeQuery(supabase
            .from("disputes")
            .select(`
          *,
          markets (id, title, slug, status),
          users (id, handle)
        `)
            .eq("market_id", marketId)
            .order("created_at", { ascending: false }), "find disputes by market");
    }
    async create(disputeData) {
        return executeQuery(supabase
            .from("disputes")
            .insert({
            ...disputeData,
            status: "open",
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create dispute");
    }
    async update(id, disputeData) {
        const dispute = await this.findById(id);
        if (!dispute) {
            throw new NotFoundError("Dispute", id);
        }
        return executeQuery(supabase
            .from("disputes")
            .update(disputeData)
            .eq("id", id)
            .select("*")
            .single(), "update dispute");
    }
    async list(params = {}) {
        const { status, marketId, openedBy, offset = 0, limit = 50, orderBy = "created_at", orderDir = "desc", } = params;
        let query = supabase.from("disputes").select(`
        *,
        markets (id, title, slug, status),
        users (id, handle)
      `, { count: "exact" });
        if (status && status.length > 0) {
            query = query.in("status", status);
        }
        if (marketId) {
            query = query.eq("market_id", marketId);
        }
        if (openedBy) {
            query = query.eq("opened_by", openedBy);
        }
        query = query
            .order(orderBy, { ascending: orderDir === "asc" })
            .range(offset, offset + limit - 1);
        const { data, error, count } = await query;
        if (error) {
            throw new Error(`Failed to list disputes: ${error.message}`);
        }
        return {
            disputes: data || [],
            total: count || 0,
        };
    }
    async getActiveDisputes() {
        return executeQuery(supabase
            .from("disputes")
            .select(`
          *,
          markets (id, title, slug, status),
          users (id, handle)
        `)
            .in("status", ["open", "voting"])
            .order("created_at", { ascending: true }), "get active disputes");
    }
    async getDisputeStats(params = {}) {
        const { period = "all" } = params;
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
        let query = supabase.from("disputes").select("status, created_at");
        if (startDate) {
            query = query.gte("created_at", startDate);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(`Failed to get dispute stats: ${error.message}`);
        }
        const disputes = data || [];
        // Group by status
        const byStatus = disputes.reduce((acc, dispute) => {
            const status = dispute.status;
            if (!acc[status]) {
                acc[status] = 0;
            }
            acc[status]++;
            return acc;
        }, {});
        return {
            totalDisputes: disputes.length,
            byStatus,
            period,
        };
    }
}
