/**
 * CORS (Cross-Origin Resource Sharing) middleware for Elysia
 */

export interface CorsOptions {
  origin?: string | string[] | RegExp | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
}

const DEFAULT_OPTIONS: CorsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["X-Total-Count", "X-Page", "X-Limit"],
  credentials: false,
  maxAge: 86400,
  optionsSuccessStatus: 200,
};

export class CorsHandler {
  private options: CorsOptions;

  constructor(options: CorsOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Check if origin is allowed
   */
  private isOriginAllowed(origin: string): boolean {
    const { origin: allowedOrigin } = this.options;

    if (allowedOrigin === "*") {
      return true;
    }

    if (typeof allowedOrigin === "string") {
      return origin === allowedOrigin;
    }

    if (Array.isArray(allowedOrigin)) {
      return allowedOrigin.includes(origin);
    }

    if (allowedOrigin instanceof RegExp) {
      return allowedOrigin.test(origin);
    }

    if (typeof allowedOrigin === "function") {
      return allowedOrigin(origin);
    }

    return false;
  }

  /**
   * Get CORS headers for response
   */
  getHeaders(origin?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": this.options.methods?.join(", ") || "*",
      "Access-Control-Allow-Headers":
        this.options.allowedHeaders?.join(", ") || "*",
      "Access-Control-Expose-Headers":
        this.options.exposedHeaders?.join(", ") || "",
      "Access-Control-Max-Age": String(this.options.maxAge || 86400),
    };

    if (origin && this.isOriginAllowed(origin)) {
      headers["Access-Control-Allow-Origin"] =
        this.options.origin === "*" ? "*" : origin;

      if (this.options.credentials) {
        headers["Access-Control-Allow-Credentials"] = "true";
      }
    }

    return headers;
  }

  /**
   * Handle OPTIONS preflight requests
   */
  handlePreflight(
    origin?: string
  ): { status: number; headers: Record<string, string> } {
    const headers = this.getHeaders(origin);

    if (!origin || !this.isOriginAllowed(origin)) {
      return {
        status: 403,
        headers: {},
      };
    }

    return {
      status: this.options.optionsSuccessStatus || 200,
      headers,
    };
  }
}

/**
 * Create Elysia CORS middleware
 */
export function createCorsMiddleware(options: CorsOptions = {}) {
  const corsHandler = new CorsHandler(options);

  return (ctx: any) => {
    const origin = ctx.request.headers.get("origin");

    // Handle preflight
    if (ctx.request.method === "OPTIONS") {
      const { status, headers } = corsHandler.handlePreflight(origin);

      if (status === 403) {
        return new Response(null, { status });
      }

      return new Response(null, {
        status,
        headers,
      });
    }

    // Add CORS headers to response
    const headers = corsHandler.getHeaders(origin);
    return { corsHeaders: headers };
  };
}
