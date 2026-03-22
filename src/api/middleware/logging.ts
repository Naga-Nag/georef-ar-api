/**
 * Request and response logging middleware
 * Logs in Spanish (Argentina) with clean, minimal output
 */

export interface LogEntry {
  timestamp: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  error?: string;
}

export class RequestLogger {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  /**
   * Format log entry for console output (Spanish Argentina)
   */
  private formatLog(entry: LogEntry): string {
    const { method, path, status, duration, error } = entry;
    const statusStr = status ? `${status}` : "???";
    const durationStr = duration !== undefined ? `${duration.toFixed(0)}ms` : "?ms";

    if (error) {
      return `${method} ${path} → ${statusStr} (${durationStr}) | Error: ${error}`;
    }

    return `${method} ${path} → ${statusStr} (${durationStr})`;
  }

  /**
   * Log incoming request (only in development mode)
   */
  logRequest(method: string, path: string): void {
    if (this.verbose) {
      console.log(`→ ${method} ${path}`);
    }
  }

  /**
   * Log response
   */
  logResponse(entry: LogEntry): void {
    const formatted = this.formatLog(entry);

    if (entry.status && entry.status >= 400) {
      console.error(`✗ ${formatted}`);
    } else {
      console.log(`✓ ${formatted}`);
    }
  }

  /**
   * Create a structured log entry
   */
  createEntry(
    method: string,
    path: string,
    status?: number,
    duration?: number,
    error?: string
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      method,
      path,
      status,
      duration,
      error,
    };
  }
}

/**
 * Create logging middleware for Elysia
 * Tracks request time and logs details
 */
export function createLoggingMiddleware(verbose: boolean = false) {
  const logger = new RequestLogger(verbose);
  const requestTimes = new WeakMap<Request, number>();

  return {
    onRequest({ request }: { request: Request }) {
      requestTimes.set(request, Date.now());
      if (verbose) {
        const url = new URL(request.url);
        logger.logRequest(request.method, url.pathname);
      }
    },

    onAfterResponse(ctx: any) {
      const startTime = requestTimes.get(ctx.request) || Date.now();
      const duration = Date.now() - startTime;
      const url = new URL(ctx.request.url);

      const entry = logger.createEntry(
        ctx.request.method,
        url.pathname,
        ctx.response?.status,
        duration
      );

      logger.logResponse(entry);
    },
  };
}

/**
 * Simple performance monitoring
 */
export class PerformanceMonitor {
  private metrics: Map<string, { count: number; totalTime: number }> = new Map();

  recordMetric(endpoint: string, duration: number): void {
    const current = this.metrics.get(endpoint) || { count: 0, totalTime: 0 };
    current.count += 1;
    current.totalTime += duration;
    this.metrics.set(endpoint, current);
  }

  getMetrics(endpoint?: string): Record<string, any> {
    if (endpoint) {
      const metric = this.metrics.get(endpoint);
      if (!metric) return {};

      return {
        endpoint,
        count: metric.count,
        totalTime: metric.totalTime.toFixed(2),
        averageTime: (metric.totalTime / metric.count).toFixed(2),
      };
    }

    const result: Record<string, any> = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = {
        count: value.count,
        totalTime: value.totalTime.toFixed(2),
        averageTime: (value.totalTime / value.count).toFixed(2),
      };
    }

    return result;
  }

  reset(): void {
    this.metrics.clear();
  }
}
