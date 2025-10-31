import { z } from "zod";
import { UserService } from "../services/user.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import { searchUsersSchema, updateUserSchema } from "../schemas/user.schema.js";
export class UserController {
    userService;
    constructor(userService = new UserService()) {
        this.userService = userService;
    }
    async getProfile(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const profile = await this.userService.getUserProfile(userId);
            return c.json({ profile });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get user profile");
            return c.json(formatError(error), 500);
        }
    }
    async updateProfile(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const body = await c.req.json();
            const userData = updateUserSchema.parse(body);
            const user = await this.userService.updateUser(userId, userData);
            const logger = c.get("logger");
            logger.info({ userId }, "User profile updated");
            return c.json({ user });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to update user profile");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async searchUsers(c) {
        try {
            const query = c.req.query();
            const params = searchUsersSchema.parse(query);
            const result = await this.userService.searchUsers(params);
            return c.json(result);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to search users");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async getUserById(c) {
        try {
            const userId = c.req.param("id");
            const user = await this.userService.getUserById(userId);
            return c.json({ user });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get user by ID");
            return c.json(formatError(error), 500);
        }
    }
    async getUserStats(c) {
        try {
            const stats = await this.userService.getUserStats();
            return c.json({ stats });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get user stats");
            return c.json(formatError(error), 500);
        }
    }
}
