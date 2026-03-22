/**
 * Shapefile format type definitions and constants
 */

export const ShapeType = {
  NULL: 0,
  POINT: 1,
  POLYLINE: 3,
  POLYGON: 5,
  MULTIPOINT: 8,
  POINTZ: 11,
  POLYLINEZ: 13,
  POLYGONZ: 15,
  MULTIPOINTZ: 18,
  POINTM: 21,
  POLYLINEM: 23,
  POLYGONM: 25,
  MULTIPOINTM: 28,
} as const;

export type ShapeTypeValue = (typeof ShapeType)[keyof typeof ShapeType];

export interface ShapefileRecord {
  recordNumber: number;
  shapeType: number;
  coordinates: number[];
  parts?: number[];
  geometry?: any;
}

export interface DBFField {
  name: string; // Max 10 chars (DBF column name)
  sourceKey?: string; // Original property key if different from name (used when name is truncated)
  type: string; // C, N, L, D, M, etc.
  length: number;
  decimalCount?: number;
}

export interface ShapefileOptions {
  projectName?: string;
  spatialReference?: string;
  encoding?: string;
}

export interface ShapefileBounds {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  zmin?: number;
  zmax?: number;
  mmin?: number;
  mmax?: number;
}

export interface ShapefileExportData {
  features: Array<{
    geometry: any;
    properties: Record<string, any>;
  }>;
  shapeType?: number;
  fields?: DBFField[];
}

export class ShapefileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapefileError";
  }
}
