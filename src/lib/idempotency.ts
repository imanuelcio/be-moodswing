// /lib/idempotency.ts
import type { Context, Next } from "hono";
import crypto from "crypto";
import { supabaseAdmin } from "../config/supabase.js";

export interface IdempotencyRecord {
  key: string;
  user_id: string;
  route: string;
  body_hash: string;
  response?: any;
  created_at: string;
}

/**
 * Middleware to enforce idempotency for POST requests that change state
 * Requires Idempotency-Key header for POST requests
 */
export async function requireIdempotencyKey() {
  return async (c: Context, next: Next) => {
    const method = c.req.method;
    const path = c.req.path;

    // Only check POST requests that change state
    if (method !== "POST") {
      return next();
    }

    const idempotencyKey = c.req.header("Idempotency-Key");
    if (!idempotencyKey) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Idempotency-Key header required for POST requests",
          },
        },
        400
      );
    }

    const userId = c.get("userId");
    if (!userId) {
      return c.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401
      );
    }

    const body = await c.req.text();
    const bodyHash = crypto.createHash("sha256").update(body).digest("hex");

    // Check if this idempotency key was used before
    const { data: existing, error } = await supabaseAdmin
      .from("idempotency_keys")
      .select("*")
      .eq("key", idempotencyKey)
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      // Not found is OK
      console.error("Idempotency check failed:", error);
      return c.json(
        {
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to check idempotency",
          },
        },
        500
      );
    }

    if (existing) {
      // Check if route and body match
      if (existing.route !== path || existing.body_hash !== bodyHash) {
        return c.json(
          {
            error: {
              code: "CONFLICT",
              message: "Idempotency key used with different request parameters",
            },
          },
          409
        );
      }

      // Return cached response if available
      if (existing.response) {
        const response = JSON.parse(existing.response);
        return c.json(response.body, response.status);
      }
    }

    // Store idempotency info for this request
    c.set("idempotencyKey", idempotencyKey);
    c.set("bodyHash", bodyHash);
    c.set("originalBody", body);

    return next();
  };
}

/**
 * Store successful response for idempotency
 */
export async function storeIdempotentResponse(
  c: Context,
  response: any,
  status: number = 200
): Promise<void> {
  const idempotencyKey = c.get("idempotencyKey");
  const userId = c.get("userId");
  const bodyHash = c.get("bodyHash");
  const path = c.req.path;

  if (!idempotencyKey || !userId) return;

  const responseData = {
    body: response,
    status,
  };

  await supabaseAdmin.from("idempotency_keys").upsert(
    {
      key: idempotencyKey,
      user_id: userId,
      route: path,
      body_hash: bodyHash,
      response: JSON.stringify(responseData),
    },
    {
      onConflict: "key,user_id",
    }
  );
}
