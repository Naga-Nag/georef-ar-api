/**
 * Main entry point for Georef AR API
 * Elysia.js web server with Meilisearch integration
 */

import Elysia from "elysia";
import { config } from "@/config";
import { searchBackend } from "@/services/meilisearch";
import { ResponseFormatter } from "@/services/formatter";
import { createLoggingMiddleware } from "@/api/middleware/logging";
import { CorsHandler } from "@/api/middleware/cors";
import {
  statesRoutes,
  departmentsRoutes,
  municipalitiesRoutes,
  localitiesRoutes,
  streetsRoutes,
  addressesRoutes,
  intersectionsRoutes,
  settlementsRoutes,
  locationRoutes,
} from "@/api/routes";

/**
 * Create and configure the Elysia server
 */
export function createServer() {
  const app = new Elysia({
    name: "georef-ar-api",
  });

  // ============================================
  // Middleware Setup
  // ============================================

  // Logging middleware
  const loggingMiddleware = createLoggingMiddleware(
    config.env === "development"
  );

  app.onBeforeHandle(loggingMiddleware.onRequest);
  app.onResponse(loggingMiddleware.onAfterResponse);

  // CORS middleware
  const corsHandler = new CorsHandler({
    origin: config.corsOrigin || (config.env === "development" ? "*" : undefined),
  });

  app.onBeforeHandle(({ request, set }) => {
    const origin = request.headers.get("origin") || undefined;
    const corsHeaders = corsHandler.getHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
      set.headers[key] = value;
    }
    if (request.method === "OPTIONS") {
      set.status = 204;
      return "";
    }
  });

  // ============================================
  // Error Handling
  // ============================================

  app.onError(({ code, error, path, request }) => {
    const statusCode =
      code === "NOT_FOUND"
        ? 404
        : code === "PARSE"
          ? 400
          : code === "VALIDATION"
            ? 422
            : 500;

    console.error(`✗ ${request.method} ${path} | ${error.message}`, {
      código: code,
      estado: statusCode,
    });

    // Return error response
    if (statusCode === 404) {
      return ResponseFormatter.create404Error();
    }

    if (statusCode === 400 || statusCode === 422) {
      return ResponseFormatter.create400Error(error.message);
    }

    return ResponseFormatter.create500Error(
      config.env === "development" ? error.message : undefined
    );
  });

  // ============================================
  // Health Check Endpoint
  // ============================================

  app.get("/health", async () => {
    try {
      const meiliHealth = await searchBackend.isHealthy();
      const uptime = process.uptime();

      return {
        status: meiliHealth ? "healthy" : "degraded",
        service: "georef-ar-api",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        meilisearch: {
          status: meiliHealth ? "available" : "unavailable",
        },
        environment: config.env,
      };
    } catch (error) {
      console.error(`✗ Verificación de salud: ${String(error)}`);
      return {
        status: "unhealthy",
        service: "georef-ar-api",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        meilisearch: {
          status: "unavailable",
        },
        error: "Health check failed",
      };
    }
  });

  // ============================================
  // API Version Endpoint
  // ============================================

  app.get("/", () => {
    return {
      name: "Georef AR API",
      version: "2.0.0",
      description: "Argentine geographic referencing API",
      status: "running",
      endpoints: {
        health: "/health",
        documentation: "/docs",
        api: "/api",
      },
      timestamp: new Date().toISOString(),
    };
  });

  // Create API prefix group
  const apiV1 = new Elysia({ prefix: "/api" });

  // Register all routes by directly using them in apiV1
  apiV1.use(statesRoutes);
  apiV1.use(departmentsRoutes);
  apiV1.use(municipalitiesRoutes);
  apiV1.use(localitiesRoutes);
  apiV1.use(streetsRoutes);
  apiV1.use(addressesRoutes);
  apiV1.use(intersectionsRoutes);
  apiV1.use(settlementsRoutes);
  apiV1.use(locationRoutes);

  // Mount API v1 into main app
  app.use(apiV1);

  // ============================================
  // Not Found Handler (must be last)
  // ============================================

  app.all("*", () => {
    return ResponseFormatter.create404Error();
  });

  return app;
}

/**
 * Start the server with graceful shutdown
 */
async function startServer() {
  const app = createServer();
  let isShuttingDown = false;

  const server = app.listen(
    { port: config.port, hostname: config.host },
    ({ hostname, port }) => {
      const baseUrl = `http://${hostname}:${port}`;
      console.log("");
      console.log("✓ Georef AR API v2.0.0 iniciado correctamente");
      console.log(`  Ejecutándose en: ${baseUrl}`);
      console.log(`  Meilisearch: ${config.meilisearch.host}`);
      console.log(`  Entorno: ${config.env}`);
      console.log("");
    }
  );

  /**
   * Graceful shutdown handler
   */
  async function gracefulShutdown(signal: string) {
    if (isShuttingDown) {
      console.warn(`✗ ${signal} recibido nuevamente, forzando salida...`);
      process.exit(1);
    }

    isShuttingDown = true;
    console.log(`⊘ Apagando servidor (${signal})...`);

    try {
      // Close the server
      if (server && typeof server.stop === "function") {
        await server.stop();
      }

      console.log("✓ Servidor detenido correctamente");
      console.log("✓ Gracias por usar Georef AR API");
      console.log("");

      process.exit(0);
    } catch (error) {
      console.error(`✗ Error al apagar: ${String(error)}`);
      process.exit(1);
    }
  }

  // Handle shutdown signals
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    console.error(`✗ Excepción no capturada: ${String(error)}`);
    gracefulShutdown("uncaughtException");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (reason) => {
    console.error(`✗ Promesa rechazada: ${String(reason)}`);
    // Don't exit on unhandled rejection, just log it
  });

  return server;
}

// Start server if this is the main module
if (import.meta.main) {
  startServer().catch((error) => {
    console.error(`✗ Error al iniciar el servidor: ${String(error)}`);
    process.exit(1);
  });
}

export default createServer;
