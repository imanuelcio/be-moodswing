import { z } from "zod";

// Solana wallet address validation
const walletAddressSchema = z
  .string()
  .min(32, "Invalid wallet address")
  .max(44, "Invalid wallet address")
  .regex(
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
    "Invalid Solana wallet address format"
  );

export const nonceSchema = z.object({
  walletAddress: walletAddressSchema,
});

export const verifySchema = z.object({
  walletAddress: walletAddressSchema,
  signature: z.string().min(1, "Signature is required"),
  message: z.string().min(1, "Message is required"),
});

export const logoutSchema = z.object({
  walletAddress: walletAddressSchema.optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(), // Can be from cookie or body
});
