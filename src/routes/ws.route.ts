import { Hono } from "hono";
import { WSController } from "../controllers/ws.controller.js";
import { createAdminMiddleware } from "../middleware/auth.middleware.js";

const ws = new Hono();
const wsController = new WSController();

// WebSocket upgrade endpoint
ws.get("/", wsController.upgradeToWebSocket.bind(wsController));

// Admin endpoints
ws.use("/admin/*", createAdminMiddleware());
ws.get("/admin/stats", wsController.getWSStats.bind(wsController));
ws.post(
  "/admin/notify/:userId",
  wsController.sendUserNotification.bind(wsController)
);
ws.post(
  "/admin/broadcast/:topic",
  wsController.broadcastToTopic.bind(wsController)
);

export { ws };
