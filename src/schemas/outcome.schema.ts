import { z } from "zod";

export const createOutcomeSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  initial_price: z.number().min(0).max(1).default(0.5),
});

export const updateOutcomeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  initial_price: z.number().min(0).max(1).optional(),
});
