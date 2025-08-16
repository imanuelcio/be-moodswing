import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { AuthService } from "../services/auth.service.js";
import { SupabaseService } from "../services/supabase.service.js";
import {
  generateNonce,
  createSignMessage,
  verifySignature,
} from "../utils/crypto.js";
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
} from "../utils/jwt.js";
import { ApiResponseBuilder } from "../utils/apiResponse.js";
import { sanitizeWalletAddress } from "../validation/sanitizers.js";

export class AuthController {
  private authService: AuthService;
  private supabaseService: SupabaseService;

  constructor() {
    this.authService = new AuthService();
    this.supabaseService = new SupabaseService();
  }

  async getNonce(c: Context) {
    try {
      const validatedData = c.get("validatedData");
      const walletAddress = sanitizeWalletAddress(validatedData.walletAddress);

      const nonce = generateNonce();
      const message = createSignMessage(walletAddress, nonce);

      // Store nonce in database
      await this.supabaseService.upsertUser({
        wallet_address: walletAddress.toLowerCase(),
        nonce,
      });

      return ApiResponseBuilder.success(
        c,
        {
          nonce,
          message,
        },
        "Nonce generated successfully"
      );
    } catch (error: any) {
      console.error("Nonce generation error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to generate nonce",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async verifySignature(c: Context) {
    try {
      const validatedData = c.get("validatedData");
      const { walletAddress, signature, message } = validatedData;

      // Get user and verify nonce
      const user = await this.supabaseService.getUserByWallet(walletAddress);

      if (!user) {
        return ApiResponseBuilder.notFound(c, "User");
      }

      // Verify signature
      const isValid = verifySignature(message, signature, walletAddress);

      if (!isValid) {
        return ApiResponseBuilder.unauthorized(c, "Invalid signature");
      }

      // Check nonce in message
      if (!message.includes(user.nonce)) {
        return ApiResponseBuilder.unauthorized(c, "Invalid or expired nonce");
      }

      // Generate tokens
      const accessToken = generateToken({
        userId: user.id,
        walletAddress: user.wallet_address,
      });

      const refreshToken = generateRefreshToken({
        userId: user.id,
        walletAddress: user.wallet_address,
      });

      // Update user login info
      await this.supabaseService.updateUser(user.id, {
        last_login: new Date().toISOString(),
        nonce: undefined, // Clear nonce after successful auth
      });

      // Set cookies
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax" as const,
        path: "/",
      };

      setCookie(c, "access_token", accessToken, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24, // 1 day
      });

      setCookie(c, "refresh_token", refreshToken, {
        ...cookieOptions,
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });

      return ApiResponseBuilder.success(
        c,
        {
          accessToken,
          refreshToken,
          user: {
            id: user.id,
            wallet_address: user.wallet_address,
            fullname: user.fullname,
            email: user.email,
            created_at: user.created_at,
            last_login: user.last_login,
          },
        },
        "Authentication successful"
      );
    } catch (error: any) {
      console.error("Verification error:", error);
      return ApiResponseBuilder.error(
        c,
        "Authentication failed",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async logout(c: Context) {
    try {
      const validatedData = c.get("validatedData") || {};
      const { walletAddress } = validatedData;

      // Clear nonce in database if wallet address provided
      if (walletAddress) {
        const user = await this.supabaseService.getUserByWallet(walletAddress);
        if (user) {
          await this.supabaseService.updateUser(user.id, { nonce: undefined });
        }
      }

      // Delete cookies
      deleteCookie(c, "access_token", { path: "/" });
      deleteCookie(c, "refresh_token", { path: "/" });

      return ApiResponseBuilder.success(c, null, "Logged out successfully");
    } catch (error: any) {
      console.error("Logout error:", error);
      return ApiResponseBuilder.error(
        c,
        "Logout failed",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async checkSession(c: Context) {
    try {
      const accessToken = getCookie(c, "access_token");

      if (!accessToken) {
        return ApiResponseBuilder.success(
          c,
          {
            authenticated: false,
            user: null,
          },
          "No active session"
        );
      }

      try {
        const payload = verifyToken(accessToken);
        const user = await this.supabaseService.getUserById(payload.userId);

        if (!user) {
          // Token valid but user not found
          deleteCookie(c, "access_token", { path: "/" });
          deleteCookie(c, "refresh_token", { path: "/" });

          return ApiResponseBuilder.success(
            c,
            {
              authenticated: false,
              user: null,
            },
            "Session invalid"
          );
        }

        return ApiResponseBuilder.success(c, {
          authenticated: true,
          user: {
            id: user.id,
            wallet_address: user.wallet_address,
            fullname: user.fullname,
            email: user.email,
          },
        });
      } catch (tokenError) {
        // Token expired or invalid
        return ApiResponseBuilder.success(
          c,
          {
            authenticated: false,
            user: null,
          },
          "Session expired"
        );
      }
    } catch (error: any) {
      console.error("Session check error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to check session",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }

  async refreshToken(c: Context) {
    try {
      const refreshToken =
        getCookie(c, "refresh_token") || c.req.header("X-Refresh-Token");

      if (!refreshToken) {
        return ApiResponseBuilder.unauthorized(c, "No refresh token provided");
      }

      try {
        const payload = verifyToken(refreshToken);

        // Verify user still exists
        const user = await this.supabaseService.getUserById(payload.userId);
        if (!user) {
          return ApiResponseBuilder.unauthorized(c, "Invalid refresh token");
        }

        // Generate new access token
        const newAccessToken = generateToken({
          userId: payload.userId,
          walletAddress: payload.walletAddress,
        });

        // Set new access token cookie
        setCookie(c, "access_token", newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "Lax",
          maxAge: 60 * 60 * 24, // 1 day
          path: "/",
        });

        return ApiResponseBuilder.success(
          c,
          {
            accessToken: newAccessToken,
          },
          "Token refreshed successfully"
        );
      } catch (tokenError) {
        return ApiResponseBuilder.unauthorized(
          c,
          "Invalid or expired refresh token"
        );
      }
    } catch (error: any) {
      console.error("Token refresh error:", error);
      return ApiResponseBuilder.error(
        c,
        "Failed to refresh token",
        process.env.NODE_ENV !== "production" ? error.message : undefined
      );
    }
  }
}
