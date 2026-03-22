/**
 * Geometry utilities using Turf.js (replaces Shapely)
 */

import {
  point,
  booleanPointInPolygon,
  distance,
  lineString,
  along,
  getCoord,
  Feature,
  Polygon,
} from "@turf/turf";
import type { Point as GeoJSONPoint, Position, GeoJSON } from "geojson";

export interface DoorNumbers {
  start: {
    left: number;
    right: number;
  };
  end: {
    left: number;
    right: number;
  };
}

export interface BlockLocationResult {
  lat: number;
  lon: number;
  interpolated: boolean;
}

export class GeometryHelper {
  /**
   * Create a GeoJSON point from latitude and longitude
   */
  static createPoint(lat: number, lon: number): Feature<GeoJSONPoint> {
    return point([lon, lat]);
  }

  /**
   * Get bounding box of coordinates
   */
  static getBoundingBox(
    coordinates: [number, number][]
  ): [number, number, number, number] {
    if (coordinates.length === 0) {
      return [0, 0, 0, 0];
    }

    let minLon = coordinates[0][0];
    let minLat = coordinates[0][1];
    let maxLon = coordinates[0][0];
    let maxLat = coordinates[0][1];

    for (const [lon, lat] of coordinates) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }

    return [minLon, minLat, maxLon, maxLat];
  }

  /**
   * Check if point is inside polygon
   */
  static pointInPolygon(point: Position, polygon: Feature<Polygon>): boolean {
    return booleanPointInPolygon(point, polygon);
  }

  /**
   * Calculate distance between two points (in kilometers)
   * Uses Haversine formula via Turf.js
   */
  static distance(
    point1: [number, number],
    point2: [number, number]
  ): number {
    // Turf.distance returns distance in the units of the feature (degrees by default)
    // Add {units: 'kilometers'} to get km
    const p1 = point(point1);
    const p2 = point(point2);
    return distance(p1, p2, { units: "kilometers" });
  }

  /**
   * Get the extent of a street block containing a given number
   * Replicates Python _street_block_extents logic
   */
  private static getStreetBlockExtents(
    doorNumbers: DoorNumbers,
    number: number
  ): [number, number] {
    const startR = doorNumbers.start.right;
    const startL = doorNumbers.start.left;
    const endR = doorNumbers.end.right;
    const endL = doorNumbers.end.left;

    if (startR <= number && number <= endR) {
      return [startR, endR];
    }

    if (startL <= number && number <= endL) {
      return [startL, endL];
    }

    throw new Error("Street number out of range");
  }

  /**
   * Calculate the geographic location of a street number on a block
   * Replicates Python street_block_number_location logic
   *
   * This performs interpolation along a street geometry to estimate
   * the location of a specific house number.
   */
  static blockNumberLocation(
    geometry: GeoJSON | any,
    doorNumbers: DoorNumbers,
    number?: number,
    approximate: boolean = false
  ): BlockLocationResult | null {
    try {
      // Geometry should be MultiLineString
      if (geometry.type !== "MultiLineString") {
        throw new Error("GeoJSON type must be MultiLineString");
      }

      // Convert to LineString by merging all line segments
      const line = this.mergeLineStrings(geometry.coordinates);

      if (line && number !== undefined) {
        const [start, end] = this.getStreetBlockExtents(doorNumbers, number);

        // Check if we have valid extent values
        if (start < end) {
          // Interpolate the position along the line
          // Calculate the fraction: (number - start) / (end - start)
          const fraction = (number - start) / (end - start);

          // Get the total length of the line
          const totalLength = this.getLineLength(line);

          // Calculate the distance along the line for our fraction
          const distanceAlongLine = fraction * totalLength;

          // Get the point at that distance
          const pt = along(lineString(line), distanceAlongLine, {
            units: "kilometers",
          });

          const coords = getCoord(pt);
          return {
            lat: coords[1],
            lon: coords[0],
            interpolated: true,
          };
        }
      }

      // If interpolation is not possible but approximation is allowed
      if (approximate) {
        // Return the center of the line
        const centroid = this.getLineCentroid(line);
        return centroid;
      }

      return null;
    } catch (error) {
      console.error(`✗ Error al calcular número de manzana: ${String(error)}`);
      return null;
    }
  }

  /**
   * Merge multiple line segments into a single continuous line
   * Equivalent to shapely.ops.linemerge
   */
  private static mergeLineStrings(
    coordinates: number[][][]
  ): number[][] {
    if (!coordinates || coordinates.length === 0) {
      return [];
    }

    // For now, return the first line if it's a single continuous line
    // In production, this would need proper line merging logic
    // that handles complex multi-line geometries
    if (coordinates.length === 1) {
      return coordinates[0];
    }

    // Simple case: concatenate all coordinates
    // This is a simplification - proper implementation would check connectivity
    const merged: number[][] = [];
    for (const lineCoords of coordinates) {
      merged.push(...lineCoords);
    }
    return merged;
  }

  /**
   * Calculate the total length of a line in kilometers
   */
  private static getLineLength(lineCoordinates: number[][]): number {
    let totalLength = 0;

    for (let i = 0; i < lineCoordinates.length - 1; i++) {
      const pt1 = point(lineCoordinates[i]);
      const pt2 = point(lineCoordinates[i + 1]);
      totalLength += distance(pt1, pt2, { units: "kilometers" });
    }

    return totalLength;
  }

  /**
   * Calculate the centroid (center point) of a line
   */
  private static getLineCentroid(
    lineCoordinates: number[][]
  ): BlockLocationResult {
    if (lineCoordinates.length === 0) {
      throw new Error("Empty line coordinates");
    }

    // Calculate simple center point (not true centroid, but good approximation)
    let sumLon = 0;
    let sumLat = 0;

    for (const [lon, lat] of lineCoordinates) {
      sumLon += lon;
      sumLat += lat;
    }

    return {
      lat: sumLat / lineCoordinates.length,
      lon: sumLon / lineCoordinates.length,
      interpolated: false,
    };
  }
}
