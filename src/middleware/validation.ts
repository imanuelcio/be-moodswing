import type { Context, Next } from "hono";
import { z } from "zod";
import { ApiResponseBuilder } from "../utils/apiResponse.js";

export function validateRequest(
  target: "json" | "query" | "param",
  schema: z.ZodSchema
) {
  return async (c: Context, next: Next) => {
    try {
      let data;

      switch (target) {
        case "json":
          data = await c.req.json();
          break;
        case "query":
          data = c.req.query();
          break;
        case "param":
          data = c.req.param();
          break;
        default:
          data = {};
      }

      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return ApiResponseBuilder.validationError(c, errors);
      }

      // Store validated data for use in route handlers
      c.set("validatedData", result.data);

      await next();
    } catch (error) {
      return ApiResponseBuilder.error(c, "Invalid request data", 400);
    }
  };
}

export function validateParams(...schemas: z.ZodSchema[]) {
  return async (c: Context, next: Next) => {
    const errors: Array<{ field: string; message: string }> = [];

    for (const schema of schemas) {
      const result = schema.safeParse(c.req.param());

      if (!result.success) {
        result.error.issues.forEach((err) => {
          errors.push({
            field: err.path.join("."),
            message: err.message,
          });
        });
      }
    }

    if (errors.length > 0) {
      return ApiResponseBuilder.validationError(c, errors);
    }

    await next();
  };
}
