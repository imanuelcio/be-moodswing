import { z } from "zod";
export const nonceSchema = z.object({
    address: z.string().min(10, "Invalid wallet address"),
    chainKind: z.enum(["ethereum", "solana"]),
    // optional: biarkan client kirim domain, tapi tetap validasi/normalisasi di server
    domain: z.string().optional(),
});
export const verifySchema = z.object({
    address: z.string().min(10),
    chainKind: z.enum(["ethereum", "solana"]),
    nonce: z.string().min(8),
    signature: z.string().min(10),
    domain: z.string().optional(),
});
export const createApiKeySchema = z.object({
    plan: z.string().min(1, "Plan is required"),
    rateLimitPerHour: z.number().min(1).max(100000).optional(),
});
