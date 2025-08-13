import type { Context } from "hono";

export function errorHandler(error: Error, c: Context) {
  console.error("Error:", error);

  if (error.message === "Unauthorized") {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (error.message === "Not Found") {
    return c.json({ error: "Not Found" }, 404);
  }

  return c.json(
    { error: "Internal Server Error", message: error.message },
    500
  );
}
