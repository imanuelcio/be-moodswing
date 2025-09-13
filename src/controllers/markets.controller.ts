// /controller/markets.ts
import type { Context } from "hono";
import {
  CreateMarketSchema,
  BetSchema,
  ResolveMarketSchema,
  MarketQuerySchema,
} from "../schemas/index.js";
import {
  createMarket,
  closeMarket,
  resolveMarket,
  listMarkets,
  getMarket,
  bet,
  getUserPositions,
} from "../services/markets.service.js";
import { storeIdempotentResponse } from "../lib/idempotency.js";

/**
 * Controller for market operations
 */

/**
 * Get markets list
 * GET /markets?status=OPEN
 */
export async function getMarkets(c: Context) {
  try {
    const query = MarketQuerySchema.parse({
      status: c.req.query("status"),
    });

    const markets = await listMarkets(query);

    return c.json({
      success: true,
      data: { markets },
    });
  } catch (error) {
    console.error("Failed to get markets:", error);

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
          message:
            error instanceof Error ? error.message : "Failed to get markets",
        },
      },
      500
    );
  }
}

/**
 * Get single market
 * GET /markets/:id
 */
export async function getMarketById(c: Context) {
  try {
    const marketId = c.req.param("id");

    if (!marketId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Market ID is required",
          },
        },
        400
      );
    }

    const market = await getMarket(marketId);

    if (!market) {
      return c.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Market not found",
          },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { market },
    });
  } catch (error) {
    console.error("Failed to get market:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get market",
        },
      },
      500
    );
  }
}

/**
 * Create new market (admin only)
 * POST /markets
 */
export async function createNewMarket(c: Context) {
  try {
    const userId = c.get("userId");
    const body = await c.req.json();

    const validatedData = CreateMarketSchema.parse(body);

    const market = await createMarket(validatedData, userId);

    const response = {
      success: true,
      data: { market },
    };

    await storeIdempotentResponse(c, response, 201);

    return c.json(response, 201);
  } catch (error) {
    console.error("Failed to create market:", error);

    if (error instanceof Error && error.message.includes("validation")) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid market data",
          },
        },
        400
      );
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to create market",
        },
      },
      500
    );
  }
}

/**
 * Place bet on market
 * POST /markets/:id/bet
 */
export async function placeBet(c: Context) {
  try {
    const marketId = c.req.param("id");
    const userId = c.get("userId");
    const body = await c.req.json();

    if (!marketId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Market ID is required",
          },
        },
        400
      );
    }

    const validatedData = BetSchema.parse(body);

    const result = await bet(marketId, userId, validatedData);

    const response = {
      success: true,
      data: {
        position: result.position,
        newBalance: result.newBalance,
        market: result.market,
      },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to place bet:", error);

    if (error instanceof Error) {
      if (error.message.includes("validation")) {
        return c.json(
          {
            error: {
              code: "BAD_REQUEST",
              message: "Invalid bet data",
            },
          },
          400
        );
      }

      if (
        error.message.includes("not open") ||
        error.message.includes("expired") ||
        error.message.includes("not found")
      ) {
        return c.json(
          {
            error: {
              code: "UNPROCESSABLE_ENTITY",
              message: error.message,
            },
          },
          422
        );
      }

      if (error.message.includes("Insufficient")) {
        return c.json(
          {
            error: {
              code: "UNPROCESSABLE_ENTITY",
              message: error.message,
            },
          },
          422
        );
      }
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to place bet",
        },
      },
      500
    );
  }
}

/**
 * Close market (admin only)
 * POST /markets/:id/close
 */
export async function closeMarketById(c: Context) {
  try {
    const marketId = c.req.param("id");

    if (!marketId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Market ID is required",
          },
        },
        400
      );
    }

    const market = await closeMarket(marketId);

    const response = {
      success: true,
      data: { market },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to close market:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to close market",
        },
      },
      500
    );
  }
}

/**
 * Resolve market (admin only)
 * POST /markets/:id/resolve
 */
export async function resolveMarketById(c: Context) {
  try {
    const marketId = c.req.param("id");
    const body = await c.req.json();

    if (!marketId) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Market ID is required",
          },
        },
        400
      );
    }

    const validatedData = ResolveMarketSchema.parse(body);

    const market = await resolveMarket(marketId, validatedData);

    const response = {
      success: true,
      data: { market },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to resolve market:", error);

    if (error instanceof Error && error.message.includes("validation")) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid resolution data",
          },
        },
        400
      );
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to resolve market",
        },
      },
      500
    );
  }
}

/**
 * Get user positions
 * GET /markets/positions?market_id=xxx
 */
export async function getPositions(c: Context) {
  try {
    const userId = c.get("userId");
    const marketId = c.req.query("market_id");

    const positions = await getUserPositions(userId, marketId);

    return c.json({
      success: true,
      data: { positions },
    });
  } catch (error) {
    console.error("Failed to get positions:", error);

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get positions",
        },
      },
      500
    );
  }
}
