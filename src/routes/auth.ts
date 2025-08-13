import { Hono } from "hono";
import { supabaseAdmin } from "../config/supabase.js";
import {
  generateNonce,
  createSignMessage,
  verifySignature,
} from "../utils/crypto.js";
import { generateToken } from "../utils/jwt.js";
import type {
  AuthRequest,
  NonceResponse,
  AuthResponse,
} from "../types/index.js";
import { setCookie } from "hono/cookie";

const router = new Hono();

router.post("/nonce", async (c) => {
  try {
    const { walletAddress } = await c.req.json();

    if (!walletAddress) {
      return c.json({ error: "Wallet address is required" }, 400);
    }

    const nonce = generateNonce();
    const message = createSignMessage(walletAddress, nonce);

    // Store or update nonce in database
    const { error } = await supabaseAdmin.from("users").upsert(
      {
        wallet_address: walletAddress.toLowerCase(),
        nonce,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "wallet_address",
      }
    );

    if (error) {
      throw error;
    }

    const response: NonceResponse = { nonce, message };
    return c.json(response);
  } catch (error) {
    console.error("Nonce generation error:", error);
    return c.json({ error: "Failed to generate nonce" }, 500);
  }
});

router.post("/verify", async (c) => {
  try {
    const { walletAddress, signature, message }: AuthRequest =
      await c.req.json();

    if (!walletAddress || !signature || !message) {
      return c.json({ error: "Missing required fields" }, 400);
    }

    // Get user and nonce from database
    const { data: user, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("wallet_address", walletAddress.toLowerCase())
      .single();

    if (fetchError || !user) {
      return c.json({ error: "User not found" }, 404);
    }

    const isValid = verifySignature(message, signature, walletAddress);

    if (!isValid) {
      return c.json({ error: "Invalid signature" }, 401);
    }

    if (!message.includes(user.nonce)) {
      return c.json({ error: "Invalid nonce" }, 401);
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        last_login: new Date().toISOString(),
        nonce: null,
      })
      .eq("wallet_address", walletAddress.toLowerCase())
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    const token = generateToken({
      userId: updatedUser.id,
      walletAddress: updatedUser.wallet_address,
    });

    setCookie(c, "AuthToken", token, { path: "/" });

    const response: AuthResponse = {
      status: true,
      message: "Authentication successful",
      user: updatedUser,
    };

    return c.json(response);
  } catch (error) {
    console.error("Verification error:", error);
    return c.json({ error: "Authentication failed" }, 500);
  }
});

router.post("/logout", async (c) => {
  try {
    const { walletAddress } = await c.req.json();

    if (!walletAddress) {
      return c.json({ error: "Wallet address is required" }, 400);
    }

    const { error } = await supabaseAdmin
      .from("users")
      .update({ nonce: null })
      .eq("wallet_address", walletAddress.toLowerCase());

    if (error) {
      throw error;
    }

    return c.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return c.json({ error: "Logout failed" }, 500);
  }
});

export default router;
