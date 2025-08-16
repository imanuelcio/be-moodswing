import { Hono } from "hono";
import { UserController } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validation.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  updateProfileSchema,
  updateMetadataSchema,
  listUsersSchema,
  userIdSchema,
} from "../schemas/user.schema.js";

const router = new Hono();
const userController = new UserController();

// All routes require authentication
router.use("*", authMiddleware);

// Apply different rate limits for different endpoints
const standardRateLimit = rateLimiter(100, 60 * 1000); // 100 requests per minute
const strictRateLimit = rateLimiter(5, 60 * 1000); // 5 requests per minute

// User routes
router.get("/profile", standardRateLimit, (c) => userController.getProfile(c));

router.patch(
  "/profile",
  strictRateLimit,
  validateRequest("json", updateProfileSchema),
  (c) => userController.updateProfile(c)
);

router.patch(
  "/metadata",
  strictRateLimit,
  validateRequest("json", updateMetadataSchema),
  (c) => userController.updateMetadata(c)
);

router.get(
  "/list",
  standardRateLimit,
  validateRequest("query", listUsersSchema),
  (c) => userController.listUsers(c)
);

router.get("/stats", standardRateLimit, (c) => userController.getUserStats(c));

router.get("/:id", standardRateLimit, (c) => userController.getUserById(c));

router.delete("/account", strictRateLimit, (c) =>
  userController.deleteAccount(c)
);

export default router;
