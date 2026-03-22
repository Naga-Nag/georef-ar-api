/**
 * Query schemas using Zod validation
 */

import { z } from "zod";

export const BaseQuerySchema = z.object({
  order: z.enum(["asc", "desc"]).default("asc"),
  limit: z.coerce.number().int().positive().max(10000).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  flatten: z.coerce.boolean().default(false),
});

/**
 * State (Provincia) query schema
 */
export const StateQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombres: z.string().optional(),
  nombre: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
  campos: z.string().optional(),
  exacto: z.coerce.boolean().default(false),
});

export type StateQuery = z.infer<typeof StateQuerySchema>;

/**
 * Department (Departamento) query schema
 */
export const DepartmentQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombre: z.string().optional(),
  provincia: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
  campos: z.string().optional(),
});

export type DepartmentQuery = z.infer<typeof DepartmentQuerySchema>;

/**
 * Municipality (Municipio) query schema
 */
export const MunicipalityQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombre: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
});

export type MunicipalityQuery = z.infer<typeof MunicipalityQuerySchema>;

/**
 * Locality (Localidad) query schema
 */
export const LocalityQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombre: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  municipio: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
});

export type LocalityQuery = z.infer<typeof LocalityQuerySchema>;

/**
 * Street (Calle) query schema
 */
export const StreetQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombre: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
});

export type StreetQuery = z.infer<typeof StreetQuerySchema>;

/**
 * Settlement (Asentamiento) query schema
 */
export const SettlementQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  nombre: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
});

export type SettlementQuery = z.infer<typeof SettlementQuerySchema>;

/**
 * Intersection (Intersección) query schema
 */
export const IntersectionQuerySchema = BaseQuerySchema.extend({
  id: z.string().optional(),
  calle1: z.string().optional(),
  calle2: z.string().optional(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  formato: z.enum(["json", "geojson", "shp"]).default("json"),
});

export type IntersectionQuery = z.infer<typeof IntersectionQuerySchema>;

/**
 * Location (Ubicación) query schema
 * Note: This endpoint does NOT support Shapefile format
 */
export const LocationQuerySchema = BaseQuerySchema.extend({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
  formato: z.enum(["json", "geojson"]).default("json"),
});

export type LocationQuery = z.infer<typeof LocationQuerySchema>;

/**
 * Address query schema
 */
export const AddressQuerySchema = BaseQuerySchema.extend({
  calle: z.string(),
  altura: z.coerce.number().int().positive(),
  provincia: z.string().optional(),
  departamento: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  formato: z.enum(["json", "geojson"]).default("json"),
  tipo: z.enum(["simple", "entre_calles", "interseccion"]).optional(),
});

export type AddressQuery = z.infer<typeof AddressQuerySchema>;
