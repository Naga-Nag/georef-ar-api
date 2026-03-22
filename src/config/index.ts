/**
 * Configuration management for Georef AR API (Bun)
 * Supports both development and Docker deployment environments
 *
 * Environment Variables:
 * - PORT: Server port (default: 5000)
 * - HOST: Server host (default: 0.0.0.0)
 * - NODE_ENV: Environment (development|production|test, default: production)
 * - MEILISEARCH_HOST: Meilisearch server URL (default: http://localhost:7700)
 * - MEILISEARCH_API_KEY: Meilisearch API key
 * - MEILI_MASTER_KEY: Alternative for MEILISEARCH_API_KEY (Docker compat)
 * - DATA_VERSION: Version of indexed data (default: 1.0.0)
 * - LOG_LEVEL: Logging level (debug|info|warn|error, default: info)
 * - CORS_ORIGIN: CORS origin policy (default: * in development, restricted in production)
 * - DISABLE_CACHE: Disable HTTP cache control (default: false)
 * - API_REQUEST_TIMEOUT: HTTP request timeout in ms (default: 30000)
 * - ENABLE_METRICS: Enable metrics collection (default: false)
 */

import { z } from "zod";

const configSchema = z.object({
  port: z.coerce.number().min(1).max(65535).default(5000),
  host: z.string().default("0.0.0.0"),
  env: z.enum(["development", "production", "test"]).default("production"),
  meilisearch: z.object({
    host: z.string().url().default("http://localhost:7700"),
    apiKey: z.string().optional(),
  }),
  dataVersion: z.string().default("1.0.0"),
  completeDownloadUrls: z.record(z.any()).optional(),
  logging: z.object({
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
  }),
  corsOrigin: z.string().optional(),
  cacheControl: z.boolean().default(true),
  requestTimeout: z.coerce.number().default(30000),
  enableMetrics: z.boolean().default(false),
});

export type ConfigType = z.infer<typeof configSchema>;

/**
 * Resolve configuration from environment variables
 * Priority: explicit env var > docker env var > default
 */
const rawConfig = {
  port: process.env.PORT || process.env.APP_PORT || "5000",
  host: process.env.HOST || process.env.API_HOST || "0.0.0.0",
  env: process.env.NODE_ENV || process.env.ENVIRONMENT || "production",
  meilisearch: {
    host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
    // Support both MEILISEARCH_API_KEY and MEILI_MASTER_KEY (Docker compat)
    apiKey:
      process.env.MEILISEARCH_API_KEY ||
      process.env.MEILI_MASTER_KEY ||
      undefined,
  },
  dataVersion: process.env.DATA_VERSION || "1.0.0",
  logging: {
    level: process.env.LOG_LEVEL || "info",
  },
  corsOrigin: process.env.CORS_ORIGIN,
  cacheControl: process.env.DISABLE_CACHE !== "true",
  requestTimeout:
    parseInt(process.env.API_REQUEST_TIMEOUT || "30000", 10) || 30000,
  enableMetrics: process.env.ENABLE_METRICS === "true",
};

export const config = configSchema.parse(rawConfig);

// Log configuration at startup (sanitized)
console.info(
  `[CONFIG] Environment: ${config.env} | ` +
    `Port: ${config.port} | ` +
    `Host: ${config.host}`
);
console.info(
  `[CONFIG] Meilisearch: ${config.meilisearch.host} | ` +
    `Log Level: ${config.logging.level}`
);
console.debug(
  `[CONFIG] Cache Control: ${config.cacheControl} | ` +
    `Request Timeout: ${config.requestTimeout}ms | ` +
    `Metrics Enabled: ${config.enableMetrics}`
);
