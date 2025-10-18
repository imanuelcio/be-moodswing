import { executeQuery, supabase } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";
import type {
  CreateDisputeVoteData,
  Dispute,
  DisputeVote,
  DisputeVoteWithUser,
} from "./dispute.repo.js";

export class DisputeVoteRepository {
  async findById(id: string): Promise<DisputeVote | null> {
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

  async findByDisputeAndUser(
    disputeId: string,
    userId: string
  ): Promise<DisputeVote | null> {
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

  async findByDispute(disputeId: string): Promise<DisputeVoteWithUser[]> {
    return executeQuery<DisputeVoteWithUser[]>(
      supabase
        .from("dispute_votes")
        .select(
          `
          *,
          users (id, handle)
        `
        )
        .eq("dispute_id", disputeId)
        .order("created_at", { ascending: false }),
      "find votes by dispute"
    );
  }

  async create(voteData: CreateDisputeVoteData): Promise<DisputeVote> {
    return executeQuery<DisputeVote>(
      supabase
        .from("dispute_votes")
        .insert({
          ...voteData,
          weight: voteData.weight || 1,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create dispute vote"
    );
  }

  async update(
    id: string,
    vote: "uphold" | "overturn" | "abstain"
  ): Promise<DisputeVote> {
    const existingVote = await this.findById(id);
    if (!existingVote) {
      throw new NotFoundError("Dispute vote", id);
    }

    return executeQuery<DisputeVote>(
      supabase
        .from("dispute_votes")
        .update({ vote })
        .eq("id", id)
        .select("*")
        .single(),
      "update dispute vote"
    );
  }

  async delete(id: string): Promise<void> {
    const vote = await this.findById(id);
    if (!vote) {
      throw new NotFoundError("Dispute vote", id);
    }

    await executeQuery(
      supabase.from("dispute_votes").delete().eq("id", id),
      "delete dispute vote"
    );
  }

  async getVoteSummary(disputeId: string): Promise<{
    totalVotes: number;
    totalWeight: number;
    uphold: { count: number; weight: number };
    overturn: { count: number; weight: number };
    abstain: { count: number; weight: number };
  }> {
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

  async getUserVotes(
    userId: string,
    params: {
      status?: string[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Array<DisputeVote & { disputes: Dispute }>> {
    const { status, limit = 50, offset = 0 } = params;

    let query = supabase
      .from("dispute_votes")
      .select(
        `
        *,
        disputes (*)
      `
      )
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
