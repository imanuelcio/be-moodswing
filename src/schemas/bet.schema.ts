import { z } from "zod";
export const placeBetSchema = z.object({
  marketId: z.string().uuid(),
  outcomeKey: z.string().min(1),
  side: z.enum(["yes", "no", "buy", "sell"]),
  stakePoints: z.number().min(1).optional(),
  stakeTokenAmount: z.number().min(0.01).optional(),
  tokenSymbol: z.string().optional(),
  price: z.number().min(0.01).max(0.99).optional(),
});

export const listBetsSchema = z.object({
  user_id: z.string().uuid().optional(),
  market_id: z.string().uuid().optional(),
  outcome_id: z.string().uuid().optional(),
  status: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
  side: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",") : undefined)),
  created_after: z.string().datetime().optional(),
  created_before: z.string().datetime().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  order_by: z.string().default("created_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
