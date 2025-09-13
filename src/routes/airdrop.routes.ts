import { Hono } from "hono";
import * as airdropController from "../controllers/airdrop.controller.js";
import { authMiddleware, requireAdmin } from "../middleware/auth.js";
import { requireIdempotencyKey } from "../lib/idempotency.js";

const airdropRoutes = new Hono();
airdropRoutes.post(
  "/snapshot",
  authMiddleware,
  requireAdmin(),
  airdropController.useCreateSnapshot
);
airdropRoutes.get(
  "/snapshots",
  authMiddleware,
  requireAdmin(),
  airdropController.getSnapshots
);
airdropRoutes.get("/snapshots/:period", airdropController.useGetSnapshotData);
airdropRoutes.get("/user/:userId/:period", airdropController.getUserAllocation);
airdropRoutes.delete(
  "/snapshots/:period",
  authMiddleware,
  requireAdmin(),
  airdropController.deleteSnapshot
);

export default airdropRoutes;
