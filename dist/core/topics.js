export const topics = {
    // Market updates
    marketTicker: (marketId) => `market:${marketId}:ticker`,
    marketTrades: (marketId) => `market:${marketId}:trades`,
    marketResolved: (marketId) => `market:${marketId}:resolved`,
    // User notifications
    userNotifications: (userId) => `user:${userId}:notifications`,
    userRelayer: (userId) => `user:${userId}:relayer`,
    // Sentiment updates
    symbolSentiment: (symbol) => `symbol:${symbol}:sentiment`,
    // Leaderboard updates
    leaderboardUpdate: (period, metric) => `leaderboard:${period}:${metric}`,
    // System events
    systemMaintenance: () => "system:maintenance",
    systemStatus: () => "system:status",
};
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
};
