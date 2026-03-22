/**
 * Shapefile utility functions and helpers
 */

import { ShapeType, type ShapeTypeValue, ShapefileError } from "../models/shapefile";
import type { Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon, Geometry } from "geojson";

/**
 * Truncate field name to DBF limit (10 chars) while preserving uniqueness
 */
export function truncateFieldName(fieldName: string, index: number = 0): string {
  const maxLength = 10;
  if (fieldName.length <= maxLength) {
    return fieldName;
  }

  // Truncate and append index if needed for collision handling
  if (index > 0) {
    const suffix = index.toString();
    return fieldName.substring(0, maxLength - suffix.length) + suffix;
  }

  return fieldName.substring(0, maxLength);
}

/**
 * Convert field value to DBF-compatible string representation
 */
export function valueToDBFString(
  value: any,
  fieldType: string,
  fieldLength: number
): string {
  if (value === null || value === undefined) {
    return " ".repeat(fieldLength);
  }

  let strValue = String(value);

  switch (fieldType) {
    case "N": // Numeric
      strValue = typeof value === "number" ? value.toString() : "0";
      break;
    case "L": // Logical (boolean)
      strValue = value ? "T" : "F";
      break;
    case "D": // Date (YYYYMMDD)
      if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, "0");
        const day = String(value.getDate()).padStart(2, "0");
        strValue = `${year}${month}${day}`;
      }
      break;
    case "C": // Character (string)
    default:
      strValue = String(value);
  }

  // Pad or truncate to field length
  if (strValue.length < fieldLength) {
    strValue = strValue.padEnd(fieldLength, " ");
  } else if (strValue.length > fieldLength) {
    strValue = strValue.substring(0, fieldLength);
  }

  return strValue;
}

/**
 * Convert GeoJSON geometry to Shapefile coordinates
 */
export function geomToShapeRecord(geom: Geometry): {
  shapeType: number;
  coordinates: number[];
  parts?: number[];
} {
  if (!geom) {
    throw new ShapefileError("Invalid geometry: null or undefined");
  }

  const { type } = geom as any;

  switch (type) {
    case "Point": {
      const point = geom as Point;
      return {
        shapeType: ShapeType.POINT,
        coordinates: [...point.coordinates],
      };
    }

    case "LineString": {
      const line = geom as LineString;
      const coords: number[] = [];
      for (const coord of line.coordinates) {
        coords.push(...coord);
      }
      return {
        shapeType: ShapeType.POLYLINE,
        coordinates: coords,
        parts: [0],
      };
    }

    case "Polygon": {
      const poly = geom as Polygon;
      const coords: number[] = [];
      const parts: number[] = [];

      for (const ring of poly.coordinates) {
        parts.push(coords.length / 2);
        for (const coord of ring) {
          coords.push(...coord);
        }
      }

      return {
        shapeType: ShapeType.POLYGON,
        coordinates: coords,
        parts,
      };
    }

    case "MultiPoint": {
      const multi = geom as MultiPoint;
      const coords: number[] = [];
      for (const coord of multi.coordinates) {
        coords.push(...coord);
      }
      return {
        shapeType: ShapeType.MULTIPOINT,
        coordinates: coords,
      };
    }

    case "MultiLineString": {
      const multi = geom as MultiLineString;
      const coords: number[] = [];
      const parts: number[] = [];
      for (const line of multi.coordinates) {
        parts.push(coords.length / 2);
        for (const coord of line) {
          coords.push(...coord);
        }
      }
      return {
        shapeType: ShapeType.POLYLINE,
        coordinates: coords,
        parts,
      };
    }

    case "MultiPolygon": {
      const multi = geom as MultiPolygon;
      const coords: number[] = [];
      const parts: number[] = [];
      for (const polygon of multi.coordinates) {
        for (const ring of polygon) {
          parts.push(coords.length / 2);
          for (const coord of ring) {
            coords.push(...coord);
          }
        }
      }
      return {
        shapeType: ShapeType.POLYGON,
        coordinates: coords,
        parts,
      };
    }

    default:
      throw new ShapefileError(`Unsupported geometry type: ${type}`);
  }
}

/**
 * Get ESRI Shapefile shape type from GeoJSON type
 */
export function getShapeType(geomType: string): ShapeTypeValue {
  switch (geomType) {
    case "Point":
      return ShapeType.POINT;
    case "LineString":
    case "MultiLineString":
      return ShapeType.POLYLINE;
    case "Polygon":
    case "MultiPolygon":
      return ShapeType.POLYGON;
    case "MultiPoint":
      return ShapeType.MULTIPOINT;
    default:
      throw new ShapefileError(`Unsupported geometry type: ${geomType}`);
  }
}

/**
 * Generate WGS84 (EPSG:4326) PRJ file content
 */
export function generateWGS84PRJ(): string {
  return 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
}

/**
 * Validate geometry structure and bounds
 */
export function isValidGeometry(geom: any): boolean {
  if (!geom || !geom.type) {
    return false;
  }

  try {
    const record = geomToShapeRecord(geom);
    // Check coordinate bounds (WGS84)
    for (let i = 0; i < record.coordinates.length; i += 2) {
      const lon = record.coordinates[i];
      const lat = record.coordinates[i + 1];
      if (!isFinite(lon) || !isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate timestamp-based filename
 */
export function generateFilename(endpoint: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${endpoint}_${year}${month}${day}_${hours}${minutes}${seconds}.zip`;
}

/**
 * Calculate bounding box from coordinates
 */
export function calculateBounds(coordinates: number[]): {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
} {
  if (coordinates.length < 2) {
    return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  }

  let xmin = coordinates[0];
  let ymin = coordinates[1];
  let xmax = coordinates[0];
  let ymax = coordinates[1];

  for (let i = 2; i < coordinates.length; i += 2) {
    xmin = Math.min(xmin, coordinates[i]);
    ymin = Math.min(ymin, coordinates[i + 1]);
    xmax = Math.max(xmax, coordinates[i]);
    ymax = Math.max(ymax, coordinates[i + 1]);
  }

  return { xmin, ymin, xmax, ymax };
}
