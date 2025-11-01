import { UserRepository } from "../repo/user.repo.js";
import { ChainRepository } from "../repo/chain.repo.js";
import { WalletRepository } from "../repo/wallet.repo.js";
import { createJwtToken, verifyEvmSignature, verifySolanaSignature, generateApiKey, hashApiKey, } from "../core/auth.js";
import { ValidationError, UnauthorizedError, NotFoundError, } from "../core/errors.js";
import { supabase } from "../config/supabase.js";
import { redis } from "../config/redis.js";
import { buildSigninMessage } from "../utils/buildSigninMessage.js";
import { ensurePrimaryWallet, getChainIdByKey, upsertUser, upsertUserWallet, } from "../repo/auth.repo.js";
const NONCE_TTL_SEC = 5 * 60; // 5 minutes
function resolveChainKey(chainKind) {
    if (chainKind === "solana")
        return "solana";
    // default EVM chain key (bisa di-override via ENV)
    return "ethereum";
}
// ===============================
// Helper utama: upsert user + wallet
// - Cari wallet by (chain_id,address). Kalau ada → pakai user_id-nya.
// - Kalau belum ada → buat user minimal (handle random), lalu upsert wallet.
// - Pastikan ada tepat satu primary wallet per (user, chain).
// ===============================
async function upsertUserAndWallet(address, chainKind) {
    const chainKey = resolveChainKey(chainKind);
    const chain_id = await getChainIdByKey(chainKey);
    const addr = address.toLowerCase();
    // 1) Cek apakah wallet sudah ada → dapatkan user_id
    const { data: existingWallet, error: walletErr } = await supabase
        .from("user_wallets")
        .select("id, user_id, is_primary")
        .eq("chain_id", chain_id)
        .eq("address", addr)
        .maybeSingle();
    if (walletErr)
        throw walletErr;
    let userId;
    if (existingWallet?.user_id) {
        // sudah ada wallet → pakai user id yg sama
        userId = existingWallet.user_id;
    }
    else {
        // 2) Belum ada wallet → buat user minimal (handle random)
        const handle = `user${Math.floor(Math.random() * 10_000)}`;
        const user = await upsertUser({ handle });
        if (!user?.id)
            throw new Error("Failed to create/find user");
        userId = user.id;
        // 3) Upsert wallet baru
        await upsertUserWallet({
            userId,
            chainKey,
            address: addr,
            // set primary jika user belum punya primary utk chain ini
            isPrimary: true,
        });
    }
    // 4) Pastikan tepat satu primary untuk chain ini
    //    - Jika wallet baru dibuat → sudah set primary: true
    //    - Jika wallet sudah ada:
    if (existingWallet) {
        // kalau belum primary, jadikan primary (opsional—ubah sesuai kebijakan kamu)
        if (!existingWallet.is_primary) {
            await ensurePrimaryWallet({ userId, chainKey, address: addr });
        }
    }
    // 5) Ambil ulang wallet final (id + is_primary)
    const { data: finalWallet, error: refetchErr } = await supabase
        .from("user_wallets")
        .select("id, user_id, chain_id, address, is_primary")
        .eq("user_id", userId)
        .eq("chain_id", chain_id)
        .eq("address", addr)
        .maybeSingle();
    if (refetchErr)
        throw refetchErr;
    if (!finalWallet)
        throw new Error("Wallet upsert failed");
    return {
        userId,
        walletId: finalWallet.id,
        handle: undefined, // kalau butuh handle, fetch user lagi di sini
    };
}
export class AuthService {
    userRepo;
    chainRepo;
    walletRepo;
    constructor(userRepo = new UserRepository(), chainRepo = new ChainRepository(), walletRepo = new WalletRepository()) {
        this.userRepo = userRepo;
        this.chainRepo = chainRepo;
        this.walletRepo = walletRepo;
    }
    async generateNonceForWallet(address, chainKind, domain) {
        if (!address)
            throw new ValidationError("Address is required");
        if (!["ethereum", "solana"].includes(chainKind))
            throw new ValidationError("Invalid chain kind");
        const nonce = crypto.randomUUID().replace(/-/g, "");
        const issuedAt = Date.now();
        const expiresAt = issuedAt + NONCE_TTL_SEC * 1000;
        const statement = "Sign in to continue";
        // Simpan di Redis (key TTL otomatis)
        await redis.set(`auth:nonce:${nonce}`, JSON.stringify({
            address: address.toLowerCase(),
            chainKind,
            domain,
            statement,
            issuedAt,
            expiresAt,
        }), "EX", NONCE_TTL_SEC);
        // Pesan SIWE-like
        const message = buildSigninMessage({
            domain,
            address,
            nonce,
            chain: chainKind,
            statement,
            issuedAt: new Date(issuedAt).toISOString(),
            expirationTime: new Date(expiresAt).toISOString(),
        });
        // console.log("Generated signin message:", message);
        return { nonce, message, expiresInSec: NONCE_TTL_SEC };
    }
    async verifyWalletSignature(params) {
        const { address, chainKind, domain, nonce, signature } = params;
        // --- 1. Ambil record nonce dari Redis ---
        const raw = await redis.get(`auth:nonce:${nonce}`);
        if (!raw)
            throw new UnauthorizedError("Nonce not found or expired");
        const record = JSON.parse(raw);
        // --- 2. Validasi binding ---
        if (record.address !== address.toLowerCase())
            throw new UnauthorizedError("Address mismatch");
        if (record.chainKind !== chainKind)
            throw new UnauthorizedError("Chain mismatch");
        if (record.domain !== domain)
            throw new UnauthorizedError("Domain mismatch");
        if (Date.now() > record.expiresAt) {
            await redis.del(`auth:nonce:${nonce}`);
            throw new UnauthorizedError("Nonce expired");
        }
        // --- 3. Rekonstruksi pesan ---
        const message = buildSigninMessage({
            domain,
            address,
            nonce,
            chain: chainKind,
            issuedAt: new Date(record.issuedAt).toISOString(),
            expirationTime: new Date(record.expiresAt).toISOString(),
            statement: record.statement,
        });
        // console.log("Reconstructed message:", message);
        // --- 4. Verifikasi signature ---
        let isValid = false;
        if (chainKind === "ethereum") {
            isValid = await verifyEvmSignature(address, message, signature);
        }
        else if (chainKind === "solana") {
            isValid = await verifySolanaSignature(address, message, signature);
        }
        if (!isValid)
            throw new UnauthorizedError("Invalid signature");
        // --- 5. Hapus nonce (anti replay) ---
        await redis.del(`auth:nonce:${nonce}`);
        // --- 6. Upsert user + wallet (pakai helper) ---
        const { userId, walletId } = await upsertUserAndWallet(address, chainKind);
        // (opsional) kalau butuh handle untuk response, ambil dari users:
        const { data: userRow } = await supabase
            .from("users")
            .select("id, handle")
            .eq("id", userId)
            .maybeSingle();
        // --- 7. Buat JWT ---
        const token = createJwtToken({
            userId: String(userId),
            walletId: String(walletId),
            address: address.toLowerCase(),
            chainKind,
        });
        return {
            token,
            user: { id: String(userId), handle: userRow?.handle },
            wallet: {
                id: String(walletId),
                address: address.toLowerCase(),
                chainKind,
            },
        };
    }
    async createApiKey(params) {
        const { ownerUserId, plan, rateLimitPerHour = 1000 } = params;
        // Check if user exists
        const user = await this.userRepo.findById(ownerUserId);
        if (!user) {
            throw new NotFoundError("User", ownerUserId);
        }
        // Generate API key
        const apiKey = generateApiKey();
        const keyHash = hashApiKey(apiKey);
        // Store in database
        const { data, error } = await supabase
            .from("api_keys")
            .insert({
            owner_user_id: ownerUserId,
            key_hash: keyHash,
            plan,
            rate_limit_per_hour: rateLimitPerHour,
            is_active: true,
            created_at: new Date().toISOString(),
        })
            .select("id")
            .single();
        if (error) {
            throw new Error(`Failed to create API key: ${error.message}`);
        }
        return {
            id: data.id,
            key: apiKey, // Only return the plain key once
            plan,
            rateLimitPerHour,
        };
    }
    async revokeApiKey(keyId, ownerUserId) {
        const { error } = await supabase
            .from("api_keys")
            .update({ is_active: false })
            .eq("id", keyId)
            .eq("owner_user_id", ownerUserId);
        if (error) {
            throw new Error(`Failed to revoke API key: ${error.message}`);
        }
    }
    async listApiKeys(ownerUserId) {
        const { data, error } = await supabase
            .from("api_keys")
            .select("id, plan, rate_limit_per_hour, is_active, created_at")
            .eq("owner_user_id", ownerUserId)
            .order("created_at", { ascending: false });
        if (error) {
            throw new Error(`Failed to list API keys: ${error.message}`);
        }
        return (data || []).map((key) => ({
            id: key.id,
            plan: key.plan,
            rateLimitPerHour: key.rate_limit_per_hour,
            isActive: key.is_active,
            createdAt: key.created_at,
        }));
    }
}
