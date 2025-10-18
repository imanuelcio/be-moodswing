import {
  ResolutionRepository,
  type CreateResolutionData,
  type UpdateResolutionData,
} from "../repo/resolution.repo.js";
import { MarketRepository } from "../repo/market.repo.js";
import { OutcomeRepository } from "../repo/outcome.repo.js";
import { PositionService } from "../services/position.service.js";
import { PointsService } from "../services/points.service.js";
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox, writeToOutboxBatch } from "../core/outbox.js";
import { logger } from "../core/logger.js";

export interface ResolveMarketRequest {
  outcomeKey: string;
  source?: "manual" | "oracle" | "community";
  oracleTransactionHash?: string;
  resultIpfsCid?: string;
  notes?: string;
}

export class ResolutionService {
  constructor(
    private resolutionRepo = new ResolutionRepository(),
    private marketRepo = new MarketRepository(),
    private outcomeRepo = new OutcomeRepository(),
    private positionService = new PositionService(),
    private pointsService = new PointsService()
  ) {}

  async resolveMarket(
    marketId: string,
    request: ResolveMarketRequest,
    resolvedBy?: string
  ): Promise<any> {
    const {
      outcomeKey,
      source = "manual",
      oracleTransactionHash,
      resultIpfsCid,
      notes,
    } = request;

    // Get and validate market
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    if (market.status !== "closed") {
      throw new ValidationError("Can only resolve closed markets");
    }

    // Check if market is already resolved
    const existingResolution = await this.resolutionRepo.findByMarket(marketId);
    if (existingResolution) {
      throw new ConflictError("Market is already resolved");
    }

    // Get the winning outcome
    const winningOutcome = await this.outcomeRepo.findByMarketAndKey(
      marketId,
      outcomeKey
    );
    if (!winningOutcome) {
      throw new NotFoundError("Outcome", outcomeKey);
    }

    // Validate source-specific requirements
    if (source === "oracle" && !oracleTransactionHash) {
      throw new ValidationError(
        "Oracle transaction hash required for oracle resolution"
      );
    }

    try {
      // Create resolution record
      const resolutionData: CreateResolutionData = {
        market_id: marketId,
        resolved_outcome_id: winningOutcome.id,
        source,
        oracle_tx_hash: oracleTransactionHash,
        result_ipfs_cid: resultIpfsCid,
        notes,
      };

      const resolution = await this.resolutionRepo.create(resolutionData);

      // Update market status to resolved
      await this.marketRepo.update(marketId, { status: "resolved" });

      // Process all positions for payout
      await this.processMarketPayout(marketId, winningOutcome.id);

      // Create outbox events for real-time updates
      const outboxEvents = [
        {
          topic: topics.marketResolved(marketId),
          kind: eventTypes.MARKET_RESOLVED,
          payload: {
            market_id: marketId,
            resolution,
            winning_outcome: winningOutcome,
            resolved_by: resolvedBy,
            timestamp: new Date().toISOString(),
          },
        },
        {
          topic: topics.marketTicker(marketId),
          kind: eventTypes.MARKET_UPDATED,
          payload: {
            market_id: marketId,
            status: "resolved",
            resolution,
          },
        },
      ];

      await writeToOutboxBatch(outboxEvents);

      logger.info(
        {
          marketId,
          resolutionId: resolution.id,
          outcomeKey,
          source,
          resolvedBy,
        },
        "Market resolved"
      );

      return {
        resolution,
        market: { ...market, status: "resolved" },
        winningOutcome,
      };
    } catch (error) {
      logger.error({ error, marketId, outcomeKey }, "Failed to resolve market");
      throw error;
    }
  }

  private async processMarketPayout(
    marketId: string,
    winningOutcomeId: string
  ): Promise<void> {
    // Get all positions for this market
    const positions = await this.positionService.getMarketPositions(marketId, {
      limit: 1000,
    });

    const payouts: Array<{
      userId: string;
      amount: number;
      reason: string;
      metadata: any;
    }> = [];

    // Process each position
    for (const position of positions.positions) {
      const quantity = position.qty_points || position.qty_token_amount || 0;

      if (quantity <= 0) continue;

      if (position.outcome_id === winningOutcomeId) {
        // Winning position - payout at 1.0 (100% of quantity)
        const payout = Math.floor(quantity);

        if (payout > 0) {
          payouts.push({
            userId: position.user_id,
            amount: payout,
            reason: "market_resolution_win",
            metadata: {
              market_id: marketId,
              position_id: position.id,
              outcome_id: position.outcome_id,
              quantity,
              payout_rate: 1.0,
            },
          });
        }
      } else {
        // Losing position - liquidate (no payout)
        await this.positionService.liquidatePositions(
          marketId,
          position.outcome_id
        );
      }
    }

    // Bulk award points to winners
    if (payouts.length > 0) {
      await this.pointsService.bulkAwardPoints(payouts);
    }

    logger.info(
      {
        marketId,
        totalPayouts: payouts.length,
        totalAmount: payouts.reduce((sum, p) => sum + p.amount, 0),
      },
      "Market payout processed"
    );
  }

  async getResolution(resolutionId: string): Promise<any> {
    const resolution = await this.resolutionRepo.findWithDetails(resolutionId);
    if (!resolution) {
      throw new NotFoundError("Resolution", resolutionId);
    }

    return resolution;
  }

  async getMarketResolution(marketId: string): Promise<any> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    const resolution = await this.resolutionRepo.findByMarket(marketId);
    if (!resolution) {
      throw new NotFoundError("Resolution for market", marketId);
    }

    const resolutionWithDetails = await this.resolutionRepo.findWithDetails(
      resolution.id
    );

    return resolutionWithDetails;
  }

  async listResolutions(
    params: {
      source?: string;
      marketId?: string;
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

    const result = await this.resolutionRepo.list({
      ...restParams,
      offset,
      limit,
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      resolutions: result.resolutions,
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

  async updateResolution(
    resolutionId: string,
    updateData: UpdateResolutionData,
    updatedBy?: string
  ): Promise<any> {
    const resolution = await this.resolutionRepo.findById(resolutionId);
    if (!resolution) {
      throw new NotFoundError("Resolution", resolutionId);
    }

    // Only allow updates to oracle transactions and notes
    const allowedUpdates: UpdateResolutionData = {};
    if (updateData.oracle_tx_hash !== undefined) {
      allowedUpdates.oracle_tx_hash = updateData.oracle_tx_hash;
    }
    if (updateData.result_ipfs_cid !== undefined) {
      allowedUpdates.result_ipfs_cid = updateData.result_ipfs_cid;
    }
    if (updateData.notes !== undefined) {
      allowedUpdates.notes = updateData.notes;
    }

    const updatedResolution = await this.resolutionRepo.update(
      resolutionId,
      allowedUpdates
    );

    // Notify about resolution update
    await writeToOutbox({
      topic: topics.marketResolved(resolution.market_id),
      kind: eventTypes.MARKET_UPDATED,
      payload: {
        resolution: updatedResolution,
        updated_by: updatedBy,
        changes: allowedUpdates,
      },
    });

    logger.info(
      {
        resolutionId,
        marketId: resolution.market_id,
        updatedBy,
        changes: allowedUpdates,
      },
      "Resolution updated"
    );

    return updatedResolution;
  }

  async getResolutionStats(
    params: {
      source?: string;
      period?: string;
    } = {}
  ) {
    return this.resolutionRepo.getResolutionStats(params);
  }

  async validateResolutionEligibility(marketId: string): Promise<{
    eligible: boolean;
    reason?: string;
    requirements?: string[];
  }> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      return { eligible: false, reason: "Market not found" };
    }

    // Check if market is already resolved
    const existingResolution = await this.resolutionRepo.findByMarket(marketId);
    if (existingResolution) {
      return { eligible: false, reason: "Market already resolved" };
    }

    const requirements: string[] = [];
    let eligible = true;

    // Check market status
    if (market.status !== "closed") {
      eligible = false;
      requirements.push("Market must be closed");
    }

    // Check resolve_by date
    if (market.resolve_by) {
      const resolveBy = new Date(market.resolve_by);
      const now = new Date();
      if (now < resolveBy) {
        eligible = false;
        requirements.push(`Must wait until ${resolveBy.toISOString()}`);
      }
    }

    // Check for active disputes
    // This would be implemented when dispute system is integrated

    return {
      eligible,
      reason: eligible ? undefined : "Resolution requirements not met",
      requirements: requirements.length > 0 ? requirements : undefined,
    };
  }
}
