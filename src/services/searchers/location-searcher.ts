/**
 * LocationSearcher - Search by geographic point (latitude/longitude)
 */

import { BaseSearcher, sanitizeFilterValue } from "./base-searcher";
import type { SearchOptions } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface LocationResult {
  provincia: {
    id: string;
    nombre: string;
    source: string;
  };
  departamento: {
    id: string | null;
    nombre: string | null;
    source: string | null;
  };
  municipio: {
    id: string | null;
    nombre: string | null;
    source: string | null;
  };
  lat: number;
  lon: number;
}

export interface LocationSearchOptions extends SearchOptions {
  lat: number;
  lon: number;
}

export class LocationSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "departamentos");
  }

  /**
   * Search for location by coordinates
   * Returns the administrative division containing the point
   */
  async searchByCoordinates(
    lat: number,
    lon: number
  ): Promise<LocationResult> {
    if (!this.index) {
      await this.init();
    }

    const emptyEntity = {
      id: null,
      nombre: null,
      source: null,
    };

    try {
      // Search in departments/municipalities indexes for point
      const deptResult = await this.index!.search("", {
        filter: [`geometry CONTAINS POINT(${lon}, ${lat})`],
        limit: 1,
      });

      if (deptResult.hits.length === 0) {
        // Point is outside Argentina
        return {
          provincia: { ...emptyEntity, id: "", nombre: "" } as any,
          departamento: emptyEntity,
          municipio: emptyEntity,
          lat,
          lon,
        };
      }

      const dept = deptResult.hits[0] as any;

      // Run state and municipality lookups in parallel
      const [state, muniHit] = await Promise.all([
        this.getStateById(dept.provincia),
        this.findMunicipality(lon, lat, dept.id),
      ]);

      const municipality = muniHit
        ? { id: muniHit.id, nombre: muniHit.nombre, source: muniHit.source || "INDEC" }
        : emptyEntity;

      return {
        provincia: {
          id: state?.id || "",
          nombre: state?.nombre || "",
          source: state?.source || "INDEC",
        },
        departamento: {
          id: dept.id,
          nombre: dept.nombre,
          source: dept.source || "INDEC",
        },
        municipio: municipality,
        lat,
        lon,
      };
    } catch (error) {
      // On error, return point outside Argentina
      return {
        provincia: { ...emptyEntity, id: "", nombre: "" } as any,
        departamento: emptyEntity,
        municipio: emptyEntity,
        lat,
        lon,
      };
    }
  }

  /**
   * Helper to get state by ID
   */
  private async getStateById(stateId: string): Promise<any | null> {
    try {
      const statesIndex = await this.backend.getIndex("provincias");
      const safeStateId = sanitizeFilterValue(stateId);
      const result = await statesIndex.search("", {
        filter: [`id = "${safeStateId}"`],
        limit: 1,
      });
      return result.hits[0] || null;
    } catch {
      return null;
    }
  }

  private async findMunicipality(lon: number, lat: number, deptId: string): Promise<any | null> {
    try {
      const muniIndex = await this.backend.getIndex("municipios");
      const safeDeptId = sanitizeFilterValue(deptId);
      const result = await muniIndex.search("", {
        filter: [
          `geometry CONTAINS POINT(${lon}, ${lat})`,
          `departamento = "${safeDeptId}"`,
        ],
        limit: 1,
      });
      return result.hits[0] || null;
    } catch {
      return null;
    }
  }
}
