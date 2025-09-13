// /controller/sse.ts
import type { Context } from "hono";
import { stream } from "hono/streaming";
import { sseBroadcaster } from "../lib/sse.js";
import { SSEQuerySchema } from "../schemas/index.js";

/**
 * Controller for Server-Sent Events
 */

/**
 * Market updates SSE stream
 * GET /sse/markets?ids=market1,market2,market3
 */
export async function marketUpdates(c: Context) {
  try {
    // Parse and validate query parameters
    const ids = c.req.query("ids");
    if (!ids) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Market IDs are required (query parameter: ids)",
          },
        },
        400
      );
    }

    const validatedQuery = SSEQuerySchema.parse({ ids });
    const marketIds = validatedQuery.ids;

    if (marketIds.length === 0) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "At least one market ID is required",
          },
        },
        400
      );
    }

    if (marketIds.length > 10) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Cannot subscribe to more than 10 markets at once",
          },
        },
        400
      );
    }

    // Get Last-Event-ID header for reconnection support
    const lastEventId = c.req.header("Last-Event-ID");

    // Start SSE stream
    return stream(c, async (stream) => {
      try {
        // Subscribe to market updates
        await sseBroadcaster.subscribe(c, marketIds, lastEventId);
      } catch (error) {
        console.error("SSE stream error:", error);

        // Send error event and close stream
        try {
          await stream.write("event: error\n");
          await stream.write(
            `data: ${JSON.stringify({
              error: "Stream connection failed",
              code: "STREAM_ERROR",
            })}\n\n`
          );
        } catch (writeError) {
          console.error("Failed to write error to stream:", writeError);
        }
      }
    });
  } catch (error) {
    console.error("Failed to start SSE stream:", error);

    if (error instanceof Error && error.message.includes("validation")) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid query parameters",
          },
        },
        400
      );
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start market updates stream",
        },
      },
      500
    );
  }
}

/**
 * Health check for SSE endpoint
 * GET /sse/health
 */
export async function sseHealth(c: Context) {
  return c.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
      activeConnections: sseBroadcaster["clients"]?.size || 0,
    },
  });
}

/**
 * Get SSE connection stats (admin only)
 * GET /sse/stats
 */
export async function sseStats(c: Context) {
  try {
    const clients = sseBroadcaster["clients"] || new Map();
    const marketSequences = sseBroadcaster["marketSequences"] || new Map();

    const stats = {
      totalConnections: clients.size,
      totalMarkets: marketSequences.size,
      connectionsByMarket: {} as { [marketId: string]: number },
      sequences: Object.fromEntries(marketSequences),
    };

    // Count connections per market
    for (const client of clients.values()) {
      for (const marketId of client.marketIds) {
        stats.connectionsByMarket[marketId] =
          (stats.connectionsByMarket[marketId] || 0) + 1;
      }
    }

    return c.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Failed to get SSE stats:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get SSE statistics",
        },
      },
      500
    );
  }
}
