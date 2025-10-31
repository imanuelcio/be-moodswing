export class AppError extends Error {
    message;
    code;
    statusCode;
    details;
    constructor(message, code, statusCode = 500, details) {
        super(message);
        this.message = message;
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = "AppError";
        Error.captureStackTrace(this, AppError);
    }
}
export class ValidationError extends AppError {
    constructor(message, details) {
        super(message, "VALIDATION_ERROR", 400, details);
        this.name = "ValidationError";
    }
}
export class NotFoundError extends AppError {
    constructor(resource, id) {
        const message = id
            ? `${resource} with id '${id}' not found`
            : `${resource} not found`;
        super(message, "NOT_FOUND", 404);
        this.name = "NotFoundError";
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, "UNAUTHORIZED", 401);
        this.name = "UnauthorizedError";
    }
}
export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(message, "FORBIDDEN", 403);
        this.name = "ForbiddenError";
    }
}
export class RateLimitError extends AppError {
    constructor(message = "Rate limit exceeded") {
        super(message, "RATE_LIMIT_EXCEEDED", 429);
        this.name = "RateLimitError";
    }
}
export class ConflictError extends AppError {
    constructor(message) {
        super(message, "CONFLICT", 409);
        this.name = "ConflictError";
    }
}
// Error formatter for API responses
export function formatError(error) {
    if (error instanceof AppError) {
        return {
            error: {
                code: error.code,
                message: error.message,
                ...(error.details && { details: error.details }),
            },
        };
    }
    // Unknown errors - don't leak internal details in production
    return {
        error: {
            code: "INTERNAL_ERROR",
            message: process.env.NODE_ENV === "production"
                ? "An internal error occurred"
                : error.message,
        },
    };
}
