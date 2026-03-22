/**
 * Route registration and aggregation
 * Central place to manage all API routes
 */

import Elysia from "elysia";
import { searchBackend } from "@/services/meilisearch";
import { ResponseFormatter } from "@/services/formatter";
import { ShapefileFormatter } from "@/services/shapefile-formatter";
import { generateFilename } from "@/utils/shapefile";
import {
  StateSearcher,
  DepartmentSearcher,
  MunicipalitySearcher,
  LocalitySearcher,
  StreetSearcher,
  SettlementSearcher,
  IntersectionSearcher,
  AddressSearcher,
  LocationSearcher,
  MAX_LIMIT,
} from "@/services/searchers";

function clampLimit(raw: number): number {
  const value = Number.isFinite(raw) ? raw : 100;
  return Math.max(1, Math.min(value, MAX_LIMIT));
}

function clampOffset(raw: number): number {
  const value = Number.isFinite(raw) ? raw : 0;
  return Math.max(0, value);
}

/**
 * Parse the comma-separated `campos` query parameter into a field list.
 * Returns undefined when the parameter is absent or empty so that the
 * formatter falls back to its default (geometry-excluded) behaviour.
 */
function parseCampos(campos: unknown): string[] | undefined {
  if (!campos || typeof campos !== "string") return undefined;
  const fields = campos.split(",").map((s) => s.trim()).filter(Boolean);
  return fields.length > 0 ? fields : undefined;
}

/**
 * Handle Shapefile format response
 * Returns a Response object with ZIP buffer and appropriate headers, or null if not shapefile format
 */
async function handleShapefileFormat(
  formato: unknown,
  results: any[],
  endpoint: string
): Promise<Response | null> {
  if (formato !== "shp") {
    return null;
  }

  try {
    if (!results || results.length === 0) {
      return new Response(JSON.stringify({ error: "No results to export" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const formatter = new ShapefileFormatter();
    const zipBuffer = await formatter.formatAsShapefile(results);
    const filename = generateFilename(endpoint);

    return new Response(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[SHAPEFILE] Error generating shapefile:", error);
    return new Response(JSON.stringify({ error: "Failed to generate shapefile" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}


export interface RouteRegistry {
  name: string;
  path: string;
  router: any; // Elysia with any prefix
}

export class RoutesManager {
  private routes: RouteRegistry[] = [];

  /**
   * Register a route group
   */
  register(name: string, path: string, router: Elysia): void {
    this.routes.push({ name, path, router });
  }

  /**
   * Apply all registered routes to the main app
   */
  applyTo(app: Elysia): Elysia {
    for (const route of this.routes) {
      console.info(`[ROUTES] Registered ${route.name} at ${route.path}`);
      app.use(route.router);
    }
    return app;
  }

  /**
   * Get all registered routes
   */
  getAll(): RouteRegistry[] {
    return [...this.routes];
  }

  /**
   * Clear registered routes
   */
  clear(): void {
    this.routes = [];
  }
}

/**
 * States (Provincias) routes
 */
export const statesRoutes = new Elysia({
  prefix: "/provincias",
})
  .get("/", async ({ query, set }) => {
    try {
      const searcher = new StateSearcher(searchBackend);
      const q = (query.nombres || query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const exact = query.exacto === "true";
      const formato = (query.formato || "json") as string;

      let result;
      if (q) {
        if (exact) {
          const byName = await searcher.getByName(q, true);
          result = {
            hits: byName.slice(offset, offset + limit),
            total: byName.length,
            offset,
            limit,
          };
        } else {
          result = await searcher.search(q, { limit, offset });
        }
      } else {
        result = await searcher.getAll(limit, offset);
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "provincias");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        flatten: query.aplanar === "true",
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[STATES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new StateSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[STATES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Departments (Departamentos) routes
 */
export const departmentsRoutes = new Elysia({
  prefix: "/departamentos",
})
  .get("/", async ({ query }) => {
    try {
      const searcher = new DepartmentSearcher(searchBackend);
      const q = (query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const provincia = (query.provincia || "") as string;
      const formato = (query.formato || "json") as string;

      let result;
      if (provincia) {
        result = await searcher.searchByProvince(provincia, { limit, offset });
      } else {
        result = await searcher.search(q, { limit, offset });
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "departamentos");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[DEPARTMENTS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new DepartmentSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[DEPARTMENTS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Municipalities (Municipios) routes
 */
export const municipalitiesRoutes = new Elysia({
  prefix: "/municipios",
})
  .get("/", async ({ query }) => {
    try {
      const searcher = new MunicipalitySearcher(searchBackend);
      const q = (query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const provincia = (query.provincia || "") as string;
      const departamento = (query.departamento || "") as string;
      const formato = (query.formato || "json") as string;

      let result;
      if (provincia) {
        result = await searcher.searchByProvince(provincia, { limit, offset });
      } else if (departamento) {
        result = await searcher.searchByDepartment(departamento, { limit, offset });
      } else {
        result = await searcher.search(q, { limit, offset });
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "municipios");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[MUNICIPALITIES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new MunicipalitySearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[MUNICIPALITIES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Localities (Localidades) routes
 */
export const localitiesRoutes = new Elysia({
  prefix: "/localidades",
})
  .get("/", async ({ query }) => {
    try {
      const searcher = new LocalitySearcher(searchBackend);
      const q = (query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const provincia = (query.provincia || "") as string;
      const municipio = (query.municipio || "") as string;
      const formato = (query.formato || "json") as string;

      let result;
      if (provincia) {
        result = await searcher.searchByProvince(provincia, { limit, offset });
      } else if (municipio) {
        result = await searcher.searchByMunicipality(municipio, { limit, offset });
      } else {
        result = await searcher.search(q, { limit, offset });
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "localidades");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[LOCALITIES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new LocalitySearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[LOCALITIES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Streets (Calles) routes
 */
export const streetsRoutes = new Elysia({
  prefix: "/calles",
})
  .get("/", async ({ query }) => {
    try {
      const searcher = new StreetSearcher(searchBackend);
      const q = (query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const provincia = (query.provincia || "") as string;
      const municipio = (query.municipio || "") as string;
      const localidad = (query.localidad || "") as string;
      const formato = (query.formato || "json") as string;

      let result;
      if (provincia) {
        result = await searcher.searchByProvince(provincia, { limit, offset });
      } else if (municipio) {
        result = await searcher.searchByMunicipality(municipio, { limit, offset });
      } else if (localidad) {
        result = await searcher.searchByLocality(localidad, { limit, offset });
      } else {
        result = await searcher.search(q, { limit, offset });
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "calles");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[STREETS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new StreetSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[STREETS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Settlements (Asentamientos) routes
 */
export const settlementsRoutes = new Elysia({
  prefix: "/asentamientos",
})
  .get("/", async ({ query }) => {
    try {
      const searcher = new SettlementSearcher(searchBackend);
      const q = (query.nombre || "") as string;
      const limit = clampLimit(parseInt(query.limit as string));
      const offset = clampOffset(parseInt(query.offset as string));
      const provincia = (query.provincia || "") as string;
      const formato = (query.formato || "json") as string;

      let result;
      if (provincia) {
        result = await searcher.searchByProvince(provincia, { limit, offset });
      } else {
        result = await searcher.search(q, { limit, offset });
      }

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result.hits, "asentamientos");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
        fields: parseCampos(query.campos),
      });
    } catch (error) {
      console.error("[SETTLEMENTS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params, query }) => {
    try {
      const searcher = new SettlementSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result, { fields: parseCampos(query.campos) });
    } catch (error) {
      console.error("[SETTLEMENTS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Intersections (Intersecciones) routes
 */
export const intersectionsRoutes = new Elysia({
  prefix: "/intersecciones",
})
  .post("/", async ({ body: rawBody, query }) => {
    try {
      const searcher = new IntersectionSearcher(searchBackend);
      const body = rawBody as Record<string, any>;

      // Handle both POST body and query parameters
      const streetData = body || query;
      const calle1 = (streetData.calle1 || streetData.calle) as string;
      const calle2 = (streetData.calle2 || streetData?.calle2) as string;
      const limit = clampLimit(parseInt((streetData.limit || 100) as string));
      const offset = clampOffset(parseInt((streetData.offset || 0) as string));
      const formato = (streetData.formato || "json") as string;

      if (!calle1 || !calle2) {
        return ResponseFormatter.create400Error("Se requieren dos calles");
      }

      const result = await searcher.searchByStreets(calle1, calle2, {
        limit,
        offset,
      });

      // Handle Shapefile format
      const shapefileResponse = await handleShapefileFormat(formato, result, "intersecciones");
      if (shapefileResponse) {
        return shapefileResponse;
      }

      return ResponseFormatter.format(result, {
        limit,
        offset,
      });
    } catch (error) {
      console.error("[INTERSECTIONS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params }) => {
    try {
      const searcher = new IntersectionSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result);
    } catch (error) {
      console.error("[INTERSECTIONS] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Addresses (Direcciones) routes
 */
export const addressesRoutes = new Elysia({
  prefix: "/direcciones",
})
  .post("/", async ({ body: rawBody, query }) => {
    try {
      const searcher = new AddressSearcher(searchBackend);
      const body = rawBody as Record<string, any>;

      // Handle both POST body and query parameters
      const addressData = body || query;
      const calle = (addressData.calle || addressData.street) as string;
      const altura = parseInt((addressData.altura || addressData.number) as string);
      const provincia = (addressData.provincia || "") as string;
      const limit = clampLimit(parseInt((addressData.limit || 100) as string));
      const offset = clampOffset(parseInt((addressData.offset || 0) as string));

      if (!calle || isNaN(altura)) {
        return ResponseFormatter.create400Error("Se requieren calle y altura");
      }

      let result;
      if (provincia) {
        result = await searcher.searchByAddressAndProvince(
          calle,
          altura,
          provincia,
          { limit, offset }
        );
      } else {
        result = await searcher.searchByAddress(calle, altura, { limit, offset });
      }

      return ResponseFormatter.format(result.hits, {
        limit: result.limit,
        offset: result.offset,
      });
    } catch (error) {
      console.error("[ADDRESSES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  })
  .get("/:id", async ({ params }) => {
    try {
      const searcher = new AddressSearcher(searchBackend);
      const result = await searcher.getById(params.id);
      if (!result) {
        return ResponseFormatter.create404Error();
      }
      return ResponseFormatter.formatSingle(result);
    } catch (error) {
      console.error("[ADDRESSES] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });

/**
 * Location (Ubicacion) routes - search by coordinates
 */
export const locationRoutes = new Elysia({
  prefix: "/ubicacion",
})
  .get("/", async ({ query }) => {
    try {
      const lat = parseFloat(query.lat as string);
      const lon = parseFloat(query.lon as string);

      if (isNaN(lat) || isNaN(lon)) {
        return ResponseFormatter.create400Error("Se requieren lat y lon");
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return ResponseFormatter.create400Error(
          "Coordenadas fuera de rango: lat [-90, 90], lon [-180, 180]"
        );
      }

      const searcher = new LocationSearcher(searchBackend);
      const result = await searcher.searchByCoordinates(lat, lon);

      return {
        resultado: result,
      };
    } catch (error) {
      console.error("[LOCATION] Error:", error);
      return ResponseFormatter.create500Error();
    }
  });
