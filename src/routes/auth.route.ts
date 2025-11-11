import { Hono } from "hono";
import { AuthController } from "../controllers/auth.controller.js";
import {
  createJwtMiddleware,
  createApiKeyMiddleware,
} from "../middleware/auth.middleware.js";

const auth = new Hono();
const authController = new AuthController();

// Public auth endpoints
auth.post("/nonce", authController.generateNonce.bind(authController));
auth.post("/verify", authController.verifySignature.bind(authController));
auth.post("/logout", authController.logout.bind(authController));
// Protected endpoints (require JWT)
auth.use("/profile", createJwtMiddleware());
auth.get("/profile", authController.getProfile.bind(authController));

auth.use("/api-keys/*", createJwtMiddleware());
auth.post("/api-keys", authController.createApiKey.bind(authController));
auth.get("/api-keys", authController.listApiKeys.bind(authController));
auth.delete(
  "/api-keys/:keyId",
  authController.revokeApiKey.bind(authController)
);

export { auth };
