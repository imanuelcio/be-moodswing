import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import * as ed25519 from "@noble/ed25519";
// import { verifyMessage } from "viem";
import { env } from "../config/env.js";
import { UnauthorizedError } from "./errors.js";
import { supabase } from "../config/supabase.js";
import crypto from "crypto";
import bs58 from "bs58";
// Generate nonce for wallet auth
export function generateNonce(walletAddress) {
    return `Sign this message to authenticate with Mood Swing.\n\nTimestamp: ${Date.now()}\nNonce: ${crypto.randomUUID()} \nWallet Address: ${walletAddress.toLowerCase()}`;
}
// Create JWT token
export function createJwtToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: "24h",
        issuer: "mood-swing",
    });
}
// Verify JWT token
export function verifyJwtToken(token) {
    try {
        const payload = jwt.verify(token, env.JWT_SECRET, {
            issuer: "mood-swing",
        });
        return payload;
    }
    catch (error) {
        throw new UnauthorizedError("Invalid or expired token");
    }
}
import { verifyMessage, getAddress } from "ethers";
export async function verifyEvmSignature(address, message, signature) {
    try {
        // console.log("🔐 === BACKEND VERIFICATION (ethers) ===");
        // console.log("📥 Address:", address);
        // console.log("📝 Message:", message);
        // console.log("✍️  Signature:", signature);
        // Recover address using ethers
        const recoveredAddress = verifyMessage(message, signature);
        // console.log("🔍 Recovered:", recoveredAddress);
        // console.log("🔍 Expected:", address);
        // Normalize to checksum format
        const recoveredChecksum = getAddress(recoveredAddress);
        const expectedChecksum = getAddress(address);
        // console.log("📊 Checksummed:");
        // console.log("   Recovered:", recoveredChecksum);
        // console.log("   Expected:", expectedChecksum);
        const isValid = recoveredChecksum === expectedChecksum;
        // console.log("✅ Valid?", isValid);
        return isValid;
    }
    catch (error) {
        console.error("❌ Verification error:", error);
        return false;
    }
}
// Verify Solana signature (using @noble/ed25519)
export async function verifySolanaSignature(publicKey, message, signature) {
    try {
        const messageBytes = new TextEncoder().encode(message);
        // decode base58
        const pubKeyBytes = bs58.decode(publicKey);
        const sigBytes = bs58.decode(signature);
        // verify
        return await ed25519.verify(sigBytes, messageBytes, pubKeyBytes);
    }
    catch (error) {
        console.error("verifySolanaSignature error:", error);
        return false;
    }
}
// Hash API key for storage
export function hashApiKey(apiKey) {
    return createHash("sha256").update(apiKey).digest("hex");
}
// Generate random API key
export function generateApiKey() {
    const prefix = "msk_";
    const randomPart = crypto.randomBytes(32).toString("hex");
    return prefix + randomPart;
}
// Validate API key against database
export async function validateApiKey(apiKey) {
    const keyHash = hashApiKey(apiKey);
    const { data: apiKeyData, error } = await supabase
        .from("api_keys")
        .select("id, owner_user_id, plan, rate_limit_per_hour, is_active")
        .eq("key_hash", keyHash)
        .eq("is_active", true)
        .single();
    if (error || !apiKeyData) {
        throw new UnauthorizedError("Invalid API key");
    }
    return {
        keyId: apiKeyData.id,
        ownerId: apiKeyData.owner_user_id,
        plan: apiKeyData.plan,
        rateLimit: apiKeyData.rate_limit_per_hour,
    };
}
// Upsert user and wallet on successful auth
export async function upsertUserAndWallet(address, chainKind, chainId) {
    // First, try to find existing wallet
    const { data: existingWallet } = await supabase
        .from("user_wallets")
        .select("id, user_id, users(id, handle)")
        .eq("address", address.toLowerCase())
        .eq("chain_id", chainId)
        .single();
    if (existingWallet) {
        return {
            userId: existingWallet.user_id,
            walletId: existingWallet.id,
            handle: existingWallet.users,
        };
    }
    // Create new user
    const { data: newUser, error: userError } = await supabase
        .from("users")
        .insert({
        handle: `user_${address.slice(-8)}`,
        created_at: new Date().toISOString(),
    })
        .select("id")
        .single();
    if (userError || !newUser) {
        throw new Error("Failed to create user");
    }
    // Create wallet
    const { data: newWallet, error: walletError } = await supabase
        .from("user_wallets")
        .insert({
        user_id: newUser.id,
        chain_id: chainId,
        address: address.toLowerCase(),
        is_primary: true,
        created_at: new Date().toISOString(),
    })
        .select("id")
        .single();
    if (walletError || !newWallet) {
        throw new Error("Failed to create wallet");
    }
    return {
        userId: newUser.id,
        walletId: newWallet.id,
        handle: `user_${address.slice(-8)}`,
    };
}
