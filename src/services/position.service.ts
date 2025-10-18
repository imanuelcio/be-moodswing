import { PositionRepository, type Position } from "../repo/position.repo.js";
import { MarketRepository } from "../repo/market.repo.js";
import { OutcomeRepository } from "../repo/outcome.repo.js";
import { PointsRepository } from "../repo/points.repo.js";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
} from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox } from "../core/outbox.js";

export class PositionService {
  constructor(
    private positionRepo = new PositionRepository(),
    private marketRepo = new MarketRepository(),
    private outcomeRepo = new OutcomeRepository(),
    private pointsRepo = new PointsRepository()
  ) {}

  async getUserPositions(
    userId: string,
    params: {
      marketId?: string;
      minQuantity?: number;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;
    const offset = (page - 1) * limit;

    const positions = await this.positionRepo.getUserPositions(userId, {
      ...restParams,
      offset,
      limit,
    });

    // Calculate unrealized P&L for each position
    const positionsWithPnL = await Promise.all(
      positions.map(async (position) => {
        const unrealizedPnL = await this.calculateUnrealizedPnL(position);
        return { ...position, unrealized_pnl: unrealizedPnL };
      })
    );

    return { positions: positionsWithPnL };
  }

  async getMarketPositions(
    marketId: string,
    params: {
      outcomeId?: string;
      page?: number;
      limit?: number;
    } = {}
  ) {
    const { page = 1, limit = 20, ...restParams } = params;
    const offset = (page - 1) * limit;

    const market = await this.marketRepo.findById(marketId);
    if (!market) {
      throw new NotFoundError("Market", marketId);
    }

    const positions = await this.positionRepo.getMarketPositions(marketId, {
      ...restParams,
      offset,
      limit,
    });

    return { positions };
  }

  async getPosition(positionId: string, userId?: string): Promise<Position> {
    const position = await this.positionRepo.findById(positionId);
    if (!position) {
      throw new NotFoundError("Position", positionId);
    }

    // Check if user has permission to view this position
    if (userId && position.user_id !== userId) {
      throw new ForbiddenError("Cannot view other users' positions");
    }

    return position;
  }

  private async calculateUnrealizedPnL(position: Position): Promise<number> {
    // Get current market price for the outcome
    const outcome = await this.outcomeRepo.getOutcomeStats(position.outcome_id);
    const currentPrice = outcome.current_price || position.avg_price;

    const quantity = position.qty_points || position.qty_token_amount || 0;
    const costBasis = position.avg_price * quantity;
    const currentValue = currentPrice * quantity;

    return currentValue - costBasis;
  }

  async closePosition(
    positionId: string,
    userId: string,
    params: {
      quantity?: number; // Partial close if specified
      price?: number; // If not specified, use current market price
    } = {}
  ): Promise<{ position: Position; pointsEntry?: any }> {
    const position = await this.positionRepo.findById(positionId);
    if (!position) {
      throw new NotFoundError("Position", positionId);
    }

    if (position.user_id !== userId) {
      throw new ForbiddenError("Can only close your own positions");
    }

    const { quantity, price } = params;
    const currentQty = position.qty_points || position.qty_token_amount || 0;

    if (currentQty <= 0) {
      throw new ValidationError("Position has no quantity to close");
    }

    const closeQty = quantity && quantity < currentQty ? quantity : currentQty;
    const closePrice =
      price || (await this.getCurrentPrice(position.outcome_id));

    // Calculate P&L
    const costBasis = position.avg_price * closeQty;
    const saleValue = closePrice * closeQty;
    const realizedPnL = saleValue - costBasis;

    // Update position
    const newQty = currentQty - closeQty;
    const newRealizedPnL = (position.realized_pnl_pts || 0) + realizedPnL;

    const updatedPosition = await this.positionRepo.update(positionId, {
      qty_points: position.qty_points ? newQty : undefined,
      qty_token_amount: position.qty_token_amount ? newQty : undefined,
      realized_pnl_pts: position.qty_points ? newRealizedPnL : undefined,
      realized_pnl_token: position.qty_token_amount
        ? newRealizedPnL
        : undefined,
    });

    // Add points if this was a points position with profit
    let pointsEntry: any = null;
    if (position.qty_points && realizedPnL > 0) {
      pointsEntry = await this.pointsRepo.addPoints({
        user_id: userId,
        reason: "position_closed",
        delta: Math.round(realizedPnL),
        ref_type: "position",
        ref_id: positionId,
        metadata: {
          market_id: position.market_id,
          outcome_id: position.outcome_id,
          close_price: closePrice,
          quantity: closeQty,
          realized_pnl: realizedPnL,
        },
      });
    }

    // Notify user
    await writeToOutbox({
      topic: topics.userNotifications(userId),
      kind: eventTypes.USER_NOTIFICATION,
      payload: {
        user_id: userId,
        type: "position_closed",
        title: "Position Closed",
        message: `Position closed with ${
          realizedPnL > 0 ? "profit" : "loss"
        }: ${realizedPnL.toFixed(2)}`,
        position_id: positionId,
      },
    });

    return { position: updatedPosition, pointsEntry };
  }

  private async getCurrentPrice(outcomeId: string): Promise<number> {
    const stats = await this.outcomeRepo.getOutcomeStats(outcomeId);
    return stats.current_price || 0.5; // Default to 0.5 if no trades
  }

  async getPositionStats(
    params: {
      userId?: string;
      marketId?: string;
    } = {}
  ) {
    return this.positionRepo.getPositionStats(params);
  }

  async liquidatePositions(
    marketId: string,
    outcomeId: string
  ): Promise<number> {
    // This would be called when a market resolves
    // Liquidate all positions for the losing outcome
    const positions = await this.positionRepo.getMarketPositions(marketId, {
      outcomeId,
      limit: 1000, // Process in batches for large markets
    });

    let liquidatedCount = 0;

    for (const position of positions) {
      if (
        (position.qty_points || 0) > 0 ||
        (position.qty_token_amount || 0) > 0
      ) {
        await this.positionRepo.liquidatePosition(
          position.user_id,
          marketId,
          outcomeId
        );
        liquidatedCount++;
      }
    }

    return liquidatedCount;
  }
}
