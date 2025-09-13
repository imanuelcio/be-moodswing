import type { Context } from "hono";
import { AirdropSnapshotSchema } from "../schemas/index.js";
import {
  createSnapshot,
  getSnapshotData,
  getSnapshotPeriods,
  getUserAirdropAllocation,
  getSnapshotStats,
  deleteSnapshot as deleteSnapshotService,
} from "../services/airdrop.service.js";
import { storeIdempotentResponse } from "../lib/idempotency.js";

export async function useCreateSnapshot(c: Context) {
  try {
    const body = await c.req.json();
    const validatedData = AirdropSnapshotSchema.parse(body);

    const csvFilename = await createSnapshot(validatedData);

    const response = {
      success: true,
      data: {
        period: validatedData.period,
        csvFilename,
        message: "Snapshot created successfully",
      },
    };

    await storeIdempotentResponse(c, response);

    return c.json(response);
  } catch (error) {
    console.error("Failed to create snapshot:", error);

    if (error instanceof Error && error.message.includes("already exists")) {
      return c.json(
        {
          error: {
            code: "CONFLICT",
            message: error.message,
          },
        },
        409
      );
    }

    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create snapshot",
        },
      },
      500
    );
  }
}

export async function getSnapshots(c: Context) {
  try {
    const periods = await getSnapshotPeriods();

    return c.json({
      success: true,
      data: { periods },
    });
  } catch (error) {
    console.error("Failed to get snapshots:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error ? error.message : "Failed to get snapshots",
        },
      },
      500
    );
  }
}

export async function useGetSnapshotData(c: Context) {
  try {
    const period = c.req.param("period");
    const limit = parseInt(c.req.query("limit") || "100");
    const offset = parseInt(c.req.query("offset") || "0");

    const data = await getSnapshotData(period, limit, offset);
    const stats = await getSnapshotStats(period);

    return c.json({
      success: true,
      data: {
        snapshot: data,
        stats,
        pagination: {
          limit,
          offset,
          count: data.length,
        },
      },
    });
  } catch (error) {
    console.error("Failed to get snapshot data:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get snapshot data",
        },
      },
      500
    );
  }
}

export async function getUserAllocation(c: Context) {
  try {
    const userId = c.req.param("userId");
    const period = c.req.param("period");

    const allocation = await getUserAirdropAllocation(userId, period);

    return c.json({
      success: true,
      data: { allocation },
    });
  } catch (error) {
    console.error("Failed to get user allocation:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to get user allocation",
        },
      },
      500
    );
  }
}

export async function deleteSnapshot(c: Context) {
  try {
    const period = c.req.param("period");

    await deleteSnapshotService(period);

    return c.json({
      success: true,
      data: { message: `Snapshot deleted for period: ${period}` },
    });
  } catch (error) {
    console.error("Failed to delete snapshot:", error);
    return c.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Failed to delete snapshot",
        },
      },
      500
    );
  }
}
