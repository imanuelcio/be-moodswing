import { Hono } from "hono";
import { AdminController } from "../controllers/admin.controller.js";
import { createAdminMiddleware } from "../middleware/auth.middleware.js";
const admin = new Hono();
const adminController = new AdminController();
// All admin endpoints require admin authentication
admin.use("/*", createAdminMiddleware());
// System monitoring
admin.get("/stats", adminController.getSystemStats.bind(adminController));
admin.get("/clients", adminController.getConnectedClients.bind(adminController));
// Outbox management
admin.get("/outbox/events", adminController.getOutboxEvents.bind(adminController));
admin.post("/outbox/retry", adminController.retryFailedEvents.bind(adminController));
admin.post("/outbox/purge", adminController.purgeOldEvents.bind(adminController));
admin.post("/outbox/test", adminController.sendTestEvent.bind(adminController));
export { admin };
