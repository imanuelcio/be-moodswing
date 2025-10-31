import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class PositionRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("positions")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find position: ${error.message}`);
        }
        return data;
    }
    async findByUserMarketOutcome(userId, marketId, outcomeId) {
        const { data, error } = await supabase
            .from("positions")
            .select("*")
            .eq("user_id", userId)
            .eq("market_id", marketId)
            .eq("outcome_id", outcomeId)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find position: ${error.message}`);
        }
        return data;
    }
    async create(positionData) {
        return executeQuery(supabase
            .from("positions")
            .insert({
            ...positionData,
            updated_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create position");
    }
    async upsert(positionData) {
        return executeQuery(supabase
            .from("positions")
            .upsert({
            ...positionData,
            updated_at: new Date().toISOString(),
        }, {
            onConflict: "user_id,market_id,outcome_id",
        })
            .select("*")
            .single(), "upsert position");
    }
    async update(id, positionData) {
        const position = await this.findById(id);
        if (!position) {
            throw new NotFoundError("Position", id);
        }
        return executeQuery(supabase
            .from("positions")
            .update({
            ...positionData,
            updated_at: new Date().toISOString(),
        })
            .eq("id", id)
            .select("*")
            .single(), "update position");
    }
    async getUserPositions(userId, params = {}) {
        const { marketId, minQuantity = 0, limit = 50, offset = 0 } = params;
        let query = supabase
            .from("positions")
            .select(`
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `)
            .eq("user_id", userId);
        if (marketId) {
            query = query.eq("market_id", marketId);
        }
        if (minQuantity > 0) {
            query = query.or(`qty_points.gte.${minQuantity},qty_token_amount.gte.${minQuantity}`);
        }
        query = query
            .order("updated_at", { ascending: false })
            .range(offset, offset + limit - 1);
        return executeQuery(query, "get user positions");
    }
    async getMarketPositions(marketId, params = {}) {
        const { outcomeId, limit = 50, offset = 0 } = params;
        let query = supabase
            .from("positions")
            .select(`
        *,
        market_outcomes (id, key, name),
        users (id, handle)
      `)
            .eq("market_id", marketId);
        if (outcomeId) {
            query = query.eq("outcome_id", outcomeId);
        }
        // Only show positions with meaningful quantities
        query = query.or("qty_points.gt.0,qty_token_amount.gt.0");
        query = query
            .order("updated_at", { ascending: false })
            .range(offset, offset + limit - 1);
        return executeQuery(query, "get market positions");
    }
    async getPositionStats(params = {}) {
        const { userId, marketId } = params;
        let query = supabase
            .from("positions")
            .select("qty_points, qty_token_amount, realized_pnl_pts, realized_pnl_token");
        if (userId) {
            query = query.eq("user_id", userId);
        }
        if (marketId) {
            query = query.eq("market_id", marketId);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(`Failed to get position stats: ${error.message}`);
        }
        const positions = data || [];
        return {
            totalPositions: positions.length,
            totalQuantityPoints: positions.reduce((sum, pos) => sum + (pos.qty_points || 0), 0),
            totalQuantityTokens: positions.reduce((sum, pos) => sum + (pos.qty_token_amount || 0), 0),
            totalRealizedPnlPoints: positions.reduce((sum, pos) => sum + (pos.realized_pnl_pts || 0), 0),
            totalRealizedPnlTokens: positions.reduce((sum, pos) => sum + (pos.realized_pnl_token || 0), 0),
        };
    }
    async deletePosition(id) {
        const position = await this.findById(id);
        if (!position) {
            throw new NotFoundError("Position", id);
        }
        await executeQuery(supabase.from("positions").delete().eq("id", id), "delete position");
    }
    async liquidatePosition(userId, marketId, outcomeId) {
        // Set quantities to 0 but keep the record for historical purposes
        const position = await this.findByUserMarketOutcome(userId, marketId, outcomeId);
        if (!position) {
            return null;
        }
        return this.update(position.id, {
            qty_points: 0,
            qty_token_amount: 0,
        });
    }
}
