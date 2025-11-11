import { z } from "zod";

export const createMarketSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  source: z.string().max(200).optional(),
  settlement_type: z.enum(["manual", "oracle", "community"]).default("manual"),
  open_at: z.string().datetime().optional(),
  close_at: z.string().datetime().optional(),
  resolve_by: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  outcomes: z
    .array(
      z.object({
        key: z.string().min(1).max(50),
        name: z.string().min(1).max(100),
        initial_price: z.number().min(0).max(1).optional(),
      })
    )
    .min(2)
    .max(10),
});

export const updateMarketSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(50).optional(),
  source: z.string().max(200).optional(),
  settlement_type: z.enum(["manual", "oracle", "community"]).optional(),
  status: z
    .enum(["draft", "open", "closed", "resolved", "disputed", "cancelled"])
    .optional(),
  open_at: z.string().datetime().optional(),
  close_at: z.string().datetime().optional(),
  resolve_by: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const listMarketsSchema = z.object({
  status: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
  category: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
  creator_user_id: z.string().uuid().optional(),
  search: z.string().optional(),
  open_after: z.string().datetime().optional(),
  close_before: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  order_by: z.string().default("created_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});

export const DataSource = z.enum(["BINANCE_SPOT", "BINANCE_FUTURES"]);

export const Market = z.object({
  id: z.number(),
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  close_at: z.string().nullable().optional(),
  open_at: z.string().nullable().optional(),
  binance_symbol: z.string(), // e.g. BTCUSDT
  data_source: DataSource, // BINANCE_SPOT | BINANCE_FUTURES
  stream_intervals: z.array(z.string()), // ['1m','5m','1h','1d']
});
export type Market = z.infer<typeof Market>;

// Binance kline WS payload (disederhanakan)
export const BinanceKlineEvent = z.object({
  stream: z.string(),
  data: z.object({
    e: z.string(), // event type
    E: z.number(), // event time
    s: z.string(), // symbol
    k: z.object({
      t: z.number(), // start time
      T: z.number(), // close time
      i: z.string(), // interval
      f: z.number(), // first trade id
      L: z.number(), // last trade id
      o: z.string(), // open
      c: z.string(), // close
      h: z.string(), // high
      l: z.string(), // low
      v: z.string(), // base volume
      n: z.number(), // trades
      x: z.boolean(), // is kline closed?
      q: z.string(), // quote volume
    }),
  }),
});
export type BinanceKlineEvent = z.infer<typeof BinanceKlineEvent>;
