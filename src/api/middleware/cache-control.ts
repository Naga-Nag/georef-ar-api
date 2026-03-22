/**
 * Cache control middleware for Elysia
 */

export interface CacheControlOptions {
  maxAge?: number; // in seconds
  public?: boolean;
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
  sMaxAge?: number;
  immutable?: boolean;
}

export class CacheControl {
  /**
   * Generate Cache-Control header value
   */
  static generate(options: CacheControlOptions = {}): string {
    const directives: string[] = [];

    if (options.noStore) {
      directives.push("no-store");
      directives.push("must-revalidate");
    } else if (options.noCache) {
      directives.push("no-cache");
      directives.push("must-revalidate");
    } else {
      // Default to public caching with max-age
      if (options.private) {
        directives.push("private");
      } else {
        directives.push("public");
      }

      if (options.maxAge !== undefined) {
        directives.push(`max-age=${options.maxAge}`);
      } else {
        directives.push("max-age=3600"); // Default 1 hour
      }

      if (options.sMaxAge !== undefined) {
        directives.push(`s-maxage=${options.sMaxAge}`);
      }

      if (options.mustRevalidate) {
        directives.push("must-revalidate");
      }

      if (options.immutable) {
        directives.push("immutable");
      }
    }

    return directives.join(", ");
  }

  /**
   * Preset: No caching (for dynamic content)
   */
  static noCache(): string {
    return this.generate({ noCache: true });
  }

  /**
   * Preset: No storage (most restrictive)
   */
  static noStore(): string {
    return this.generate({ noStore: true });
  }

  /**
   * Preset: Short-lived cache (5 minutes)
   */
  static shortTerm(): string {
    return this.generate({ maxAge: 300 });
  }

  /**
   * Preset: Medium-term cache (1 hour)
   */
  static mediumTerm(): string {
    return this.generate({ maxAge: 3600 });
  }

  /**
   * Preset: Long-term cache (24 hours)
   */
  static longTerm(): string {
    return this.generate({ maxAge: 86400 });
  }

  /**
   * Preset: Immutable content (1 year)
   */
  static immutable(): string {
    return this.generate({ maxAge: 31536000, immutable: true });
  }
}

/**
 * Middleware to set cache control headers
 * Usage: app.onBeforeHandle(setCacheControl("/path", { maxAge: 600 }))
 */
export function getCacheControlMiddleware(
  pathPattern: string,
  options: CacheControlOptions = {}
) {
  return ({ request }: { request: Request }) => {
    if (request.url.includes(pathPattern)) {
      // Headers will be set in the route handler or response interceptor
      return { cacheControl: CacheControl.generate(options) };
    }
    return undefined;
  };
}
