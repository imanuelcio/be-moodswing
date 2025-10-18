import { z } from "zod";
export const resolveMarketSchema = z.object({
  outcomeKey: z.string().min(1),
  source: z.enum(["manual", "oracle", "community"]).default("manual"),
  oracleTransactionHash: z.string().optional(),
  resultIpfsCid: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const updateResolutionSchema = z.object({
  oracleTransactionHash: z.string().optional(),
  resultIpfsCid: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const listResolutionsSchema = z.object({
  source: z.enum(["manual", "oracle", "community"]).optional(),
  marketId: z.string().uuid().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  order_by: z.string().default("resolved_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
});
