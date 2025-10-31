import { supabase, executeQuery } from "../config/supabase.js";
export class PointsRepository {
    async getUserBalance(userId) {
        const { data, error } = await supabase
            .from("points_ledger")
            .select("balance_after")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to get user points balance: ${error.message}`);
        }
        return data?.balance_after || 0;
    }
    async addPoints(entryData) {
        // Get current balance
        const currentBalance = await this.getUserBalance(entryData.user_id);
        const newBalance = currentBalance + entryData.delta;
        // Ensure balance doesn't go negative for deductions
        if (newBalance < 0 && entryData.delta < 0) {
            throw new Error(`Insufficient points. Current: ${currentBalance}, Required: ${Math.abs(entryData.delta)}`);
        }
        return executeQuery(supabase
            .from("points_ledger")
            .insert({
            ...entryData,
            balance_after: newBalance,
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "add points");
    }
    async getUserHistory(userId, params = {}) {
        const { reason, ref_type, limit = 50, offset = 0 } = params;
        let query = supabase
            .from("points_ledger")
            .select("*", { count: "exact" })
            .eq("user_id", userId);
        if (reason) {
            query = query.eq("reason", reason);
        }
        if (ref_type) {
            query = query.eq("ref_type", ref_type);
        }
        query = query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        const { data, error, count } = await query;
        if (error) {
            throw new Error(`Failed to get user points history: ${error.message}`);
        }
        return {
            entries: data || [],
            total: count || 0,
        };
    }
    async getPointsStats(params = {}) {
        const { userId, period = "all" } = params;
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
            .from("points_ledger")
            .select("delta, reason, created_at");
        if (userId) {
            query = query.eq("user_id", userId);
        }
        if (startDate) {
            query = query.gte("created_at", startDate);
        }
        const { data, error } = await query;
        if (error) {
            throw new Error(`Failed to get points stats: ${error.message}`);
        }
        const entries = data || [];
        const earned = entries
            .filter((e) => e.delta > 0)
            .reduce((sum, e) => sum + e.delta, 0);
        const spent = entries
            .filter((e) => e.delta < 0)
            .reduce((sum, e) => sum + Math.abs(e.delta), 0);
        // Group by reason
        const byReason = entries.reduce((acc, entry) => {
            const reason = entry.reason;
            if (!acc[reason]) {
                acc[reason] = { count: 0, total: 0 };
            }
            acc[reason].count++;
            acc[reason].total += entry.delta;
            return acc;
        }, {});
        return {
            totalTransactions: entries.length,
            totalEarned: earned,
            totalSpent: spent,
            netChange: earned - spent,
            byReason,
            period,
        };
    }
    async getLeaderboard(params = {}) {
        const { limit = 100, period = "all" } = params;
        // For simplicity, get current balances by latest entry per user
        // In production, you might want a separate balances table
        const { data, error } = await supabase.rpc("get_points_leaderboard", {
            p_limit: limit,
            p_period: period,
        });
        if (error) {
            // Fallback query if RPC doesn't exist
            const { data: fallbackData, error: fallbackError } = await supabase
                .from("points_ledger")
                .select(`
          user_id, 
          balance_after,
          users(handle)
        `)
                .order("created_at", { ascending: false });
            if (fallbackError) {
                throw new Error(`Failed to get points leaderboard: ${fallbackError.message}`);
            }
            // Get latest balance per user
            const userBalances = new Map();
            (fallbackData || []).forEach((entry) => {
                if (!userBalances.has(entry.user_id)) {
                    userBalances.set(entry.user_id, {
                        user_id: entry.user_id,
                        balance: entry.balance_after,
                        handle: entry.users,
                    });
                }
            });
            return Array.from(userBalances.values())
                .sort((a, b) => b.balance - a.balance)
                .slice(0, limit);
        }
        return data || [];
    }
    async bulkAddPoints(entries) {
        // For bulk operations, we need to calculate balances sequentially
        const results = [];
        for (const entry of entries) {
            const result = await this.addPoints(entry);
            results.push(result);
        }
        return results;
    }
}
