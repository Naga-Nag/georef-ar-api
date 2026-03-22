/**
 * Result and response types
 */

import { z } from "zod";

export interface QueryResult<T> {
  cantidad: number;
  inicio: number;
  resultados: T[];
  parametros: Record<string, any>;
}

export interface ErrorResponse {
  error: string | Record<string, any>;
  status: number;
  code?: string;
}

export interface HealthResponse {
  status: "healthy" | "unhealthy";
  meilisearch: {
    status: "available" | "unavailable";
    host: string;
  };
  timestamp: string;
}

/**
 * Generic entity type for geographic features
 */
export const GeorefEntitySchema = z.object({
  id: z.string(),
  nombre: z.string().optional(),
  provincia: z.any().optional(),
  departamento: z.any().optional(),
  municipio: z.any().optional(),
  localidad: z.any().optional(),
  geometry: z.any().optional(),
});

export type GeorefEntity = z.infer<typeof GeorefEntitySchema>;
