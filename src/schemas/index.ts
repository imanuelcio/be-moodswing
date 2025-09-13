// /schemas/index.ts
import { z } from "zod";

// Market schemas
export const CreateMarketSchema = z.object({
  title: z.string().min(1).max(200),
  topic: z.string().optional(),
  k: z.number().min(1),
  seedYes: z.number().min(0).default(1),
  seedNo: z.number().min(0).default(1),
  closeAt: z.string().datetime().optional(),
});

export const BetSchema = z.object({
  side: z.enum(["YES", "NO"]),
  points: z.number().min(1),
});

export const ResolveMarketSchema = z.object({
  outcome: z.enum(["YES", "NO"]),
});

// Points schemas
export const ClaimMonthlySchema = z.object({});

// Posts schemas
export const CreatePostSchema = z
  .object({
    content: z.string().optional(),
    externalUrl: z.string().url().optional(),
    marketId: z.string().uuid().optional(),
  })
  .refine((data) => data.content || data.externalUrl, {
    message: "Either content or externalUrl must be provided",
  });

// Tips schemas
export const TipSchema = z.object({
  toUser: z.string().uuid(),
  postId: z.string().uuid().optional(),
  points: z.number().min(1),
});

// Leaderboard schemas
export const LeaderboardQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
});

// Airdrop schemas
export const AirdropSnapshotSchema = z.object({
  period: z.string().min(1),
});

// Query schemas
export const MarketQuerySchema = z.object({
  status: z.enum(["OPEN", "CLOSED", "RESOLVED"]).optional(),
});

export const SSEQuerySchema = z.object({
  ids: z.string().transform((val) => val.split(",").filter(Boolean)),
});

export type CreateMarketInput = z.infer<typeof CreateMarketSchema>;
export type BetInput = z.infer<typeof BetSchema>;
export type ResolveMarketInput = z.infer<typeof ResolveMarketSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type TipInput = z.infer<typeof TipSchema>;
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;
export type AirdropSnapshotInput = z.infer<typeof AirdropSnapshotSchema>;
export type MarketQuery = z.infer<typeof MarketQuerySchema>;
export type SSEQuery = z.infer<typeof SSEQuerySchema>;
