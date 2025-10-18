import { executeQuery, supabase } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface Chain {
  id: string;
  key: string;
  name: string;
  kind: "ethereum" | "solana";
  rpc_url?: string;
  explorer_tx_url?: string;
  created_at: string;
}

export interface CreateChainData {
  key: string;
  name: string;
  kind: "ethereum" | "solana";
  rpc_url?: string;
  explorer_tx_url?: string;
}

export interface UpdateChainData {
  name?: string;
  rpc_url?: string;
  explorer_tx_url?: string;
}

export class ChainRepository {
  async findById(id: string): Promise<Chain | null> {
    const { data, error } = await supabase
      .from("chains")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find chain: ${error.message}`);
    }

    return data;
  }

  async findByKey(key: string): Promise<Chain | null> {
    const { data, error } = await supabase
      .from("chains")
      .select("*")
      .eq("key", key)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find chain by key: ${error.message}`);
    }

    return data;
  }

  async create(chainData: CreateChainData): Promise<Chain> {
    return executeQuery<Chain>(
      supabase
        .from("chains")
        .insert({
          ...chainData,
          created_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create chain"
    );
  }

  async update(id: string, chainData: UpdateChainData): Promise<Chain> {
    const chain = await this.findById(id);
    if (!chain) {
      throw new NotFoundError("Chain", id);
    }

    return executeQuery<Chain>(
      supabase
        .from("chains")
        .update(chainData)
        .eq("id", id)
        .select("*")
        .single(),
      "update chain"
    );
  }

  async delete(id: string): Promise<void> {
    const chain = await this.findById(id);
    if (!chain) {
      throw new NotFoundError("Chain", id);
    }

    await executeQuery(
      supabase.from("chains").delete().eq("id", id),
      "delete chain"
    );
  }

  async list(): Promise<Chain[]> {
    return executeQuery<Chain[]>(
      supabase
        .from("chains")
        .select("*")
        .order("created_at", { ascending: true }),
      "list chains"
    );
  }

  async findByKind(kind: "ethereum" | "solana"): Promise<Chain[]> {
    return executeQuery<Chain[]>(
      supabase
        .from("chains")
        .select("*")
        .eq("kind", kind)
        .order("created_at", { ascending: true }),
      "find chains by kind"
    );
  }
}
