/**
 * Error handling middleware for Elysia
 */

export interface ApiError {
  error: string;
  status: number;
  code?: string;
  details?: Record<string, any>;
}

export class ApiErrorHandler {
  static createError(
    message: string,
    status: number = 500,
    code?: string,
    details?: Record<string, any>
  ): ApiError {
    return {
      error: message,
      status,
      ...(code && { code }),
      ...(details && { details }),
    };
  }

  static notFound(message: string = "Resource not found"): ApiError {
    return this.createError(message, 404, "NOT_FOUND");
  }

  static badRequest(message: string, details?: Record<string, any>): ApiError {
    return this.createError(message, 400, "BAD_REQUEST", details);
  }

  static unauthorized(message: string = "Unauthorized"): ApiError {
    return this.createError(message, 401, "UNAUTHORIZED");
  }

  static forbidden(message: string = "Forbidden"): ApiError {
    return this.createError(message, 403, "FORBIDDEN");
  }

  static conflict(message: string, details?: Record<string, any>): ApiError {
    return this.createError(message, 409, "CONFLICT", details);
  }

  static internalError(
    message: string = "Internal server error",
    details?: Record<string, any>
  ): ApiError {
    return this.createError(message, 500, "INTERNAL_ERROR", details);
  }

  static serviceUnavailable(
    message: string = "Service unavailable"
  ): ApiError {
    return this.createError(message, 503, "SERVICE_UNAVAILABLE");
  }
}

/**
 * Global error handler function to be used in Elysia
 */
export function handleError(error: any): ApiError {
  // Log the error (omit stack in production to avoid leaking internals in log aggregators)
  console.error("[ERROR]", {
    message: error.message,
    code: error.code,
    timestamp: new Date().toISOString(),
  });

  // Handle known error types
  if (error.code === "NOT_FOUND") {
    return ApiErrorHandler.notFound();
  }

  if (error.code === "VALIDATION_ERROR") {
    return ApiErrorHandler.badRequest(error.message, { issues: error.issues });
  }

  if (error.code === "PARSE_ERROR") {
    return ApiErrorHandler.badRequest("Invalid request format");
  }

  // Default to internal server error
  return ApiErrorHandler.internalError(
    process.env.NODE_ENV === "development" ? error.message : "Internal server error"
  );
}
