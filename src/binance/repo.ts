import { supabase } from "../config/supabase.js";

export class CandleRepository {
  async upsertCandle(marketId: number, interval: string, candle: any) {
    const { error } = await supabase.from("market_candles").upsert(
      [
        {
          market_id: marketId,
          interval,
          open_time: candle.open_time,
          close_time: candle.close_time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          base_volume: candle.base_volume,
          quote_volume: candle.quote_volume,
          trades_count: candle.trades_count,
          is_closed: candle.is_closed,
        },
      ],
      { onConflict: "market_id, interval , open_time" }
    );
    if (error) throw error;
  }
}
