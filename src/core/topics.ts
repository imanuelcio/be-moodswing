export const topics = {
  // Market updates
  marketTicker: (marketId: string) => `market:${marketId}:ticker`,
  marketTrades: (marketId: string) => `market:${marketId}:trades`,
  marketResolved: (marketId: string) => `market:${marketId}:resolved`,
  marketCandles: (marketId: string) => `market:${marketId}`,
  // User notifications
  userNotifications: (userId: string) => `user:${userId}:notifications`,
  userRelayer: (userId: string) => `user:${userId}:relayer`,

  // Sentiment updates
  symbolSentiment: (symbol: string) => `symbol:${symbol}:sentiment`,

  // Leaderboard updates
  leaderboardUpdate: (period: string, metric: string) =>
    `leaderboard:${period}:${metric}`,

  // System events
  systemMaintenance: () => "system:maintenance",
  systemStatus: () => "system:status",
} as const;

// Event types for outbox
export const eventTypes = {
  // Bet events
  BET_PLACED: "bet.placed",
  BET_FILLED: "bet.filled",
  BET_FAILED: "bet.failed",

  // Market events
  MARKET_CREATED: "market.created",
  MARKET_UPDATED: "market.updated",
  MARKET_RESOLVED: "market.resolved",
  PRICE_UPDATED: "price.updated",

  // User events
  USER_NOTIFICATION: "user.notification",
  USER_POINTS_UPDATED: "user.points.updated",

  // Sentiment events
  SENTIMENT_UPDATED: "sentiment.updated",

  // Relayer events
  RELAYER_TX_UPDATED: "relayer.tx.updated",

  // Reward events
  REWARDS_DISTRIBUTED: "rewards.distributed",
} as const;

export type EventType = (typeof eventTypes)[keyof typeof eventTypes];
export type Topic = ReturnType<(typeof topics)[keyof typeof topics]>;
