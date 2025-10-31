import { z } from "zod";
export const closePositionSchema = z.object({
    quantity: z.number().min(0.01).optional(),
    price: z.number().min(0.01).max(0.99).optional(),
});
