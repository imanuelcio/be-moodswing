import { executeQuery, supabase } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface UserWallet {
  id: string;
  user_id: string;
  chain_id: string;
  address: string;
  is_primary: boolean;
  created_at: string;
}

export interface UserWalletWithChain extends UserWallet {
  chains: {
    id: string;
    key: string;
    name: string;
    kind: "ethereum" | "solana";
  };
}

export interface CreateWalletData {
  user_id: string;
  chain_id: string;
  address: string;
  is_primary?: boolean;
}

export interface UpdateWalletData {
  is_primary?: boolean;
}

export class WalletRepository {
  async findById(id: string): Promise<UserWallet | null> {
    const { data, error } = await supabase
      .from("user_wallets")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find wallet: ${error.message}`);
    }

    return data;
  }

  async findByAddress(
    address: string,
    chainId?: string
  ): Promise<UserWalletWithChain | null> {
    let query = supabase
      .from("user_wallets")
      .select(
        `
        *, 
        chains (id, key, name, kind)
      `
      )
      .eq("address", address.toLowerCase());

    if (chainId) {
      query = query.eq("chain_id", chainId);
    }

    const { data, error } = await query.single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find wallet by address: ${error.message}`);
    }

    return data;
  }

  async findByUser(userId: string): Promise<UserWalletWithChain[]> {
    return executeQuery<UserWalletWithChain[]>(
      supabase
        .from("user_wallets")
        .select(
          `
          *, 
          chains (id, key, name, kind)
        `
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      "find wallets by user"
    );
  }

  async findPrimaryWallet(userId: string): Promise<UserWalletWithChain | null> {
    const { data, error } = await supabase
      .from("user_wallets")
      .select(
        `
        *, 
        chains (id, key, name, kind)
      `
      )
      .eq("user_id", userId)
      .eq("is_primary", true)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find primary wallet: ${error.message}`);
    }

    return data;
  }

  async create(walletData: CreateWalletData): Promise<UserWallet> {
    // If this is set as primary, unset other primary wallets for this user
    if (walletData.is_primary) {
      await this.unsetPrimaryWallets(walletData.user_id);
    }

    return executeQuery<UserWallet>(
      supabase
        .from("user_wallets")
        .insert({
          ...walletData,
          address: walletData.address.toLowerCase(),
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create wallet"
    );
  }

  async update(id: string, walletData: UpdateWalletData): Promise<UserWallet> {
    const wallet = await this.findById(id);
    if (!wallet) {
      throw new NotFoundError("Wallet", id);
    }

    // If setting as primary, unset other primary wallets for this user
    if (walletData.is_primary) {
      await this.unsetPrimaryWallets(wallet.user_id);
    }

    return executeQuery<UserWallet>(
      supabase
        .from("user_wallets")
        .update(walletData)
        .eq("id", id)
        .select("*")
        .single(),
      "update wallet"
    );
  }

  async delete(id: string): Promise<void> {
    const wallet = await this.findById(id);
    if (!wallet) {
      throw new NotFoundError("Wallet", id);
    }

    await executeQuery(
      supabase.from("user_wallets").delete().eq("id", id),
      "delete wallet"
    );
  }

  private async unsetPrimaryWallets(userId: string): Promise<void> {
    await executeQuery(
      supabase
        .from("user_wallets")
        .update({ is_primary: false })
        .eq("user_id", userId)
        .eq("is_primary", true),
      "unset primary wallets"
    );
  }

  async getWalletStats(userId?: string) {
    let query = supabase.from("user_wallets").select(
      `
        chain_id,
        chains (key, name, kind),
        count: *
      `,
      { count: "exact" }
    );

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get wallet stats: ${error.message}`);
    }

    return {
      totalWallets: count || 0,
      byChain: data || [],
    };
  }
}
