import { z } from "zod";

export const Candle = z.object({
  market_id: z.number(),
  interval: z.string(),
  open_time: z.date(),
  close_time: z.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  base_volume: z.number(),
  quote_volume: z.number(),
  trades_count: z.number().optional(),
  is_closed: z.boolean(),
});
export type Candle = z.infer<typeof Candle>;
