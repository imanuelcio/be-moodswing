import { supabase } from "../config/supabase.js";
export async function listCollections() {
    const { data, error } = await supabase
        .from("nft_collections")
        .select("id, chain_id, contract_address, symbol, name, royalties_bps, revenue_share_pct, created_at")
        .order("created_at", { ascending: false });
    if (error)
        throw error;
    return data ?? [];
}
export async function listTokensWithJoins(filters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    // Base query + joins (PostgREST relation select)
    let query = supabase.from("nft_tokens").select(`
      id,
      collection_id,
      token_id,
      owner_user_id,
      minted_at,
      metadata,
      nft_collections:collection_id (
        id, name, symbol, contract_address, royalties_bps, revenue_share_pct
      ),
      users:owner_user_id (
        id, handle
      )
    `, { count: "exact" });
    if (filters.collectionId) {
        query = query.eq("collection_id", filters.collectionId);
    }
    if (filters.ownerUserId) {
        query = query.eq("owner_user_id", filters.ownerUserId);
    }
    // Ordering
    if (filters.order === "minted_at_asc") {
        query = query
            .order("minted_at", { ascending: true, nullsFirst: true })
            .order("id", { ascending: true });
    }
    else {
        // default: newest first, nulls last
        query = query
            .order("minted_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false });
    }
    // Pagination
    query = query.range(from, to);
    const { data, error, count } = await query;
    if (error)
        throw error;
    return {
        items: data ?? [],
        page,
        pageSize,
        total: count ?? 0,
    };
}
export async function getMintedCountByCollectionId(collectionId) {
    const { count, error } = await supabase
        .from("nft_tokens")
        .select("id", { count: "exact", head: true })
        .eq("collection_id", collectionId);
    if (error)
        throw error;
    return count ?? 0;
}
// ========== Collections ==========
export async function getCollectionById(id) {
    const { data, error } = await supabase
        .from("nft_collections")
        .select("id, chain_id, contract_address, symbol, name, royalties_bps, revenue_share_pct, created_at")
        .eq("id", id)
        .maybeSingle();
    if (error)
        throw error;
    return data ?? null;
}
export async function getCollectionByContractAddress(addr) {
    const { data, error } = await supabase
        .from("nft_collections")
        .select("id, chain_id, contract_address, symbol, name, royalties_bps, revenue_share_pct, created_at")
        .eq("contract_address", addr)
        .maybeSingle();
    if (error)
        throw error;
    return data ?? null;
}
export async function insertCollection(params) {
    const { data, error } = await supabase
        .from("nft_collections")
        .insert({
        chain_id: params.chain_id ?? null,
        contract_address: params.contract_address,
        symbol: params.symbol ?? null,
        name: params.name ?? null,
        royalties_bps: params.royalties_bps ?? 0,
        revenue_share_pct: params.revenue_share_pct ?? 0,
    })
        .select("id, chain_id, contract_address, symbol, name, royalties_bps, revenue_share_pct, created_at")
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
// ========== Tokens ==========
export async function upsertToken(params) {
    const { data, error } = await supabase
        .from("nft_tokens")
        .upsert({
        collection_id: params.collection_id,
        token_id: params.token_id,
        owner_user_id: params.owner_user_id,
        minted_at: params.minted_at,
        metadata: params.metadata ?? null,
    }, { onConflict: "collection_id,token_id" })
        .select("id, collection_id, token_id, owner_user_id, minted_at")
        .maybeSingle();
    if (error)
        throw error;
    return data;
}
