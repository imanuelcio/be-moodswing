import { z } from "zod";
export const transferPointsSchema = z.object({
    toUserId: z.string().uuid(),
    amount: z.number().min(1).max(100000),
    reason: z.string().default("transfer"),
});
export const awardPointsSchema = z.object({
    userId: z.string().uuid(),
    amount: z.number().min(1).max(100000),
    reason: z.string().min(1),
    metadata: z.record(z.string(), z.any()).optional(),
});
export const bulkAwardSchema = z.object({
    awards: z
        .array(z.object({
        userId: z.string().uuid(),
        amount: z.number().min(1),
        reason: z.string().min(1),
        metadata: z.record(z.string(), z.any()).optional(),
    }))
        .min(1)
        .max(1000),
});
