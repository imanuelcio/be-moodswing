import { z } from "zod";
export const createDisputeSchema = z.object({
    reason: z.string().min(10).max(1000),
    snapshotRef: z.string().optional(),
});
export const voteOnDisputeSchema = z.object({
    vote: z.enum(["uphold", "overturn", "abstain"]),
});
export const resolveDisputeSchema = z.object({
    outcome: z.enum(["upheld", "overturned", "dismissed"]),
    source: z.enum(["auto", "admin"]).default("admin"),
});
