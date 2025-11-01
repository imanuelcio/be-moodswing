import { executeQuery, supabase } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
export class DisputeVoteRepository {
    async findById(id) {
        const { data, error } = await supabase
            .from("dispute_votes")
            .select("*")
            .eq("id", id)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find dispute vote: ${error.message}`);
        }
        return data;
    }
    async findByDisputeAndUser(disputeId, userId) {
        const { data, error } = await supabase
            .from("dispute_votes")
            .select("*")
            .eq("dispute_id", disputeId)
            .eq("user_id", userId)
            .single();
        if (error && error.code !== "PGRST116") {
            throw new Error(`Failed to find dispute vote: ${error.message}`);
        }
        return data;
    }
    async findByDispute(disputeId) {
        return executeQuery(supabase
            .from("dispute_votes")
            .select(`
          *,
          users (id, handle)
        `)
            .eq("dispute_id", disputeId)
            .order("created_at", { ascending: false }), "find votes by dispute");
    }
    async create(voteData) {
        return executeQuery(supabase
            .from("dispute_votes")
            .insert({
            ...voteData,
            weight: voteData.weight || 1,
            created_at: new Date().toISOString(),
        })
            .select("*")
            .single(), "create dispute vote");
    }
    async update(id, vote) {
        const existingVote = await this.findById(id);
        if (!existingVote) {
            throw new NotFoundError("Dispute vote", id);
        }
        return executeQuery(supabase
            .from("dispute_votes")
            .update({ vote })
            .eq("id", id)
            .select("*")
            .single(), "update dispute vote");
    }
    async delete(id) {
        const vote = await this.findById(id);
        if (!vote) {
            throw new NotFoundError("Dispute vote", id);
        }
        await executeQuery(supabase.from("dispute_votes").delete().eq("id", id), "delete dispute vote");
    }
    async getVoteSummary(disputeId) {
        const votes = await this.findByDispute(disputeId);
        const summary = {
            totalVotes: votes.length,
            totalWeight: votes.reduce((sum, vote) => sum + vote.weight, 0),
            uphold: { count: 0, weight: 0 },
            overturn: { count: 0, weight: 0 },
            abstain: { count: 0, weight: 0 },
        };
        votes.forEach((vote) => {
            summary[vote.vote].count++;
            summary[vote.vote].weight += vote.weight;
        });
        return summary;
    }
    async getUserVotes(userId, params = {}) {
        const { status, limit = 50, offset = 0 } = params;
        let query = supabase
            .from("dispute_votes")
            .select(`
        *,
        disputes (*)
      `)
            .eq("user_id", userId);
        if (status && status.length > 0) {
            query = query.in("disputes.status", status);
        }
        query = query
            .order("created_at", { ascending: false })
            .range(offset, offset + limit - 1);
        return executeQuery(query, "get user votes");
    }
}
