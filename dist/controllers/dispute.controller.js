import { z } from "zod";
import { DisputeService, } from "../services/dispute.service.js";
import { formatError, ValidationError } from "../core/errors.js";
import { createDisputeSchema, resolveDisputeSchema, voteOnDisputeSchema, } from "../schemas/dispute.schema.js";
const listDisputesSchema = z.object({
    status: z
        .string()
        .optional()
        .transform((val) => (val ? val.split(",") : undefined)),
    marketId: z.string().uuid().optional(),
    openedBy: z.string().uuid().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    order_by: z.string().default("created_at"),
    order_dir: z.enum(["asc", "desc"]).default("desc"),
});
export class DisputeController {
    disputeService;
    constructor(disputeService = new DisputeService()) {
        this.disputeService = disputeService;
    }
    async createDispute(c) {
        try {
            const marketId = c.req.param("marketId");
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const body = await c.req.json();
            const request = createDisputeSchema.parse(body);
            const dispute = await this.disputeService.createDispute(marketId, userId, request);
            const logger = c.get("logger");
            logger.info({
                disputeId: dispute.id,
                marketId,
                userId,
                reason: request.reason.substring(0, 100),
            }, "Dispute created");
            return c.json({ dispute }, 201);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to create dispute");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input")), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async voteOnDispute(c) {
        try {
            const disputeId = c.req.param("id");
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const body = await c.req.json();
            const request = voteOnDisputeSchema.parse(body);
            const vote = await this.disputeService.voteOnDispute(disputeId, userId, request);
            const logger = c.get("logger");
            logger.info({
                disputeId,
                userId,
                vote: request.vote,
            }, "Dispute vote cast");
            return c.json({ vote }, 201);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to vote on dispute");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input")), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async resolveDispute(c) {
        try {
            const disputeId = c.req.param("id");
            const userId = c.get("userId"); // Admin user
            const body = await c.req.json();
            const { outcome, source } = resolveDisputeSchema.parse(body);
            const result = await this.disputeService.resolveDispute(disputeId, outcome, source, userId);
            const logger = c.get("logger");
            logger.info({
                disputeId,
                outcome,
                userId,
            }, "Dispute resolved");
            return c.json(result);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to resolve dispute");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input")), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async getDispute(c) {
        try {
            const disputeId = c.req.param("id");
            const dispute = await this.disputeService.getDispute(disputeId);
            return c.json({ dispute });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get dispute");
            return c.json(formatError(error), 500);
        }
    }
    async listDisputes(c) {
        try {
            const query = c.req.query();
            const params = listDisputesSchema.parse(query);
            const { status, marketId, openedBy, page, limit, order_by, order_dir } = params;
            const result = await this.disputeService.listDisputes({
                status,
                marketId,
                openedBy,
                page,
                limit,
                orderBy: order_by,
                orderDir: order_dir,
            });
            return c.json(result);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to list disputes");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input")), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
    async getUserVotes(c) {
        try {
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const query = c.req.query();
            const status = query.status ? query.status.split(",") : undefined;
            const page = parseInt(query.page || "1");
            const limit = parseInt(query.limit || "20");
            const result = await this.disputeService.getUserVotes(userId, {
                status,
                page,
                limit,
            });
            return c.json(result);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get user votes");
            return c.json(formatError(error), 500);
        }
    }
    async getActiveDisputes(c) {
        try {
            const disputes = await this.disputeService.getActiveDisputes();
            return c.json({ disputes });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get active disputes");
            return c.json(formatError(error), 500);
        }
    }
    async getDisputeStats(c) {
        try {
            const query = c.req.query();
            const period = query.period || "all";
            const stats = await this.disputeService.getDisputeStats({ period });
            return c.json({ stats });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get dispute stats");
            return c.json(formatError(error), 500);
        }
    }
    async getDisputeVotes(c) {
        try {
            const disputeId = c.req.param("id");
            const dispute = await this.disputeService.getDispute(disputeId);
            return c.json({
                votes: dispute.dispute_votes || [],
                voteSummary: dispute.voteSummary,
            });
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to get dispute votes");
            return c.json(formatError(error), 500);
        }
    }
    async updateVote(c) {
        try {
            const disputeId = c.req.param("disputeId");
            const voteId = c.req.param("voteId");
            const userId = c.get("userId");
            if (!userId) {
                return c.json(formatError(new ValidationError("User ID required")), 401);
            }
            const body = await c.req.json();
            const { vote } = voteOnDisputeSchema.parse(body);
            // Verify the vote belongs to the user
            const dispute = await this.disputeService.getDispute(disputeId);
            const userVote = dispute.dispute_votes?.find((v) => v.id === voteId && v.user_id === userId);
            if (!userVote) {
                return c.json(formatError(new ValidationError("Vote not found or not owned by user")), 404);
            }
            // For now, we'll create a new vote since update might not be allowed
            // In a real system, you might want to allow vote updates within a time window
            return c.json(formatError(new ValidationError("Vote updates not allowed after submission")), 400);
        }
        catch (error) {
            const logger = c.get("logger");
            logger.error({ error }, "Failed to update vote");
            if (error instanceof z.ZodError) {
                return c.json(formatError(new ValidationError("Invalid input")), 400);
            }
            return c.json(formatError(error), 500);
        }
    }
}
