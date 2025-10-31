import { PointsRepository, } from "../repo/points.repo.js";
import { ValidationError, NotFoundError } from "../core/errors.js";
import { eventTypes, topics } from "../core/topics.js";
import { writeToOutbox } from "../core/outbox.js";
export class PointsService {
    pointsRepo;
    constructor(pointsRepo = new PointsRepository()) {
        this.pointsRepo = pointsRepo;
    }
    async getUserBalance(userId) {
        return this.pointsRepo.getUserBalance(userId);
    }
    async addPoints(userId, amount, reason, metadata) {
        if (amount <= 0) {
            throw new ValidationError("Amount must be positive");
        }
        const entry = await this.pointsRepo.addPoints({
            user_id: userId,
            reason,
            delta: amount,
            metadata,
        });
        // Notify user
        await writeToOutbox({
            topic: topics.userNotifications(userId),
            kind: eventTypes.USER_POINTS_UPDATED,
            payload: {
                user_id: userId,
                delta: entry.delta,
                balance: entry.balance_after,
                reason: entry.reason,
            },
        });
    }
    async deductPoints(userId, amount, reason, metadata) {
        if (amount <= 0) {
            throw new ValidationError("Amount must be positive");
        }
        const currentBalance = await this.pointsRepo.getUserBalance(userId);
        if (currentBalance < amount) {
            throw new ValidationError(`Insufficient points. Balance: ${currentBalance}, Required: ${amount}`);
        }
        const entry = await this.pointsRepo.addPoints({
            user_id: userId,
            reason,
            delta: -amount,
            metadata,
        });
        // Notify user
        await writeToOutbox({
            topic: topics.userNotifications(userId),
            kind: eventTypes.USER_POINTS_UPDATED,
            payload: {
                user_id: userId,
                delta: entry.delta,
                balance: entry.balance_after,
                reason: entry.reason,
            },
        });
    }
    async transferPoints(fromUserId, toUserId, amount, reason = "transfer") {
        if (amount <= 0) {
            throw new ValidationError("Amount must be positive");
        }
        if (fromUserId === toUserId) {
            throw new ValidationError("Cannot transfer points to yourself");
        }
        const fromBalance = await this.pointsRepo.getUserBalance(fromUserId);
        if (fromBalance < amount) {
            throw new ValidationError(`Insufficient points. Balance: ${fromBalance}, Required: ${amount}`);
        }
        // Execute transfer atomically
        const entries = await this.pointsRepo.bulkAddPoints([
            {
                user_id: fromUserId,
                reason: `${reason}_sent`,
                delta: -amount,
                ref_type: "transfer",
                ref_id: toUserId,
                metadata: { to_user_id: toUserId },
            },
            {
                user_id: toUserId,
                reason: `${reason}_received`,
                delta: amount,
                ref_type: "transfer",
                ref_id: fromUserId,
                metadata: { from_user_id: fromUserId },
            },
        ]);
        // Notify both users
        await writeToOutbox({
            topic: topics.userNotifications(fromUserId),
            kind: eventTypes.USER_POINTS_UPDATED,
            payload: {
                user_id: fromUserId,
                delta: -amount,
                balance: entries[0].balance_after,
                reason: `${reason}_sent`,
            },
        });
        await writeToOutbox({
            topic: topics.userNotifications(toUserId),
            kind: eventTypes.USER_POINTS_UPDATED,
            payload: {
                user_id: toUserId,
                delta: amount,
                balance: entries[1].balance_after,
                reason: `${reason}_received`,
            },
        });
    }
    async getUserHistory(userId, params = {}) {
        const { page = 1, limit = 50, ...restParams } = params;
        if (limit > 100) {
            throw new ValidationError("Limit cannot exceed 100");
        }
        const offset = (page - 1) * limit;
        const result = await this.pointsRepo.getUserHistory(userId, {
            ...restParams,
            offset,
            limit,
        });
        const totalPages = Math.ceil(result.total / limit);
        return {
            entries: result.entries,
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
    async getPointsStats(params = {}) {
        return this.pointsRepo.getPointsStats(params);
    }
    async getLeaderboard(params = {}) {
        return this.pointsRepo.getLeaderboard(params);
    }
    async awardDailyBonus(userId) {
        const dailyBonusAmount = 100; // Configure as needed
        // Check if user already received daily bonus today
        const today = new Date().toISOString().split("T")[0];
        const history = await this.pointsRepo.getUserHistory(userId, {
            reason: "daily_bonus",
            limit: 1,
        });
        if (history.entries.length > 0) {
            const lastBonus = new Date(history.entries[0].created_at)
                .toISOString()
                .split("T")[0];
            if (lastBonus === today) {
                throw new ValidationError("Daily bonus already claimed today");
            }
        }
        await this.addPoints(userId, dailyBonusAmount, "daily_bonus", {
            date: today,
        });
    }
    async bulkAwardPoints(awards) {
        const entries = awards.map((award) => ({
            user_id: award.userId,
            reason: award.reason,
            delta: award.amount,
            metadata: award.metadata,
        }));
        await this.pointsRepo.bulkAddPoints(entries);
        // Send notifications
        for (const award of awards) {
            await writeToOutbox({
                topic: topics.userNotifications(award.userId),
                kind: eventTypes.USER_POINTS_UPDATED,
                payload: {
                    user_id: award.userId,
                    delta: award.amount,
                    reason: award.reason,
                },
            });
        }
    }
}
