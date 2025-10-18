import type { Context } from "hono";
import { z } from "zod";
import {
  ChainRepository,
  type CreateChainData,
  type UpdateChainData,
} from "../repo/chain.repo.js";
import { formatError, ValidationError } from "../core/errors.js";
import {
  createChainSchema,
  updateChainSchema,
} from "../schemas/chain.schema.js";

export class ChainController {
  constructor(private chainRepo = new ChainRepository()) {}

  async listChains(c: Context) {
    try {
      const chains = await this.chainRepo.list();

      return c.json({ chains });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to list chains");

      return c.json(formatError(error as Error), 500);
    }
  }

  async getChainById(c: Context) {
    try {
      const chainId = c.req.param("id");

      const chain = await this.chainRepo.findById(chainId);
      if (!chain) {
        return c.json(formatError(new ValidationError("Chain not found")), 404);
      }

      return c.json({ chain });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get chain");

      return c.json(formatError(error as Error), 500);
    }
  }

  async createChain(c: Context) {
    try {
      const body = await c.req.json();
      const chainData = createChainSchema.parse(body) as CreateChainData;

      // Check if chain key already exists
      const existingChain = await this.chainRepo.findByKey(chainData.key);
      if (existingChain) {
        return c.json(
          formatError(
            new ValidationError(
              `Chain with key '${chainData.key}' already exists`
            )
          ),
          409
        );
      }

      const chain = await this.chainRepo.create(chainData);

      const logger = c.get("logger");
      logger.info({ chainId: chain.id, key: chain.key }, "Chain created");

      return c.json({ chain }, 201);
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to create chain");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), error || 500);
    }
  }

  async updateChain(c: Context) {
    try {
      const chainId = c.req.param("id");
      const body = await c.req.json();
      const chainData = updateChainSchema.parse(body) as UpdateChainData;

      const chain = await this.chainRepo.update(chainId, chainData);

      const logger = c.get("logger");
      logger.info({ chainId }, "Chain updated");

      return c.json({ chain });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to update chain");

      if (error instanceof z.ZodError) {
        return c.json(
          formatError(new ValidationError("Invalid input", error.message)),
          400
        );
      }

      return c.json(formatError(error as Error), error || 500);
    }
  }

  async deleteChain(c: Context) {
    try {
      const chainId = c.req.param("id");

      await this.chainRepo.delete(chainId);

      const logger = c.get("logger");
      logger.info({ chainId }, "Chain deleted");

      return c.json({ success: true });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to delete chain");

      return c.json(formatError(error as Error), error || 500);
    }
  }

  async getChainsByKind(c: Context) {
    try {
      const kind = c.req.param("kind") as "ethereum" | "solana";

      if (!["ethereum", "solana"].includes(kind)) {
        return c.json(
          formatError(new ValidationError("Invalid chain kind")),
          400
        );
      }

      const chains = await this.chainRepo.findByKind(kind);

      return c.json({ chains });
    } catch (error) {
      const logger = c.get("logger");
      logger.error({ error }, "Failed to get chains by kind");

      return c.json(formatError(error as Error), 500);
    }
  }
}
