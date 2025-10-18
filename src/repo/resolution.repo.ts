import { supabase, executeQuery } from "../config/supabase.js";
import { NotFoundError } from "../core/errors.js";

export interface MarketResolution {
  id: string;
  market_id: string;
  resolved_outcome_id: string;
  source: "manual" | "oracle" | "community";
  oracle_tx_hash?: string;
  result_ipfs_cid?: string;
  resolved_at: string;
  notes?: string;
}

export interface MarketResolutionWithDetails extends MarketResolution {
  markets: {
    id: string;
    title: string;
    slug: string;
    status: string;
  };
  market_outcomes: {
    id: string;
    key: string;
    name: string;
  };
}

export interface CreateResolutionData {
  market_id: string;
  resolved_outcome_id: string;
  source: "manual" | "oracle" | "community";
  oracle_tx_hash?: string;
  result_ipfs_cid?: string;
  notes?: string;
}

export interface UpdateResolutionData {
  oracle_tx_hash?: string;
  result_ipfs_cid?: string;
  notes?: string;
}

export class ResolutionRepository {
  async findById(id: string): Promise<MarketResolution | null> {
    const { data, error } = await supabase
      .from("market_resolutions")
      .select("*")
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find resolution: ${error.message}`);
    }

    return data;
  }

  async findByMarket(marketId: string): Promise<MarketResolution | null> {
    const { data, error } = await supabase
      .from("market_resolutions")
      .select("*")
      .eq("market_id", marketId)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to find resolution by market: ${error.message}`);
    }

    return data;
  }

  async findWithDetails(
    id: string
  ): Promise<MarketResolutionWithDetails | null> {
    const { data, error } = await supabase
      .from("market_resolutions")
      .select(
        `
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `
      )
      .eq("id", id)
      .single();

    if (error && error.code !== "PGRST116") {
      throw new Error(
        `Failed to find resolution with details: ${error.message}`
      );
    }

    return data;
  }

  async create(
    resolutionData: CreateResolutionData
  ): Promise<MarketResolution> {
    return executeQuery<MarketResolution>(
      supabase
        .from("market_resolutions")
        .insert({
          ...resolutionData,
          resolved_at: new Date().toISOString(),
        })
        .select("*")
        .single(),
      "create resolution"
    );
  }

  async update(
    id: string,
    resolutionData: UpdateResolutionData
  ): Promise<MarketResolution> {
    const resolution = await this.findById(id);
    if (!resolution) {
      throw new NotFoundError("Resolution", id);
    }

    return executeQuery<MarketResolution>(
      supabase
        .from("market_resolutions")
        .update(resolutionData)
        .eq("id", id)
        .select("*")
        .single(),
      "update resolution"
    );
  }

  async delete(id: string): Promise<void> {
    const resolution = await this.findById(id);
    if (!resolution) {
      throw new NotFoundError("Resolution", id);
    }

    await executeQuery(
      supabase.from("market_resolutions").delete().eq("id", id),
      "delete resolution"
    );
  }

  async list(
    params: {
      source?: string;
      marketId?: string;
      offset?: number;
      limit?: number;
      orderBy?: string;
      orderDir?: "asc" | "desc";
    } = {}
  ): Promise<{ resolutions: MarketResolutionWithDetails[]; total: number }> {
    const {
      source,
      marketId,
      offset = 0,
      limit = 50,
      orderBy = "resolved_at",
      orderDir = "desc",
    } = params;

    let query = supabase.from("market_resolutions").select(
      `
        *,
        markets (id, title, slug, status),
        market_outcomes (id, key, name)
      `,
      { count: "exact" }
    );

    if (source) {
      query = query.eq("source", source);
    }

    if (marketId) {
      query = query.eq("market_id", marketId);
    }

    query = query
      .order(orderBy, { ascending: orderDir === "asc" })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to list resolutions: ${error.message}`);
    }

    return {
      resolutions: data || [],
      total: count || 0,
    };
  }

  async getResolutionStats(
    params: {
      source?: string;
      period?: string; // '24h', '7d', '30d', 'all'
    } = {}
  ) {
    const { source, period = "all" } = params;

    let startDate: string | undefined;
    if (period !== "all") {
      const now = new Date();
      switch (period) {
        case "24h":
          startDate = new Date(
            now.getTime() - 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "7d":
          startDate = new Date(
            now.getTime() - 7 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
        case "30d":
          startDate = new Date(
            now.getTime() - 30 * 24 * 60 * 60 * 1000
          ).toISOString();
          break;
      }
    }

    let query = supabase
      .from("market_resolutions")
      .select("source, resolved_at");

    if (source) {
      query = query.eq("source", source);
    }

    if (startDate) {
      query = query.gte("resolved_at", startDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to get resolution stats: ${error.message}`);
    }

    const resolutions = data || [];

    // Group by source
    const bySource = resolutions.reduce((acc, resolution) => {
      const source = resolution.source;
      if (!acc[source]) {
        acc[source] = 0;
      }
      acc[source]++;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalResolutions: resolutions.length,
      bySource,
      period,
    };
  }
}
