import { z } from "zod";
export const createWalletSchema = z.object({
    chain_id: z.string().uuid("Invalid chain ID"),
    address: z.string().min(10, "Invalid wallet address"),
    is_primary: z.boolean().default(false),
});
export const updateWalletSchema = z.object({
    is_primary: z.boolean().optional(),
});
