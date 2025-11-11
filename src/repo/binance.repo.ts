import { supabase } from "../config/supabase.js";

export class MarketRepository {
  async findById(id: number | string) {
    const { data, error } = await supabase
      .from("markets")
      .select("*")
      .eq("id", Number(id))
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async listActiveBinanceMarkets() {
    const { data, error } = await supabase
      .from("markets")
      .select(
        "id, slug, title, status, binance_symbol, data_source, stream_intervals"
      )
      .in("data_source", ["BINANCE_SPOT", "BINANCE_FUTURES"])
      .in("status", ["OPEN", "ACTIVE"]);
    if (error) throw error;
    return data ?? [];
  }
}
