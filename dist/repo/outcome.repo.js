import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class OutcomeRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("market_outcomes")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find outcome: ${error.message}`);
        }
        return data;
    }
    async findByMarketAndKey(marketId, key) {
        const { data, error } = await supabase
            .from("market_outcomes")
            .select("*")
            .eq("market_id", marketId)
            .eq("key", key)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find outcome by key: ${error.message}`);
        }
        return data;
    }
    async findByMarket(marketId) {
        return executeQuery(supabase
            .from("market_outcomes")
            .select("*")
            .eq("market_id", marketId)
            .order("created_at", { ascending: true }), "find outcomes by market");
    }
    async create(outcomeData) {
        return executeQuery(supabase
            .from("market_outcomes")
            .insert({
            ...outcomeData,
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create outcome");
    }
    async createBatch(outcomes) {
        const outcomesWithTimestamp = outcomes.map((outcome) => ({
            ...outcome,
            created_at: new Date().toISOString(),
        }));
        return executeQuery(supabase
            .from("market_outcomes")
            .insert(outcomesWithTimestamp)
            .select("*"), "create outcomes batch");
    }
    async update(id, outcomeData) {
        const outcome = await this.findById(id);
        if (!outcome) {
            throw new NotFoundError("Outcome", id);
        }
        return executeQuery(supabase
            .from("market_outcomes")
            .update(outcomeData)
            .eq("id", id)
            .select("*")
            .single(), "update outcome");
    }
    async delete(id) {
        const outcome = await this.findById(id);
        if (!outcome) {
            throw new NotFoundError("Outcome", id);
        }
        await executeQuery(supabase.from("market_outcomes").delete().eq("id", id), "delete outcome");
    }
    async deleteByMarket(marketId) {
        await executeQuery(supabase.from("market_outcomes").delete().eq("market_id", marketId), "delete outcomes by market");
    }
    async getOutcomeStats(outcomeId) {
        // Get current price from latest bets
        const { data: latestBet } = await supabase
            .from("bets")
            .select("price, created_at")
            .eq("outcome_id", outcomeId)
            .eq("status", "filled")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
        // Get 24h volume
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: volumeData } = await supabase
            .from("bets")
            .select("stake_points")
            .eq("outcome_id", outcomeId)
            .eq("status", "filled")
            .gte("created_at", yesterday);
        const volume24h = (volumeData || []).reduce((sum, bet) => sum + (bet.stake_points || 0), 0);
        // Get open interest
        const { data: positionsData } = await supabase
            .from("positions")
            .select("qty_points")
            .eq("outcome_id", outcomeId);
        const openInterest = (positionsData || []).reduce((sum, pos) => sum + (pos.qty_points || 0), 0);
        return {
            current_price: latestBet?.price || null,
            volume_24h: volume24h,
            open_interest: openInterest,
            last_trade_at: latestBet?.created_at || null,
        };
    }
    async getOutcomesWithStats(marketId) {
        const outcomes = await this.findByMarket(marketId);
        const outcomesWithStats = await Promise.all(outcomes.map(async (outcome) => {
            const stats = await this.getOutcomeStats(outcome.id);
            return { ...outcome, stats };
        }));
        return outcomesWithStats;
    }
}
