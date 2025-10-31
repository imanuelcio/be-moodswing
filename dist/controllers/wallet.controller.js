import { z } from "zod";
import { WalletRepository, } from "../repo/wallet.repo.js";
import { ChainRepository } from "../repo/chain.repo.js";
import { formatError, ValidationError, NotFoundError } from "../core/errors.js";
import { createWalletSchema, updateWalletSchema, } from "../schemas/wallet.schema.js";
export class WalletController {
    walletRepo;
    chainRepo;
    constructor(walletRepo = new WalletRepository(), chainRepo = new ChainRepository()) {
        this.walletRepo = walletRepo;
        this.chainRepo = chainRepo;
    }
    async getUserWallets(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const wallets = await this.walletRepo.findByUser(userId);
            return c.json({ wallets });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get user wallets");
            return c.json(formatError(error), 500);
        }
    }
    async getPrimaryWallet(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const wallet = await this.walletRepo.findPrimaryWallet(userId);
            if (!wallet) {
                return c.json(formatError(new NotFoundError("Primary wallet")), 404);
            }
            return c.json({ wallet });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get primary wallet");
            return c.json(formatError(error), 500);
        }
    }
    async addWallet(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const body = await c.req.json();
            const { chain_id, address, is_primary } = createWalletSchema.parse(body);
            // Validate chain exists
            const chain = await this.chainRepo.findById(chain_id);
            if (!chain) {
                return c.json(formatError(new NotFoundError("Chain", chain_id)), 404);
            }
            // Check if wallet already exists for this user and chain
            const existingWallet = await this.walletRepo.findByAddress(address, chain_id);
            if (existingWallet && existingWallet.user_id === userId) {
                return c.json(formatError(new ValidationError("Wallet already exists for this user")), 409);
            }
            const walletData = {
                user_id: userId,
                chain_id,
                address,
                is_primary,
            };
            const wallet = await this.walletRepo.create(walletData);
            const logger = c.get("logger");
            logger.info({ userId, walletId: wallet.id, address }, "Wallet added");
            return c.json({ wallet }, 201);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to add wallet");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async updateWallet(c) {
        try {
            const userId = c.get("userId");
            const walletId = c.req.param("id");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            // Check if wallet belongs to user
            const existingWallet = await this.walletRepo.findById(walletId);
            if (!existingWallet || existingWallet.user_id !== userId) {
                return c.json(formatError(new NotFoundError("Wallet")), 404);
            }
            const body = await c.req.json();
            const walletData = updateWalletSchema.parse(body);
            const wallet = await this.walletRepo.update(walletId, walletData);
            const logger = c.get("logger");
            logger.info({ userId, walletId }, "Wallet updated");
            return c.json({ wallet });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to update wallet");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input", error.message)), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async deleteWallet(c) {
        try {
            const userId = c.get("userId");
            const walletId = c.req.param("id");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            // Check if wallet belongs to user
            const existingWallet = await this.walletRepo.findById(walletId);
            if (!existingWallet || existingWallet.user_id !== userId) {
                return c.json(formatError(new NotFoundError("Wallet")), 404);
            }
            // Don't allow deleting primary wallet if user has other wallets
            if (existingWallet.is_primary) {
                const userWallets = await this.walletRepo.findByUser(userId);
                if (userWallets.length > 1) {
                    return c.json(formatError(new ValidationError("Cannot delete primary wallet. Set another wallet as primary first.")), 400);
                }
            }
            await this.walletRepo.delete(walletId);
            const logger = c.get("logger");
            logger.info({ userId, walletId }, "Wallet deleted");
            return c.json({ success: true });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to delete wallet");
            return c.json(formatError(error), 500);
        }
    }
    async getWalletStats(c) {
        try {
            const userId = c.get("userId");
            const stats = await this.walletRepo.getWalletStats(userId);
            return c.json({ stats });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get wallet stats");
            return c.json(formatError(error), 500);
        }
    }
}
