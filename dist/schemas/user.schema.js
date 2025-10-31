import { z } from "zod";
export const updateUserSchema = z.object({
    handle: z.string().min(3).max(50).optional(),
    email: z.string().email().optional(),
});
export const searchUsersSchema = z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});
