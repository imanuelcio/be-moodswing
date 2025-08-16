import type { Context } from "hono";
import { getCookie, deleteCookie } from "hono/cookie";
import { UserService } from "../services/user.service.js";
import { SupabaseService } from "../services/supabase.service.js";
import { ApiResponseBuilder } from "../utils/apiResponse.js";
import {
  sanitizeEmail,
  sanitizeString,
  sanitizeMetadata,
} from "../validation/sanitizers.js";

export class UserController {
  private userService: UserService;
  private supabaseService: SupabaseService;

  constructor() {
    this.userService = new UserService();
    this.supabaseService = new SupabaseService();
  }

  async getProfile(c: Context) {
    try {
      const { userId } = c.get("user");

      const user = await this.supabaseService.getUserById(userId);

      if (!user) {
        return ApiResponseBuilder.notFound(c, "User profile");
      }

      return ApiResponseBuilder.success(c, {
        id: user.id,
        wallet_address: user.wallet_address,
        fullname: user.fullname,
        email: user.email,
        metadata: user.metadata,
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_login: user.last_login,
      });
    } catch (error: any) {
      console.error("Profile fetch error:", error);
      return ApiResponseBuilder.error(c, "Failed to fetch profile", 500);
    }
  }

  async updateProfile(c: Context) {
    try {
      const { userId } = c.get("user");
      const validatedData = c.get("validatedData");

      const updateData: any = {};

      if (validatedData.fullname) {
        updateData.fullname = sanitizeString(validatedData.fullname);
      }

      if (validatedData.email) {
        const sanitizedEmail = sanitizeEmail(validatedData.email);

        // Check if email already exists
        const existingUser = await this.supabaseService.getUserByEmail(
          sanitizedEmail
        );
        if (existingUser && existingUser.id !== userId) {
          return ApiResponseBuilder.error(c, "Email already in use", {
            field: "email",
          });
        }

        updateData.email = sanitizedEmail;
      }

      const updatedUser = await this.supabaseService.updateUser(userId, {
        ...updateData,
        updated_at: new Date().toISOString(),
      });

      return ApiResponseBuilder.success(
        c,
        updatedUser,
        "Profile updated successfully"
      );
    } catch (error: any) {
      console.error("Profile update error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to update profile",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async updateMetadata(c: Context) {
    try {
      const { userId } = c.get("user");
      const validatedData = c.get("validatedData");

      const user = await this.supabaseService.getUserById(userId);

      if (!user) {
        return ApiResponseBuilder.notFound(c, "User");
      }

      // Sanitize and merge metadata
      const sanitizedMetadata = sanitizeMetadata(validatedData.metadata);
      const mergedMetadata = {
        ...(user.metadata || {}),
        ...sanitizedMetadata,
      };

      const updatedUser = await this.supabaseService.updateUser(userId, {
        metadata: mergedMetadata,
        updated_at: new Date().toISOString(),
      });

      return ApiResponseBuilder.success(
        c,
        updatedUser,
        "Metadata updated successfully"
      );
    } catch (error: any) {
      console.error("Metadata update error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to update metadata",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async getUserById(c: Context) {
    try {
      const id = c.req.param("id");

      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return ApiResponseBuilder.error(c, "Invalid user ID format", 400);
      }

      const user = await this.supabaseService.getUserById(id);

      if (!user) {
        return ApiResponseBuilder.notFound(c, "User");
      }

      // Return limited public information
      return ApiResponseBuilder.success(c, {
        id: user.id,
        wallet_address: user.wallet_address,
        fullname: user.fullname,
        created_at: user.created_at,
        metadata: {
          avatar: user.metadata?.avatar,
          bio: user.metadata?.bio,
        },
      });
    } catch (error: any) {
      console.error("User fetch error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to fetch user",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async listUsers(c: Context) {
    try {
      const query = c.req.query();
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "10");
      const search = query.search || "";

      // Validate pagination params
      if (page < 1 || limit < 1 || limit > 100) {
        return ApiResponseBuilder.error(c, "Invalid pagination parameters", {
          page: "Must be >= 1",
          limit: "Must be between 1 and 100",
        });
      }

      const result = await this.supabaseService.listUsers({
        page,
        limit,
        search,
      });

      return ApiResponseBuilder.paginated(
        c,
        result.users.map((user) => ({
          id: user.id,
          wallet_address: user.wallet_address,
          fullname: user.fullname,
          email: user.email,
          created_at: user.created_at,
          last_login: user.last_login,
        })),
        {
          total: result.total,
          page: result.page,
          limit,
          totalPages: result.totalPages,
        }
      );
    } catch (error: any) {
      console.error("User list error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to fetch users",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async deleteAccount(c: Context) {
    try {
      const { userId } = c.get("user");

      // Optional: Add confirmation check
      const confirmationToken = c.req.header("X-Confirmation-Token");
      if (!confirmationToken) {
        return ApiResponseBuilder.error(
          c,
          "Account deletion requires confirmation",
          { hint: "Include X-Confirmation-Token header" }
        );
      }

      // Delete user
      await this.supabaseService.deleteUser(userId);

      // Clear cookies
      deleteCookie(c, "access_token", { path: "/" });
      deleteCookie(c, "refresh_token", { path: "/" });

      return ApiResponseBuilder.success(
        c,
        null,
        "Account deleted successfully"
      );
    } catch (error: any) {
      console.error("Account deletion error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to delete account",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async getUserStats(c: Context) {
    try {
      const { userId } = c.get("user");

      const stats = await this.userService.getUserStats(userId);

      if (!stats) {
        return ApiResponseBuilder.notFound(c, "User");
      }

      return ApiResponseBuilder.success(c, stats);
    } catch (error: any) {
      console.error("User stats error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to fetch user statistics",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }
}
