import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller.js";
import { validateRequest } from "../middleware/validation.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  nonceSchema,
  verifySchema,
  logoutSchema,
} from "../schemas/auth.schema.js";

const router = new Hono();
const authController = new AuthController();

// Apply rate limiting to auth endpoints
router.use("*", rateLimiter(10, 60 * 1000)); // 10 requests per minute

// Public routes
router.post("/nonce", validateRequest("json", nonceSchema), (c) =>
  authController.getNonce(c)
);

router.post("/verify", validateRequest("json", verifySchema), (c) =>
  authController.verifySignature(c)
);

router.post("/logout", validateRequest("json", logoutSchema), (c) =>
  authController.logout(c)
);

router.get("/session", (c) => authController.checkSession(c));

router.post("/refresh", (c) => authController.refreshToken(c));

export default router;
