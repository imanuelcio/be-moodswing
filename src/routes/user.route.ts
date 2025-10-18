import { Hono } from "hono";
import { UserController } from "../controllers/user.controller.js";
import { createJwtMiddleware } from "../middleware/auth.middleware.js";

const user = new Hono();
const userController = new UserController();

// Protected user endpoints
user.use("/*", createJwtMiddleware());

user.get("/profile", userController.getProfile.bind(userController));
user.put("/profile", userController.updateProfile.bind(userController));

// Public endpoints for user discovery
user.get("/search", userController.searchUsers.bind(userController));
user.get("/stats", userController.getUserStats.bind(userController));
user.get("/:id", userController.getUserById.bind(userController));

export { user };
