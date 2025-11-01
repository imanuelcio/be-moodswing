import { UserRepository, } from "../repo/user.repo.js";
import { WalletRepository } from "../repo/wallet.repo.js";
import { ValidationError, ConflictError, NotFoundError, } from "../core/errors.js";
export class UserService {
    userRepo;
    walletRepo;
    constructor(userRepo = new UserRepository(), walletRepo = new WalletRepository()) {
        this.userRepo = userRepo;
        this.walletRepo = walletRepo;
    }
    async getUserById(id) {
        const user = await this.userRepo.findById(id);
        if (!user) {
            throw new NotFoundError("User", id);
        }
        return user;
    }
    async getUserProfile(userId) {
        const user = await this.userRepo.findById(userId);
        if (!user) {
            throw new NotFoundError("User", userId);
        }
        const wallets = await this.walletRepo.findByUser(userId);
        const primaryWallet = await this.walletRepo.findPrimaryWallet(userId);
        return {
            ...user,
            wallets,
            primaryWallet,
        };
    }
    async updateUser(id, userData) {
        // Check if handle is being updated and if it's unique
        if (userData.handle) {
            const existingUser = await this.userRepo.findByHandle(userData.handle);
            if (existingUser && existingUser.id !== id) {
                throw new ConflictError(`Handle '${userData.handle}' is already taken`);
            }
        }
        // Check if email is being updated and if it's unique
        if (userData.email) {
            const existingUser = await this.userRepo.findByEmail(userData.email);
            if (existingUser && existingUser.id !== id) {
                throw new ConflictError(`Email '${userData.email}' is already in use`);
            }
        }
        return this.userRepo.update(id, userData);
    }
    async searchUsers(params = {}) {
        const { search, page = 1, limit = 20 } = params;
        if (limit > 100) {
            throw new ValidationError("Limit cannot exceed 100");
        }
        const offset = (page - 1) * limit;
        const result = await this.userRepo.list({
            search,
            offset,
            limit,
        });
        const totalPages = Math.ceil(result.total / limit);
        return {
            users: result.users,
            pagination: {
                page,
                limit,
                total: result.total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }
    async getUserStats() {
        // Get basic user count
        const { users, total } = await this.userRepo.list({ limit: 1 });
        // Get wallet stats
        const walletStats = await this.walletRepo.getWalletStats();
        return {
            totalUsers: total,
            totalWallets: walletStats.totalWallets,
            walletsByChain: walletStats.byChain,
        };
    }
}
