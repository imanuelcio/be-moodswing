import {
  DisputeRepository,
  type CreateDisputeData,
  type CreateDisputeVoteData,
} from "../repo/dispute.repo.js";
import { DisputeVoteRepository } from "../repo/disputeVote.repo.js";
import { ResolutionRepository } from "../repo/resolution.repo.js";
import { MarketRepository } from "../repo/market.repo.js";
import { PointsRepository } from "../repo/points.repo.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
} from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox, writeToOutboxBatch } from "../core/outbox.js";
import { logger } from "../core/logger.js";

export interface CreateDisputeRequest {
  reason: string;
  snapshotRef?: string;
}

export interface VoteOnDisputeRequest {
  vote: "uphold" | "overturn" | "abstain";
}

export class DisputeService {
  constructor(
    private disputeRepo = new DisputeRepository(),
    private disputeVoteRepo = new DisputeVoteRepository(),
    private resolutionRepo = new ResolutionRepository(),
    private marketRepo = new MarketRepository(),
    private pointsRepo = new PointsRepository()
  ) {}

  async createDispute(
    marketId: string,
    userId: string,
    request: CreateDisputeRequest
  ): Promise<any> {
    const { reason, snapshotRef } = request;

    // Validate market exists and is resolved
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    if (market.status !== "resolved") {
      throw new ValidationError("Can only dispute resolved markets");
    }

    // Check if market resolution exists
    const resolution = await this.resolutionRepo.findByMarket(marketId);
    if (!resolution) {
      throw new ValidationError("Market must be resolved before disputing");
    }

    // Check if user has minimum points to open dispute
    const userBalance = await this.pointsRepo.getUserBalance(userId);
    const minimumPointsRequired = 1000; // Configure as needed

    if (userBalance < minimumPointsRequired) {
      throw new ValidationError(
        `Minimum ${minimumPointsRequired} points required to open dispute. Current balance: ${userBalance}`
      );
    }

    // Check if there's already an active dispute for this market
    const activeDisputes = await this.disputeRepo.findByMarket(marketId);
    const hasActiveDispute = activeDisputes.some((d) =>
      ["open", "voting"].includes(d.status)
    );

    if (hasActiveDispute) {
      throw new ConflictError("Market already has an active dispute");
    }

    // Check dispute time window (e.g., within 48 hours of resolution)
    const disputeWindowHours = 48;
    const resolutionTime = new Date(resolution.resolved_at);
    const now = new Date();
    const timeDiff = now.getTime() - resolutionTime.getTime();
    const hoursDiff = timeDiff / (1000 * 60 * 60);

    if (hoursDiff > disputeWindowHours) {
      throw new ValidationError(
        `Dispute window has expired. Must dispute within ${disputeWindowHours} hours of resolution.`
      );
    }

    try {
      // Deduct points for opening dispute
      await this.pointsRepo.addPoints({
        user_id: userId,
        reason: "dispute_opened",
        delta: -minimumPointsRequired,
        ref_type: "market",
        ref_id: marketId,
        metadata: {
          market_id: marketId,
          resolution_id: resolution.id,
          dispute_reason: reason,
        },
      });

      // Create dispute
      const disputeData: CreateDisputeData = {
        market_id: marketId,
        opened_by: userId,
        reason,
        snapshot_ref: snapshotRef,
      };

      const dispute = await this.disputeRepo.create(disputeData);

      // Update market status to disputed
      await this.marketRepo.update(marketId, { status: "disputed" });

      // Create outbox events
      const outboxEvents = [
        {
          topic: topics.marketResolved(marketId),
          kind: eventTypes.MARKET_UPDATED,
          payload: {
            market_id: marketId,
            status: "disputed",
            dispute,
            opened_by: userId,
          },
        },
        {
          topic: topics.userNotifications(userId),
          kind: eventTypes.USER_NOTIFICATION,
          payload: {
            user_id: userId,
            type: "dispute_opened",
            title: "Dispute Opened",
            message: `Your dispute for market "${market.title}" has been opened`,
            dispute_id: dispute.id,
          },
        },
      ];

      await writeToOutboxBatch(outboxEvents);

      logger.info(
        {
          disputeId: dispute.id,
          marketId,
          userId,
          reason: reason.substring(0, 100),
        },
        "Dispute opened"
      );

      return dispute;
    } catch (error) {
      logger.error({ error, marketId, userId }, "Failed to create dispute");
      throw error;
    }
  }

  async voteOnDispute(
    disputeId: string,
    userId: string,
    request: VoteOnDisputeRequest
  ): Promise<any> {
    const { vote } = request;

    // Get dispute with details
    const dispute = await this.disputeRepo.findWithDetails(disputeId);
    if (!dispute) {
      throw new NotFoundError("Dispute", disputeId);
    }

    if (!["open", "voting"].includes(dispute.status)) {
      throw new ValidationError("Can only vote on open or voting disputes");
    }

    // Check if user already voted
    const existingVote = await this.disputeVoteRepo.findByDisputeAndUser(
      disputeId,
      userId
    );
    if (existingVote) {
      throw new ConflictError("User has already voted on this dispute");
    }

    // Check if user has minimum points to vote
    const userBalance = await this.pointsRepo.getUserBalance(userId);
    const minimumPointsToVote = 100; // Configure as needed

    if (userBalance < minimumPointsToVote) {
      throw new ValidationError(
        `Minimum ${minimumPointsToVote} points required to vote. Current balance: ${userBalance}`
      );
    }

    // Calculate vote weight based on user's points
    const voteWeight = Math.min(Math.floor(userBalance / 100), 10); // Max weight of 10

    try {
      // Create vote
      const voteData: CreateDisputeVoteData = {
        dispute_id: disputeId,
        user_id: userId,
        vote,
        weight: voteWeight,
      };

      const disputeVote = await this.disputeVoteRepo.create(voteData);

      // Update dispute status to voting if it was open
      if (dispute.status === "open") {
        await this.disputeRepo.update(disputeId, { status: "voting" });
      }

      // Check if dispute should be auto-resolved
      await this.checkDisputeAutoResolution(disputeId);

      // Notify user
      await writeToOutbox({
        topic: topics.userNotifications(userId),
        kind: eventTypes.USER_NOTIFICATION,
        payload: {
          user_id: userId,
          type: "dispute_vote_cast",
          title: "Vote Cast",
          message: `Your vote on dispute has been recorded`,
          dispute_id: disputeId,
          vote,
          weight: voteWeight,
        },
      });

      logger.info(
        {
          disputeId,
          userId,
          vote,
          weight: voteWeight,
        },
        "Dispute vote cast"
      );

      return disputeVote;
    } catch (error) {
      logger.error(
        { error, disputeId, userId, vote },
        "Failed to vote on dispute"
      );
      throw error;
    }
  }

  private async checkDisputeAutoResolution(disputeId: string): Promise<void> {
    const voteSummary = await this.disputeVoteRepo.getVoteSummary(disputeId);
    const minimumVotesRequired = 10; // Configure as needed
    const minimumWeightRequired = 50; // Configure as needed

    // Check if we have enough participation
    if (
      voteSummary.totalVotes < minimumVotesRequired ||
      voteSummary.totalWeight < minimumWeightRequired
    ) {
      return; // Not enough votes yet
    }

    // Determine outcome (need >50% of weight to pass)
    const requiredWeight = Math.floor(voteSummary.totalWeight * 0.5) + 1;

    let outcome: "upheld" | "overturned" | null = null;

    if (voteSummary.overturn.weight >= requiredWeight) {
      outcome = "overturned";
    } else if (voteSummary.uphold.weight >= requiredWeight) {
      outcome = "upheld";
    }

    if (outcome) {
      await this.resolveDispute(disputeId, outcome, "auto");
    }
  }

  async resolveDispute(
    disputeId: string,
    outcome: "upheld" | "overturned" | "dismissed",
    source: "auto" | "admin" = "admin",
    resolvedBy?: string
  ): Promise<any> {
    const dispute = await this.disputeRepo.findWithDetails(disputeId);
    if (!dispute) {
      throw new NotFoundError("Dispute", disputeId);
    }

    if (!["open", "voting"].includes(dispute.status)) {
      throw new ValidationError("Can only resolve open or voting disputes");
    }

    try {
      // Update dispute status
      await this.disputeRepo.update(disputeId, {
        status: "resolved",
        closed_at: new Date().toISOString(),
      });

      // Update market status based on outcome
      let newMarketStatus: string;

      if (outcome === "overturned") {
        // Revert market to closed status for re-resolution
        newMarketStatus = "closed";

        // TODO: Implement payout reversal logic
        // This would involve:
        // 1. Reversing winner payouts
        // 2. Restoring original positions
        // 3. Allowing market to be resolved again
      } else {
        // Upheld or dismissed - market stays resolved
        newMarketStatus = "resolved";
      }

      await this.marketRepo.update(dispute.market_id, {
        status: newMarketStatus as
          | "closed"
          | "resolved"
          | "draft"
          | "open"
          | "disputed"
          | "cancelled"
          | undefined,
      });

      // Process dispute rewards/penalties
      await this.processDisputeRewards(disputeId, outcome);

      // Create outbox events
      const outboxEvents = [
        {
          topic: topics.marketResolved(dispute.market_id),
          kind: eventTypes.MARKET_UPDATED,
          payload: {
            market_id: dispute.market_id,
            status: newMarketStatus,
            dispute_resolved: {
              dispute_id: disputeId,
              outcome,
              source,
              resolved_by: resolvedBy,
            },
          },
        },
      ];

      await writeToOutboxBatch(outboxEvents);

      logger.info(
        {
          disputeId,
          marketId: dispute.market_id,
          outcome,
          source,
          resolvedBy,
        },
        "Dispute resolved"
      );

      return {
        dispute: {
          ...dispute,
          status: "resolved",
          closed_at: new Date().toISOString(),
        },
        outcome,
        marketStatus: newMarketStatus,
      };
    } catch (error) {
      logger.error({ error, disputeId, outcome }, "Failed to resolve dispute");
      throw error;
    }
  }

  private async processDisputeRewards(
    disputeId: string,
    outcome: "upheld" | "overturned" | "dismissed"
  ): Promise<void> {
    const dispute = await this.disputeRepo.findById(disputeId);
    if (!dispute) return;

    const votes = await this.disputeVoteRepo.findByDispute(disputeId);
    const rewards: Array<{
      userId: string;
      amount: number;
      reason: string;
      metadata: any;
    }> = [];

    // Reward correct voters
    const correctVote = outcome === "overturned" ? "overturn" : "uphold";

    votes.forEach((vote) => {
      if (
        vote.vote === correctVote ||
        (outcome === "dismissed" && vote.vote === "uphold")
      ) {
        // Reward voters who voted correctly
        const reward = vote.weight * 50; // 50 points per weight unit
        rewards.push({
          userId: vote.user_id,
          amount: reward,
          reason: "dispute_vote_correct",
          metadata: {
            dispute_id: disputeId,
            vote: vote.vote,
            weight: vote.weight,
            outcome,
          },
        });
      }
    });

    // Reward or penalize dispute opener
    if (outcome === "overturned") {
      // Dispute was successful - refund stake plus bonus
      rewards.push({
        userId: dispute.opened_by,
        amount: 1500, // Refund 1000 + 500 bonus
        reason: "dispute_successful",
        metadata: {
          dispute_id: disputeId,
          outcome,
        },
      });
    }
    // If upheld or dismissed, dispute opener loses their stake (already deducted)

    // Award rewards
    if (rewards.length > 0) {
      await this.pointsRepo.bulkAddPoints(
        rewards.map((reward) => ({
          user_id: reward.userId,
          reason: reward.reason,
          delta: reward.amount,
          ref_type: "dispute",
          ref_id: disputeId,
          metadata: reward.metadata,
        }))
      );
    }

    logger.info(
      {
        disputeId,
        outcome,
        totalRewards: rewards.length,
        totalAmount: rewards.reduce((sum, r) => sum + r.amount, 0),
      },
      "Dispute rewards processed"
    );
  }

  async getDispute(disputeId: string): Promise<any> {
    const dispute = await this.disputeRepo.findWithDetails(disputeId);
    if (!dispute) {
      throw new NotFoundError("Dispute", disputeId);
    }

    // Get vote summary
    const voteSummary = await this.disputeVoteRepo.getVoteSummary(disputeId);

    return {
      ...dispute,
      voteSummary,
    };
  }

  async listDisputes(
    params: {
      status?: string[];
      marketId?: string;
      openedBy?: string;
      page?: number;
      limit?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;

    if (limit > 100) {
      throw new ValidationError("Limit cannot exceed 100");
    }

    const offset = (page - 1) * limit;

    const result = await this.disputeRepo.list({
      ...restParams,
      offset,
      limit,
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      disputes: result.disputes,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getUserVotes(
    userId: string,
    params: {
      status?: string[];
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;
    const offset = (page - 1) * limit;

    const votes = await this.disputeVoteRepo.getUserVotes(userId, {
      ...restParams,
      offset,
      limit,
    });

    return { votes };
  }

  async getDisputeStats(
    params: {
      period?: string;
    } = {}
  ) {
    return this.disputeRepo.getDisputeStats(params);
  }

  async getActiveDisputes(): Promise<any[]> {
    const disputes = await this.disputeRepo.getActiveDisputes();

    // Add vote summaries
    const disputesWithVotes = await Promise.all(
      disputes.map(async (dispute) => {
        const voteSummary = await this.disputeVoteRepo.getVoteSummary(
          dispute.id
        );
        return { ...dispute, voteSummary };
      })
    );

    return disputesWithVotes;
  }
}
