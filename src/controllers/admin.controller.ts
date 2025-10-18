import type { Context } from "hono";
import { OutboxRepository } from "../repo/outbox.repo.js";
import { sseManager } from "../core/sse.js";
import { wsManager } from "../core/ws.js";
import { formatError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { OutboxWorker } from "../workers/outBoxWorker.js";

export class AdminController {
  constructor(
    private outboxRepo = new OutboxRepository(),
    private outboxWorker = new OutboxWorker()
  ) {}

  async getSystemStats(c: Context) {
    try {
      const [outboxStats, sseStats, wsStats] = await Promise.all([
        this.outboxRepo.getStats(),
        Promise.resolve(sseManager.getStats()),
        Promise.resolve(wsManager.getStats()),
      ]);

      return c.json({
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        },
        outbox: outboxStats,
        sse: sseStats,
        websocket: wsStats,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get system stats");
      return c.json(formatError(error as Error), 500);
    }
  }

  async getOutboxEvents(c: Context) {
    try {
      const limit = parseInt(c.req.query("limit") || "100");
      const events = await this.outboxRepo.getRecentEvents(limit);

      return c.json({ events });
    } catch (error) {
      logger.error({ error }, "Failed to get outbox events");
      return c.json(formatError(error as Error), 500);
    }
  }

  async retryFailedEvents(c: Context) {
    try {
      const retryCount = await this.outboxWorker.retryFailedEvents();

      logger.info({ retryCount }, "Failed events retry initiated");

      return c.json({
        success: true,
        retriedCount: retryCount,
      });
    } catch (error) {
      logger.error({ error }, "Failed to retry failed events");
      return c.json(formatError(error as Error), 500);
    }
  }

  async purgeOldEvents(c: Context) {
    try {
      const days = parseInt(c.req.query("days") || "7");
      const purgedCount = await this.outboxWorker.purgeOldEvents(days);

      logger.info({ purgedCount, days }, "Old events purged");

      return c.json({
        success: true,
        purgedCount,
      });
    } catch (error) {
      logger.error({ error }, "Failed to purge old events");
      return c.json(formatError(error as Error), 500);
    }
  }

  async sendTestEvent(c: Context) {
    try {
      const body = await c.req.json();
      const { topic, kind, payload } = body;

      await this.outboxRepo.create({
        topic,
        kind,
        payload,
      });

      logger.info({ topic, kind }, "Test event created");

      return c.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to send test event");
      return c.json(formatError(error as Error), 500);
    }
  }

  async getConnectedClients(c: Context) {
    try {
      const sseStats = sseManager.getStats();
      const wsStats = wsManager.getStats();

      return c.json({
        sse: sseStats,
        websocket: wsStats,
        total: sseStats.totalClients + wsStats.totalClients,
      });
    } catch (error) {
      logger.error({ error }, "Failed to get connected clients");
      return c.json(formatError(error as Error), 500);
    }
  }
}
