import {
  MarketRepository,
  type Market,
  type CreateMarketData,
  type UpdateMarketData,
  type MarketFilters,
  type MarketWithOutcomes,
} from "../repo/market.repo.js";
import {
  OutcomeRepository,
  type CreateOutcomeData,
} from "../repo/outcome.repo.js";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
} from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox } from "../core/outbox.js";

export interface CreateMarketRequest {
  title: string;
  description?: string;
  category?: string;
  source?: string;
  settlement_type?: "manual" | "oracle" | "community";
  open_at?: string;
  close_at?: string;
  resolve_by?: string;
  metadata?: any;
  outcomes: Array<{
    key: string;
    name: string;
    initial_price?: number;
  }>;
}

export interface UpdateMarketRequest {
  title?: string;
  description?: string;
  category?: string;
  source?: string;
  settlement_type?: "manual" | "oracle" | "community";
  status?: "draft" | "open" | "closed" | "resolved" | "disputed" | "cancelled";
  open_at?: string;
  close_at?: string;
  resolve_by?: string;
  metadata?: any;
}

export class MarketService {
  constructor(
    private marketRepo = new MarketRepository(),
    private outcomeRepo = new OutcomeRepository()
  ) {}

  async createMarket(
    creatorUserId: string,
    request: CreateMarketRequest
  ): Promise<MarketWithOutcomes> {
    const { outcomes, ...marketData } = request;

    // Validate outcomes
    if (!outcomes || outcomes.length < 2) {
      throw new ValidationError("Market must have at least 2 outcomes");
    }

    if (outcomes.length > 10) {
      throw new ValidationError("Market cannot have more than 10 outcomes");
    }

    // Check for duplicate outcome keys
    const outcomeKeys = outcomes.map((o) => o.key);
    const uniqueKeys = new Set(outcomeKeys);
    if (uniqueKeys.size !== outcomeKeys.length) {
      throw new ValidationError("Outcome keys must be unique");
    }

    // Generate slug from title
    const slug = this.generateSlug(marketData.title);

    // Check if slug already exists
    const existingMarket = await this.marketRepo.findBySlug(slug);
    if (existingMarket) {
      throw new ConflictError(`Market with slug '${slug}' already exists`);
    }

    // Validate dates
    this.validateMarketDates(
      marketData.open_at,
      marketData.close_at,
      marketData.resolve_by
    );

    // Create market
    const createData: CreateMarketData = {
      ...marketData,
      slug,
      creator_user_id: creatorUserId,
      settlement_type: marketData.settlement_type || "manual",
    };

    const market = await this.marketRepo.create(createData);

    // Create outcomes
    const outcomeCreateData: CreateOutcomeData[] = outcomes.map((outcome) => ({
      market_id: market.id,
      key: outcome.key,
      name: outcome.name,
      initial_price: outcome.initial_price || 0.5,
    }));

    const createdOutcomes = await this.outcomeRepo.createBatch(
      outcomeCreateData
    );

    // Write to outbox for realtime updates
    await writeToOutbox({
      topic: topics.marketTicker(market.id),
      kind: eventTypes.MARKET_CREATED,
      payload: {
        market: { ...market, market_outcomes: createdOutcomes },
        creator_user_id: creatorUserId,
      },
    });

    return { ...market, market_outcomes: createdOutcomes };
  }

  async updateMarket(
    marketId: string,
    userId: string,
    request: UpdateMarketRequest
  ): Promise<Market> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    // Check permissions - only creator can update
    if (market.creator_user_id !== userId) {
      throw new ForbiddenError("Only market creator can update the market");
    }

    // Validate status transitions
    if (request.status) {
      this.validateStatusTransition(market.status, request.status);
    }

    // Validate dates if updating
    if (request.open_at || request.close_at || request.resolve_by) {
      this.validateMarketDates(
        request.open_at || market.open_at,
        request.close_at || market.close_at,
        request.resolve_by || market.resolve_by
      );
    }

    const updatedMarket = await this.marketRepo.update(marketId, request);

    // Write to outbox for realtime updates
    await writeToOutbox({
      topic: topics.marketTicker(marketId),
      kind: eventTypes.MARKET_UPDATED,
      payload: {
        market: updatedMarket,
        changes: request,
      },
    });

    return updatedMarket;
  }

  async getMarket(marketId: string): Promise<MarketWithOutcomes> {
    const market = await this.marketRepo.findWithOutcomes(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    return market;
  }

  async getMarketBySlug(slug: string): Promise<MarketWithOutcomes> {
    const market = await this.marketRepo.findBySlug(slug);
    if (!market) {
      throw new NotFoundError("Market", slug);
    }

    const marketWithOutcomes = await this.marketRepo.findWithOutcomes(
      market.id
    );
    return marketWithOutcomes!;
  }

  async listMarkets(
    params: {
      filters?: MarketFilters;
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

    const result = await this.marketRepo.list({
      ...restParams,
      offset,
      limit,
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      markets: result.markets,
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

  async getMarketWithStats(marketId: string) {
    const market = await this.getMarket(marketId);
    const stats = await this.marketRepo.getMarketStats(marketId);
    const outcomesWithStats = await this.outcomeRepo.getOutcomesWithStats(
      marketId
    );

    return {
      ...market,
      market_outcomes: outcomesWithStats,
      stats,
    };
  }

  async deleteMarket(marketId: string, userId: string): Promise<void> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    // Check permissions
    if (market.creator_user_id !== userId) {
      throw new ForbiddenError("Only market creator can delete the market");
    }

    // Can only delete draft markets
    if (market.status !== "draft") {
      throw new ValidationError("Can only delete draft markets");
    }

    // Delete outcomes first
    await this.outcomeRepo.deleteByMarket(marketId);

    // Delete market
    await this.marketRepo.delete(marketId);
  }

  async openMarket(marketId: string, userId: string): Promise<Market> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    if (market.creator_user_id !== userId) {
      throw new ForbiddenError("Only market creator can open the market");
    }

    if (market.status !== "draft") {
      throw new ValidationError("Can only open draft markets");
    }

    // Check if open_at is in the future or not set
    const now = new Date();
    const openAt = market.open_at ? new Date(market.open_at) : now;

    if (openAt > now) {
      throw new ValidationError(
        "Cannot open market before scheduled open time"
      );
    }

    return this.updateMarket(marketId, userId, { status: "open" });
  }

  async closeMarket(marketId: string, userId: string): Promise<Market> {
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    if (market.creator_user_id !== userId) {
      throw new ForbiddenError("Only market creator can close the market");
    }

    if (market.status !== "OPEN") {
      throw new ValidationError("Can only close open markets");
    }

    return this.updateMarket(marketId, userId, { status: "closed" });
  }

  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim()
      .substring(0, 100);
  }

  private validateMarketDates(
    openAt?: string,
    closeAt?: string,
    resolveBy?: string
  ): void {
    const now = new Date();

    if (openAt) {
      const openDate = new Date(openAt);
      if (isNaN(openDate.getTime())) {
        throw new ValidationError("Invalid open_at date");
      }
    }

    if (closeAt) {
      const closeDate = new Date(closeAt);
      if (isNaN(closeDate.getTime())) {
        throw new ValidationError("Invalid close_at date");
      }

      if (openAt && closeDate <= new Date(openAt)) {
        throw new ValidationError("close_at must be after open_at");
      }
    }

    if (resolveBy) {
      const resolveDate = new Date(resolveBy);
      if (isNaN(resolveDate.getTime())) {
        throw new ValidationError("Invalid resolve_by date");
      }

      if (closeAt && resolveDate <= new Date(closeAt)) {
        throw new ValidationError("resolve_by must be after close_at");
      }
    }
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: string
  ): void {
    const validTransitions: Record<string, string[]> = {
      draft: ["open", "cancelled"],
      open: ["closed", "cancelled"],
      closed: ["resolved", "disputed", "open"],
      resolved: ["disputed"],
      disputed: ["resolved", "closed"],
      cancelled: [],
    };

    const allowedNextStates = validTransitions[currentStatus] || [];

    if (!allowedNextStates.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'`
      );
    }
  }
}
