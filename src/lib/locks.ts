// /lib/locks.ts

import { supabaseAdmin } from "../config/supabase.js";

/**
 * Execute function with PostgreSQL advisory lock on market
 * Uses hashtext to convert market UUID to bigint for pg_advisory_lock
 */
export async function withMarketLock<T>(
  marketId: string,
  fn: () => Promise<T>
): Promise<T> {
  let lockAcquired = false;

  try {
    // Acquire advisory lock using market ID
    const { data: lockResult, error: lockError } = await supabaseAdmin.rpc(
      "acquire_market_lock",
      { market_uuid: marketId }
    );

    if (lockError) {
      throw new Error(`Failed to acquire market lock: ${lockError.message}`);
    }

    if (!lockResult) {
      throw new Error("Could not acquire market lock - market may be busy");
    }

    lockAcquired = true;

    // Execute the function
    return await fn();
  } finally {
    // Always release lock if it was acquired
    if (lockAcquired) {
      try {
        await supabaseAdmin.rpc("release_market_lock", {
          market_uuid: marketId,
        });
      } catch (error) {
        console.error(`Failed to release market lock for ${marketId}:`, error);
        // Don't throw here as it might mask the original error
      }
    }
  }
}

export async function withMarketLockFallback<T>(
  marketId: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `market_lock_${marketId}`;
  const maxRetries = 3;
  const retryDelay = 100; // ms

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to insert lock record
      const { error: insertError } = await supabaseAdmin
        .from("market_locks")
        .insert({
          market_id: marketId,
          locked_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 30000).toISOString(), // 30 second timeout
        });

      if (!insertError) {
        // Lock acquired, execute function
        try {
          return await fn();
        } finally {
          // Release lock
          await supabaseAdmin
            .from("market_locks")
            .delete()
            .eq("market_id", marketId);
        }
      }

      // Lock not acquired, wait and retry
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
        );
      }
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
    }
  }

  throw new Error(
    `Could not acquire market lock for ${marketId} after ${maxRetries} attempts`
  );
}
