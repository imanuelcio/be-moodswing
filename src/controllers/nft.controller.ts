import type { Context } from "hono";
import { z } from "zod";
import {
  NftService,
  MintRecordSchema,
  CreateCollectionSchema,
  ListTokensQuerySchema,
} from "../services/nft.service.js";

export class NftController {
  static async listCollections(c: Context) {
    try {
      const data = await NftService.publicListCollections();
      return c.json({ status: true, data });
    } catch (err: any) {
      return c.json(
        {
          status: false,
          error: {
            code: "LIST_COLLECTIONS_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }
  static async getCollection(c: Context) {
    try {
      const id = Number(c.req.param("id"));
      if (!Number.isFinite(id))
        return c.json({ status: false, error: { message: "Invalid id" } }, 400);

      const data = await NftService.publicGetCollectionDetail(id);
      return c.json({ status: true, data });
    } catch (err: any) {
      return c.json(
        {
          status: false,
          error: {
            code: "GET_COLLECTION_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }

  static async recordMint(c: Context) {
    try {
      const raw = await c.req.json();
      const body = MintRecordSchema.parse(raw);

      const user = c.get("user") as { id: number } | undefined;
      if (!user?.id)
        return c.json(
          { status: false, error: { message: "Unauthorized" } },
          401
        );

      const result = await NftService.verifyAndRecordMint({
        ...body,
        userId: user.id,
      });

      return c.json({ status: true, message: "NFT recorded", data: result });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            status: false,
            error: { code: "INVALID_INPUT", message: err.message },
          },
          400
        );
      }
      return c.json(
        {
          status: false,
          error: {
            code: "MINT_RECORD_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }
  static async listTokens(c: Context) {
    try {
      const q = Object.fromEntries(new URL(c.req.url).searchParams.entries());
      const parsed = ListTokensQuerySchema.parse(q);

      const result = await NftService.listTokens(parsed);

      return c.json({
        status: true,
        data: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.hasMore,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            status: false,
            error: { code: "INVALID_QUERY", message: err.message },
          },
          400
        );
      }
      return c.json(
        {
          status: false,
          error: {
            code: "LIST_TOKENS_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }
  static async createCollection(c: Context) {
    try {
      const raw = await c.req.json();
      const body = CreateCollectionSchema.parse(raw);

      // const auth = c.get("user") as { id: number; role?: string } | undefined;
      // if (!auth?.id /* || auth.role !== 'ADMIN' */) {
      //   return c.json(
      //     { status: false, error: { message: "Unauthorized" } },
      //     401
      //   );
      // }

      const created = await NftService.createCollection(body);

      return c.json({
        status: true,
        message: "Collection created",
        data: created,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            status: false,
            error: { code: "INVALID_INPUT", message: err.message },
          },
          400
        );
      }
      return c.json(
        {
          status: false,
          error: {
            code: "CREATE_COLLECTION_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }
}

export class NftOwnedController {
  // GET /api/nft/me/tokens
  static async listMyTokens(c: Context) {
    try {
      // auth middleware harus set c.set('user', { id, ... })
      const me = c.get("user") as { id: number } | undefined;
      if (!me?.id)
        return c.json(
          { status: false, error: { message: "Unauthorized" } },
          401
        );

      const q = Object.fromEntries(new URL(c.req.url).searchParams.entries());
      // gunakan schema tapi tanpa memaksa collectionId (optional)
      const parsed = ListTokensQuerySchema.partial({
        collectionId: true,
      }).parse(q);

      const result = await NftService.ownedListTokens(me.id, parsed);
      return c.json({
        status: true,
        data: result.items,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.page * result.pageSize < result.total,
        // hasMore: result.hasMore,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return c.json(
          {
            status: false,
            error: { code: "INVALID_QUERY", message: err.message },
          },
          400
        );
      }
      return c.json(
        {
          status: false,
          error: {
            code: "LIST_MY_TOKENS_FAILED",
            message: err?.message ?? "Failed",
          },
        },
        400
      );
    }
  }
}
