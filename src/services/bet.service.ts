import {
  BetRepository,
  type Bet,
  type CreateBetData,
  type BetFilters,
} from "../repo/bet.repo.js";
import { PositionRepository, type Position } from "../repo/position.repo.js";
import { PointsRepository } from "../repo/points.repo.js";
import { MarketRepository } from "../repo/market.repo.js";
import { OutcomeRepository } from "../repo/outcome.repo.js";
import { WalletRepository } from "../repo/wallet.repo.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox, writeToOutboxBatch } from "../core/outbox.js";
import { supabase } from "../config/supabase.js";

export interface PlaceBetRequest {
  marketId: string;
  outcomeKey: string;
  side: "yes" | "no" | "buy" | "sell";
  stakePoints?: number;
  stakeTokenAmount?: number;
  tokenSymbol?: string;
  price?: number;
}

export interface BetResult {
  bet: Bet;
  position?: Position;
  pointsEntry?: any;
}

export class BetService {
  constructor(
    private betRepo = new BetRepository(),
    private positionRepo = new PositionRepository(),
    private pointsRepo = new PointsRepository(),
    private marketRepo = new MarketRepository(),
    private outcomeRepo = new OutcomeRepository(),
    private walletRepo = new WalletRepository()
  ) {}

  async placeBet(userId: string, request: PlaceBetRequest): Promise<BetResult> {
    const {
      marketId,
      outcomeKey,
      side,
      stakePoints = 0,
      stakeTokenAmount = 0,
      tokenSymbol,
      price,
    } = request;

    // Validate inputs
    if (stakePoints <= 0 && stakeTokenAmount <= 0) {
      throw new ValidationError(
        "Must specify either stake points or token amount"
      );
    }

    if (stakePoints > 0 && stakeTokenAmount > 0) {
      throw new ValidationError(
        "Cannot specify both points and token stake in same bet"
      );
    }

    if (stakeTokenAmount > 0 && !tokenSymbol) {
      throw new ValidationError("Token symbol required for token bets");
    }

    // Get market and validate
    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    if (market.status !== "OPEN") {
      throw new ValidationError("Market is not open for betting");
    }

    // Check market timing
    const now = new Date();
    if (market.close_at && new Date(market.close_at) <= now) {
      throw new ValidationError("Market betting has closed");
    }

    // Get outcome
    const outcome = await this.outcomeRepo.findByMarketAndKey(
      marketId,
      outcomeKey
    );
    if (!outcome) {
      throw new NotFoundError("Outcome", outcomeKey);
    }

    // Get user's primary wallet
    const wallet = await this.walletRepo.findPrimaryWallet(userId);
    if (!wallet) {
      throw new ValidationError("User must have a primary wallet");
    }

    // For points bets, check user has sufficient balance
    if (stakePoints > 0) {
      const userBalance = await this.pointsRepo.getUserBalance(userId);
      if (userBalance < stakePoints) {
        throw new ValidationError(
          `Insufficient points. Balance: ${userBalance}, Required: ${stakePoints}`
        );
      }
    }

    // Calculate price if not provided
    const betPrice =
      price ||
      (await this.calculatePrice(
        outcome.id,
        side,
        stakePoints || stakeTokenAmount
      ));

    // Validate price range
    if (betPrice < 0.01 || betPrice > 0.99) {
      throw new ValidationError("Price must be between 0.01 and 0.99");
    }

    // Execute bet transaction atomically
    return await this.executeBetTransaction(userId, wallet.id, outcome, {
      side,
      price: betPrice,
      stakePoints,
      stakeTokenAmount,
      tokenSymbol,
    });
  }

  private async executeBetTransaction(
    userId: string,
    walletId: string,
    outcome: any,
    betData: {
      side: string;
      price: number;
      stakePoints?: number;
      stakeTokenAmount?: number;
      tokenSymbol?: string;
    }
  ): Promise<BetResult> {
    // Use Supabase transaction or implement sequential operations with rollback
    const { data, error } = await supabase.rpc("place_bet_transaction", {
      p_user_id: userId,
      p_wallet_id: walletId,
      p_market_id: outcome.market_id,
      p_outcome_id: outcome.id,
      p_side: betData.side,
      p_price: betData.price,
      p_stake_points: betData.stakePoints,
      p_stake_token_amount: betData.stakeTokenAmount,
      p_token_symbol: betData.tokenSymbol,
    });

    if (error) {
      // Fallback to manual transaction
      return await this.manualBetTransaction(
        userId,
        walletId,
        outcome,
        betData
      );
    }

    return data;
  }

  private async manualBetTransaction(
    userId: string,
    walletId: string,
    outcome: any,
    betData: {
      side: string;
      price: number;
      stakePoints?: number;
      stakeTokenAmount?: number;
      tokenSymbol?: string;
    }
  ): Promise<BetResult> {
    // Step 1: Create bet record
    const createBetData: CreateBetData = {
      user_id: userId,
      wallet_id: walletId,
      market_id: outcome.market_id,
      outcome_id: outcome.id,
      side: betData.side as "yes" | "no" | "buy" | "sell",
      price: betData.price,
      stake_points: betData.stakePoints,
      stake_token_amount: betData.stakeTokenAmount,
      token_symbol: betData.tokenSymbol,
    };

    const bet = await this.betRepo.create(createBetData);

    let pointsEntry: any = null;
    let position: Position | null = null;

    try {
      // Step 2: Deduct points if points bet
      if (betData.stakePoints && betData.stakePoints > 0) {
        pointsEntry = await this.pointsRepo.addPoints({
          user_id: userId,
          reason: "bet_placed",
          delta: -betData.stakePoints,
          ref_type: "bet",
          ref_id: bet.id,
          metadata: {
            market_id: outcome.market_id,
            outcome_id: outcome.id,
            side: betData.side,
            price: betData.price,
          },
        });
      }

      // Step 3: Update or create position
      const existingPosition = await this.positionRepo.findByUserMarketOutcome(
        userId,
        outcome.market_id,
        outcome.id
      );

      if (existingPosition) {
        // Update existing position
        const newQtyPoints =
          (existingPosition.qty_points || 0) + (betData.stakePoints || 0);
        const newQtyTokens =
          (existingPosition.qty_token_amount || 0) +
          (betData.stakeTokenAmount || 0);
        const totalQty = newQtyPoints || newQtyTokens;
        const oldQty =
          existingPosition.qty_points ||
          0 ||
          existingPosition.qty_token_amount ||
          0;

        // Calculate new average price
        const newAvgPrice =
          totalQty > 0
            ? (existingPosition.avg_price * oldQty +
                betData.price *
                  (betData.stakePoints || betData.stakeTokenAmount || 0)) /
              totalQty
            : betData.price;

        position = await this.positionRepo.update(existingPosition.id, {
          qty_points: newQtyPoints,
          qty_token_amount: newQtyTokens,
          avg_price: newAvgPrice,
        });
      } else {
        // Create new position
        position = await this.positionRepo.create({
          user_id: userId,
          market_id: outcome.market_id,
          outcome_id: outcome.id,
          qty_points: betData.stakePoints,
          qty_token_amount: betData.stakeTokenAmount,
          avg_price: betData.price,
        });
      }

      // Step 4: Mark bet as filled
      const filledBet = await this.betRepo.update(bet.id, { status: "filled" });

      // Step 5: Write to outbox for realtime updates
      const outboxEvents = [
        {
          topic: topics.marketTrades(outcome.market_id),
          kind: eventTypes.BET_FILLED,
          payload: {
            bet: filledBet,
            position,
            user_id: userId,
          },
        },
        {
          topic: topics.marketTicker(outcome.market_id),
          kind: eventTypes.PRICE_UPDATED,
          payload: {
            market_id: outcome.market_id,
            outcome_id: outcome.id,
            price: betData.price,
            volume: betData.stakePoints || betData.stakeTokenAmount,
            timestamp: new Date().toISOString(),
          },
        },
        {
          topic: topics.userNotifications(userId),
          kind: eventTypes.USER_NOTIFICATION,
          payload: {
            user_id: userId,
            type: "bet_filled",
            title: "Bet Placed Successfully",
            message: `Your bet on ${outcome.name} has been placed`,
            bet_id: bet.id,
          },
        },
      ];

      if (pointsEntry) {
        outboxEvents.push({
          topic: topics.userNotifications(userId),
          kind: eventTypes.USER_POINTS_UPDATED as any,
          payload: {
            user_id: userId,
            delta: pointsEntry.delta,
            balance: pointsEntry.balance_after,
            reason: pointsEntry.reason,
          } as any,
        });
      }

      await writeToOutboxBatch(outboxEvents);

      return {
        bet: filledBet,
        position,
        pointsEntry,
      };
    } catch (error) {
      // Rollback: mark bet as failed
      await this.betRepo.update(bet.id, { status: "failed" });
      throw error;
    }
  }

  private async calculatePrice(
    outcomeId: string,
    side: string,
    stake: number
  ): Promise<number> {
    // Simple price calculation - in production you'd want more sophisticated pricing
    // Get recent trades to determine current price
    const recentBets = await this.betRepo.list({
      filters: { outcome_id: outcomeId, status: ["filled"] },
      limit: 10,
      orderBy: "created_at",
      orderDir: "desc",
    });

    if (recentBets.bets.length === 0) {
      // No recent trades, use initial price or default
      return 0.5;
    }

    // Use price of most recent trade
    const lastPrice = recentBets.bets[0].price;

    // Add small spread based on side
    const spread = 0.01;
    return side === "buy" || side === "yes"
      ? Math.min(0.99, lastPrice + spread)
      : Math.max(0.01, lastPrice - spread);
  }

  async getBet(betId: string, userId?: string): Promise<Bet> {
    const bet = await this.betRepo.findWithDetails(betId);
    if (!bet) {
      throw new NotFoundError("Bet", betId);
    }

    // Check if user has permission to view this bet
    if (userId && bet.user_id !== userId) {
      throw new ForbiddenError("Cannot view other users' bets");
    }

    return bet;
  }

  async listBets(
    params: {
      filters?: BetFilters;
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

    const result = await this.betRepo.list({
      ...restParams,
      offset,
      limit,
    });

    const totalPages = Math.ceil(result.total / limit);

    return {
      bets: result.bets,
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

  async getUserBets(
    userId: string,
    params: {
      marketId?: string;
      status?: string[];
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;
    const offset = (page - 1) * limit;

    const bets = await this.betRepo.getUserBets(userId, {
      ...restParams,
      offset,
      limit,
    });

    return { bets };
  }

  async getMarketBets(
    marketId: string,
    params: {
      outcomeId?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;
    const offset = (page - 1) * limit;

    const bets = await this.betRepo.getMarketBets(marketId, {
      ...restParams,
      offset,
      limit,
    });

    return { bets };
  }

  async cancelBet(betId: string, userId: string): Promise<Bet> {
    const bet = await this.betRepo.findById(betId);
    if (!bet) {
      throw new NotFoundError("Bet", betId);
    }

    if (bet.user_id !== userId) {
      throw new ForbiddenError("Can only cancel your own bets");
    }

    if (bet.status !== "pending") {
      throw new ValidationError("Can only cancel pending bets");
    }

    // Refund points if applicable
    if (bet.stake_points && bet.stake_points > 0) {
      await this.pointsRepo.addPoints({
        user_id: userId,
        reason: "bet_cancelled",
        delta: bet.stake_points,
        ref_type: "bet",
        ref_id: bet.id,
        metadata: {
          original_bet_id: bet.id,
        },
      });
    }

    const cancelledBet = await this.betRepo.update(betId, {
      status: "cancelled",
    });

    // Notify user
    await writeToOutbox({
      topic: topics.userNotifications(userId),
      kind: eventTypes.USER_NOTIFICATION,
      payload: {
        user_id: userId,
        type: "bet_cancelled",
        title: "Bet Cancelled",
        message: "Your bet has been cancelled and points refunded",
        bet_id: betId,
      },
    });

    return cancelledBet;
  }

  async getBetStats(
    params: {
      userId?: string;
      marketId?: string;
      period?: string;
    } = {}
  ) {
    return this.betRepo.getBetStats(params);
  }
}
