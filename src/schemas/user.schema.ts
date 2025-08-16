import { z } from "zod";

export const updateProfileSchema = z
  .object({
    fullname: z
      .string()
      .min(2, "Fullname must be at least 2 characters")
      .max(100, "Fullname must be less than 100 characters")
      .regex(/^[a-zA-Z\s]+$/, "Fullname can only contain letters and spaces")
      .optional(),
    email: z
      .string()
      .email("Invalid email format")
      .max(255, "Email must be less than 255 characters")
      .optional(),
  })
  .refine(
    (data) => {
      // At least one field must be provided
      return data.fullname !== undefined || data.email !== undefined;
    },
    {
      message: "At least one field (fullname or email) must be provided",
    }
  );

export const updateMetadataSchema = z.object({
  metadata: z
    .object({
      avatar: z.string().url("Invalid avatar URL").optional(),
      bio: z
        .string()
        .max(500, "Bio must be less than 500 characters")
        .optional(),
      twitter: z
        .string()
        .regex(/^@?[A-Za-z0-9_]{1,15}$/, "Invalid Twitter handle")
        .optional(),
      discord: z.string().max(100).optional(),
      website: z.string().url("Invalid website URL").optional(),
      github: z
        .string()
        .regex(
          /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i,
          "Invalid GitHub username"
        )
        .optional(),
    })
    .catchall(z.any()), // Allow additional fields
});

export const listUsersSchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, "Page must be a number")
    .transform(Number)
    .pipe(z.number().min(1))
    .optional()
    .default(1),
  limit: z
    .string()
    .regex(/^\d+$/, "Limit must be a number")
    .transform(Number)
    .pipe(z.number().min(1).max(100))
    .optional()
    .default(10),
  search: z.string().max(100).optional(),
  sortBy: z
    .enum(["created_at", "updated_at", "last_login", "fullname", "email"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
});

export const userIdSchema = z.object({
  id: z.string().uuid("Invalid user ID format"),
});
