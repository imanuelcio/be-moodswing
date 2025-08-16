import type { Context } from "hono";

/**
 * Standardized API response builders
 */

export class ApiResponseBuilder {
  /**
   * Success response
   */
  static success<T = any>(c: Context, data?: T, message?: string) {
    return c.json(
      {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString(),
      },
      200
    );
  }

  /**
   * Error response
   */
  static error(c: Context, error: string, details?: any) {
    return c.json(
      {
        success: false,
        error,
        details,
        timestamp: new Date().toISOString(),
      },
      400
    );
  }

  /**
   * Validation error response
   */
  static validationError(
    c: Context,
    errors: Array<{ field: string; message: string }>
  ) {
    return c.json(
      {
        success: false,
        error: "Validation failed",
        details: {
          errors,
        },
        timestamp: new Date().toISOString(),
      },
      400
    );
  }

  /**
   * Paginated response
   */
  static paginated<T = any>(
    c: Context,
    data: T[],
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }
  ) {
    return c.json(
      {
        success: true,
        data,
        pagination,
        timestamp: new Date().toISOString(),
      },
      200
    );
  }

  /**
   * Not found response
   */
  static notFound(c: Context, resource: string = "Resource") {
    return c.json(
      {
        success: false,
        error: `${resource} not found`,
        timestamp: new Date().toISOString(),
      },
      404
    );
  }

  /**
   * Unauthorized response
   */
  static unauthorized(c: Context, message: string = "Unauthorized access") {
    return c.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      401
    );
  }

  /**
   * Forbidden response
   */
  static forbidden(c: Context, message: string = "Access forbidden") {
    return c.json(
      {
        success: false,
        error: message,
        timestamp: new Date().toISOString(),
      },
      403
    );
  }

  /**
   * Created response
   */
  static created<T = any>(
    c: Context,
    data: T,
    message: string = "Resource created successfully"
  ) {
    return c.json(
      {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString(),
      },
      201
    );
  }

  /**
   * No content response
   */
  static noContent(c: Context) {
    return c.body(null, 204);
  }

  /**
   * Too many requests response
   */
  static tooManyRequests(c: Context, retryAfter?: number) {
    const headers: Record<string, string> = {};
    if (retryAfter) {
      headers["Retry-After"] = retryAfter.toString();
    }

    return c.json(
      {
        success: false,
        error: "Too many requests",
        timestamp: new Date().toISOString(),
      },
      429,
      headers
    );
  }
}
