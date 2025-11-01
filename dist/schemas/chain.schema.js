import { z } from "zod";
export const createChainSchema = z.object({
    key: z.string().min(1, "Chain key is required"),
    name: z.string().min(1, "Chain name is required"),
    kind: z.enum(["ethereum", "solana"]),
    rpc_url: z.string().url().optional(),
    explorer_tx_url: z.string().url().optional(),
});
export const updateChainSchema = z.object({
    name: z.string().min(1).optional(),
    rpc_url: z.string().url().optional(),
    explorer_tx_url: z.string().url().optional(),
});
