// repo/authUsers.ts
import { supabase } from "../config/supabase.js";

/**
 * Ambil chain_id dari chains.key
 */
export async function getChainIdByKey(chainKey: string): Promise<number> {
  const { data, error } = await supabase
    .from("chains")
    .select("id")
    .eq("key", chainKey)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Chain with key "${chainKey}" not found`);
  return data.id as number;
}

/* =========================
 * USERS
 * =======================*/

/**
 * Upsert user berdasarkan email ATAU handle.
 * - Jika `email` ada → onConflict: 'email'
 * - Kalau tidak, tapi `handle` ada → onConflict: 'handle'
 * - Return baris user (id, handle, email, created_at)
 */
export async function upsertUser(input: { email?: string; handle?: string }) {
  const { email, handle } = input;

  if (!email && !handle) {
    throw new Error("upsertUser needs at least email or handle");
  }

  // payload minimal untuk insert
  const payload: Record<string, any> = {};
  if (email) payload.email = email.toLowerCase();
  if (handle) payload.handle = handle;

  const onConflict = email ? "email" : "handle";

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict, ignoreDuplicates: false })
    .select("id, handle, email, created_at")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // fallback cari lagi (harusnya tidak kejadian, tapi jaga-jaga)
    const q = email
      ? supabase
          .from("users")
          .select("id, handle, email, created_at")
          .eq("email", email.toLowerCase())
          .maybeSingle()
      : supabase
          .from("users")
          .select("id, handle, email, created_at")
          .eq("handle", handle!)
          .maybeSingle();

    const { data: refetch, error: refetchErr } = await q;
    if (refetchErr) throw refetchErr;
    return refetch!;
  }

  return data;
}

/**
 * Ambil user by email (helper)
 */
export async function getUserByEmail(email: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, handle, email, created_at")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * Ambil user by handle (helper)
 */
export async function getUserByHandle(handle: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id, handle, email, created_at")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/* =========================
 * USER_WALLETS
 * =======================*/

/**
 * Upsert wallet user berdasarkan (user_id, chainKey, address)
 * - Menggunakan onConflict: 'chain_id,address'
 * - Opsi setPrimary: true → akan dibuat primary untuk chain tsb
 * - Return baris wallet
 */
export async function upsertUserWallet(params: {
  userId: number;
  chainKey: string;
  address: string;
  isPrimary?: boolean;
}) {
  const { userId, chainKey, address, isPrimary } = params;

  const chain_id = await getChainIdByKey(chainKey);
  const addr = address.toLowerCase();

  const { data, error } = await supabase
    .from("user_wallets")
    .upsert(
      {
        user_id: userId,
        chain_id,
        address: addr,
        // hanya set is_primary pada upsert jika dikirim
        ...(typeof isPrimary === "boolean" ? { is_primary: isPrimary } : {}),
      },
      { onConflict: "chain_id,address" }
    )
    .select("id, user_id, chain_id, address, is_primary, created_at")
    .maybeSingle();

  if (error) throw error;

  // Optional: jika diminta primary, pastikan satu-satunya primary pada chain ini
  if (isPrimary) {
    await ensurePrimaryWallet({ userId, chainKey, address });
  }

  return data!;
}

/**
 * Pastikan satu primary wallet per (user_id, chain_id).
 * Strategi dua langkah:
 * 1) Set semua wallet user pada chain tersebut → is_primary = false
 * 2) Set wallet (chain_id, address) tertentu → is_primary = true
 *
 * Catatan:
 * - Idealnya gunakan partial unique index:
 *   CREATE UNIQUE INDEX uniq_user_wallet_primary_per_chain
 *   ON user_wallets(user_id, chain_id) WHERE is_primary = TRUE;
 */
export async function ensurePrimaryWallet(params: {
  userId: number;
  chainKey: string;
  address: string;
}) {
  const { userId, chainKey, address } = params;
  const chain_id = await getChainIdByKey(chainKey);
  const addr = address.toLowerCase();

  // 1) Matikan semua primary pada chain ini untuk user tsb
  {
    const { error } = await supabase
      .from("user_wallets")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("chain_id", chain_id);
    if (error) throw error;
  }

  // 2) Set wallet target jadi primary
  {
    const { error } = await supabase
      .from("user_wallets")
      .update({ is_primary: true })
      .eq("user_id", userId)
      .eq("chain_id", chain_id)
      .eq("address", addr);
    if (error) throw error;
  }
}

/**
 * Ambil wallet spesifik user (chainKey, address)
 */
export async function getUserWallet(params: {
  userId: number;
  chainKey: string;
  address: string;
}) {
  const { userId, chainKey, address } = params;
  const chain_id = await getChainIdByKey(chainKey);
  const addr = address.toLowerCase();

  const { data, error } = await supabase
    .from("user_wallets")
    .select("id, user_id, chain_id, address, is_primary, created_at")
    .eq("user_id", userId)
    .eq("chain_id", chain_id)
    .eq("address", addr)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/**
 * Hapus wallet user (misal saat unlink)
 */
export async function deleteUserWallet(params: {
  userId: number;
  chainKey: string;
  address: string;
}) {
  const { userId, chainKey, address } = params;
  const chain_id = await getChainIdByKey(chainKey);
  const addr = address.toLowerCase();

  const { error } = await supabase
    .from("user_wallets")
    .delete()
    .eq("user_id", userId)
    .eq("chain_id", chain_id)
    .eq("address", addr);

  if (error) throw error;
}
