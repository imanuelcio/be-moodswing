import { sseManager } from "../core/sse.js";
import { topics } from "../core/topics.js";
import { MarketRepository } from "../repo/market.repo.js";
import { OutcomeRepository } from "../repo/outcome.repo.js";
import { BetRepository } from "../repo/bet.repo.js";
import { formatError, ValidationError, NotFoundError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { ensureHermesPriceStream, fetchHermesLatest, releaseHermesPriceStream, } from "../workers/hermes-pool.js";
export class SSEController {
    marketRepo;
    outcomeRepo;
    betRepo;
    constructor(marketRepo = new MarketRepository(), outcomeRepo = new OutcomeRepository(), betRepo = new BetRepository()) {
        this.marketRepo = marketRepo;
        this.outcomeRepo = outcomeRepo;
        this.betRepo = betRepo;
    }
    async streamMarketTicker(c) {
        try {
            const marketId = c.req.param("id");
            // Validate market exists
            const market = await this.marketRepo.findById(marketId);
            if (!market) {
                return c.json(formatError(new NotFoundError("Market", marketId)), 404);
            }
            const { pyth_price_id: priceId, symbol } = market;
            if (!priceId || !symbol) {
                return c.json(formatError(new Error("Market missing priceId/symbol")), 400);
            }
            const clientId = `market-${marketId}-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 11)}`;
            const { client, response } = sseManager.createSSEConnection(c, clientId);
            // Subscribe to market topics
            sseManager.subscribeToTopic(clientId, topics.marketTicker(marketId));
            sseManager.subscribeToTopic(clientId, topics.marketTrades(marketId));
            sseManager.subscribeToTopic(clientId, topics.marketResolved(marketId));
            // Send initial snapshot
            await this.sendMarketSnapshot(client, marketId);
            const latest = await fetchHermesLatest(priceId);
            if (latest) {
                sseManager.publish(topics.marketTicker(marketId), "price", {
                    symbol,
                    priceId,
                    source: "PYTH/HERMES",
                    ...latest,
                });
            }
            // === KUNCI: restream dari Hermes → publish ke topik ticker market ini
            // Pastikan hanya satu koneksi upstream per priceId (HermesPool)
            ensureHermesPriceStream(priceId, symbol, (payload) => {
                // broadcast ke semua client yg subscribe market ini
                sseManager.publish(topics.marketTicker(marketId), "price", payload);
            });
            // Auto cleanup saat koneksi klien ini tutup
            c.req.raw.signal?.addEventListener("abort", () => {
                client.close();
                // turunkan refcount; hentikan upstream jika tak ada pemakai lain
                releaseHermesPriceStream(priceId);
            });
            return response;
        }
        catch (error) {
            logger.error({ error }, "Failed to create market ticker stream");
            return c.json(formatError(error), 500);
        }
    }
    async streamSentiment(c) {
        try {
            const symbol = c.req.query("symbol");
            if (!symbol) {
                return c.json(formatError(new ValidationError("Symbol parameter required")), 400);
            }
            const clientId = `sentiment-${symbol}-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            // Create SSE connection - DESTRUCTURE the return value
            const { client, response } = sseManager.createSSEConnection(c, clientId);
            // Subscribe to sentiment topic
            sseManager.subscribeToTopic(clientId, topics.symbolSentiment(symbol));
            // Send initial sentiment data
            await this.sendSentimentSnapshot(client, symbol);
            // Handle connection close
            c.req.raw.signal?.addEventListener("abort", () => {
                client.close();
            });
            return response;
        }
        catch (error) {
            logger.error({ error }, "Failed to create sentiment stream");
            return c.json(formatError(error), 500);
        }
    }
    async streamLeaderboard(c) {
        try {
            const period = c.req.query("period") || "all";
            const metric = c.req.query("metric") || "points";
            const clientId = `leaderboard-${period}-${metric}-${Date.now()}-${Math.random()
                .toString(36)
                .substr(2, 9)}`;
            // Create SSE connection - DESTRUCTURE the return value
            const { client, response } = sseManager.createSSEConnection(c, clientId);
            // Subscribe to leaderboard topic
            sseManager.subscribeToTopic(clientId, topics.leaderboardUpdate(period, metric));
            // Send initial leaderboard data
            await this.sendLeaderboardSnapshot(client, period, metric);
            // Handle connection close
            c.req.raw.signal?.addEventListener("abort", () => {
                client.close();
            });
            return response;
        }
        catch (error) {
            logger.error({ error }, "Failed to create leaderboard stream");
            return c.json(formatError(error), 500);
        }
    }
    async sendMarketSnapshot(client, marketId) {
        try {
            // Ambil data paralel biar respons lebih cepat
            const [market, stats, outcomesWithStats, recentBets] = await Promise.all([
                this.marketRepo.findWithOutcomes(marketId),
                this.marketRepo.getMarketStats(marketId),
                this.outcomeRepo.getOutcomesWithStats(marketId),
                this.betRepo.getMarketBets(marketId, { limit: 10 }),
            ]);
            if (!market) {
                client.send("error", { message: `Market ${marketId} not found` });
                return;
            }
            const snapshot = {
                market: {
                    ...market,
                    market_outcomes: outcomesWithStats ?? [],
                    stats: stats ?? {
                        volume_24h: 0,
                        open_interest: 0,
                        total_bets: 0,
                        unique_bettors: 0,
                    },
                },
                recentBets: (recentBets ?? []).slice(0, 10),
                timestamp: new Date().toISOString(),
            };
            // kirim event terstruktur
            client.send("market_snapshot", snapshot);
        }
        catch (error) {
            logger.error({ error, marketId }, "Failed to send market snapshot");
            client.send("error", {
                message: "Failed to load market snapshot",
                marketId,
            });
        }
    }
    async sendSentimentSnapshot(client, symbol) {
        try {
            // Get latest sentiment data for symbol
            // This would integrate with your sentiment repository
            const snapshot = {
                type: "snapshot",
                data: {
                    symbol,
                    sentiment: {
                        score: 0.65,
                        confidence: 0.8,
                        volume: 1250,
                        timestamp: new Date().toISOString(),
                    },
                    recentPosts: [],
                },
            };
            client.send(`data: ${JSON.stringify(snapshot)}\n\n`);
        }
        catch (error) {
            logger.error({ error, symbol }, "Failed to send sentiment snapshot");
        }
    }
    async sendLeaderboardSnapshot(client, period, metric) {
        try {
            // Get leaderboard data
            // This would integrate with your leaderboard/points repository
            const snapshot = {
                type: "snapshot",
                data: {
                    period,
                    metric,
                    leaderboard: [],
                    lastUpdated: new Date().toISOString(),
                },
            };
            client.send(`data: ${JSON.stringify(snapshot)}\n\n`);
        }
        catch (error) {
            logger.error({ error, period, metric }, "Failed to send leaderboard snapshot");
        }
    }
    async getSSEStats(c) {
        try {
            const stats = sseManager.getStats();
            return c.json({ stats });
        }
        catch (error) {
            logger.error({ error }, "Failed to get SSE stats");
            return c.json(formatError(error), 500);
        }
    }
}
