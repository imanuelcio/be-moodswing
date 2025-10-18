import type { Context } from "hono";
import { wsManager } from "../core/ws.js";
import { formatError } from "../core/errors.js";
import { logger } from "../core/logger.js";

export class WSController {
  async upgradeToWebSocket(c: Context) {
    try {
      const token =
        c.req.query("token") ||
        c.req.header("Authorization")?.replace("Bearer ", "");

      if (!token) {
        return c.json(
          formatError(new Error("Authentication token required")),
          401
        );
      }

      // This is a simplified example - actual WebSocket upgrade depends on your server setup
      // In Hono with Node.js, you'd typically handle this differently

      return c.json({
        message: "WebSocket upgrade endpoint",
        instructions:
          "Connect to /realtime with token parameter or Authorization header",
      });
    } catch (error) {
      logger.error({ error }, "Failed to upgrade to WebSocket");
      return c.json(formatError(error as Error), 500);
    }
  }

  async getWSStats(c: Context) {
    try {
      const stats = wsManager.getStats();
      return c.json({ stats });
    } catch (error) {
      logger.error({ error }, "Failed to get WebSocket stats");
      return c.json(formatError(error as Error), 500);
    }
  }

  async sendUserNotification(c: Context) {
    try {
      const userId = c.req.param("userId");
      const body = await c.req.json();

      wsManager.sendToUser(userId, body);

      return c.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to send user notification");
      return c.json(formatError(error as Error), 500);
    }
  }

  async broadcastToTopic(c: Context) {
    try {
      const topic = c.req.param("topic");
      const body = await c.req.json();

      wsManager.sendToTopic(topic, body);

      return c.json({ success: true });
    } catch (error) {
      logger.error({ error }, "Failed to broadcast to topic");
      return c.json(formatError(error as Error), 500);
    }
  }
}
