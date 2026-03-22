/**
 * Tests for shapefile utility functions
 */

import { describe, it, expect } from "bun:test";
import {
  truncateFieldName,
  valueToDBFString,
  geomToShapeRecord,
  getShapeType,
  generateWGS84PRJ,
  isValidGeometry,
  generateFilename,
  calculateBounds,
} from "@/utils/shapefile";
import { ShapeType, ShapefileError } from "@/models/shapefile";
import type { Point, LineString, Polygon, MultiPoint, MultiLineString, MultiPolygon } from "geojson";

describe("shapefile utils", () => {
  describe("truncateFieldName", () => {
    it("should keep short names unchanged", () => {
      expect(truncateFieldName("nombre")).toBe("nombre");
      expect(truncateFieldName("id")).toBe("id");
    });

    it("should truncate long names to 10 chars", () => {
      expect(truncateFieldName("provincia_id")).toBe("provincia_");
      expect(truncateFieldName("municipality_name")).toBe("municipali");
    });

    it("should append index suffix for collision handling", () => {
      expect(truncateFieldName("provincia_id", 1)).toBe("provincia1");
      expect(truncateFieldName("provincia_id", 2)).toBe("provincia2");
    });
  });

  describe("valueToDBFString", () => {
    it("should handle numeric values", () => {
      const result = valueToDBFString(123, "N", 10);
      expect(result.trim()).toBe("123");
      expect(result.length).toBe(10);
    });

    it("should handle logical values", () => {
      expect(valueToDBFString(true, "L", 1)).toBe("T");
      expect(valueToDBFString(false, "L", 1)).toBe("F");
    });

    it("should handle character values", () => {
      const result = valueToDBFString("test", "C", 10);
      expect(result).toBe("test      ");
    });

    it("should handle date values", () => {
      const date = new Date("2026-03-21");
      const result = valueToDBFString(date, "D", 8);
      expect(result).toBe("20260321");
    });

    it("should handle null/undefined", () => {
      const result = valueToDBFString(null, "C", 5);
      expect(result).toBe("     ");
    });

    it("should truncate long strings", () => {
      const result = valueToDBFString("this is a very long string", "C", 5);
      expect(result.length).toBe(5);
      expect(result).toBe("this ");
    });
  });

  describe("geomToShapeRecord", () => {
    it("should convert Point geometry", () => {
      const point: Point = { type: "Point", coordinates: [10.5, 20.5] };
      const record = geomToShapeRecord(point);
      expect(record.shapeType).toBe(ShapeType.POINT);
      expect(record.coordinates).toEqual([10.5, 20.5]);
    });

    it("should convert LineString geometry", () => {
      const line: LineString = {
        type: "LineString",
        coordinates: [
          [0, 0],
          [10, 10],
          [20, 20],
        ],
      };
      const record = geomToShapeRecord(line);
      expect(record.shapeType).toBe(ShapeType.POLYLINE);
      expect(record.coordinates).toEqual([0, 0, 10, 10, 20, 20]);
      expect(record.parts).toEqual([0]);
    });

    it("should convert Polygon geometry", () => {
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      };
      const record = geomToShapeRecord(polygon);
      expect(record.shapeType).toBe(ShapeType.POLYGON);
      expect(record.coordinates.length).toBe(10); // 5 points * 2 coords
      expect(record.parts).toEqual([0]);
    });

    it("should convert MultiPoint geometry", () => {
      const multi: MultiPoint = {
        type: "MultiPoint",
        coordinates: [
          [0, 0],
          [10, 10],
        ],
      };
      const record = geomToShapeRecord(multi);
      expect(record.shapeType).toBe(ShapeType.MULTIPOINT);
      expect(record.coordinates).toEqual([0, 0, 10, 10]);
    });

    it("should convert MultiLineString geometry to POLYLINE", () => {
      const multi: MultiLineString = {
        type: "MultiLineString",
        coordinates: [
          [[0, 0], [5, 5]],
          [[10, 10], [20, 20]],
        ],
      };
      const record = geomToShapeRecord(multi);
      expect(record.shapeType).toBe(ShapeType.POLYLINE);
      expect(record.coordinates).toEqual([0, 0, 5, 5, 10, 10, 20, 20]);
      expect(record.parts).toEqual([0, 2]); // second part starts at point index 2
    });

    it("should convert MultiPolygon geometry to POLYGON", () => {
      const multi: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
          [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
        ],
      };
      const record = geomToShapeRecord(multi);
      expect(record.shapeType).toBe(ShapeType.POLYGON);
      expect(record.parts).toEqual([0, 5]); // second ring starts at point index 5
      expect(record.coordinates.length).toBe(20); // 10 points * 2 coords
    });

    it("should throw on invalid geometry", () => {
      expect(() => {
        geomToShapeRecord(null as any);
      }).toThrow();

      expect(() => {
        geomToShapeRecord({ type: "InvalidType" } as any);
      }).toThrow();
    });
  });

  describe("getShapeType", () => {
    it("should map GeoJSON types to shape types", () => {
      expect(getShapeType("Point")).toBe(ShapeType.POINT);
      expect(getShapeType("LineString")).toBe(ShapeType.POLYLINE);
      expect(getShapeType("MultiLineString")).toBe(ShapeType.POLYLINE);
      expect(getShapeType("Polygon")).toBe(ShapeType.POLYGON);
      expect(getShapeType("MultiPolygon")).toBe(ShapeType.POLYGON);
      expect(getShapeType("MultiPoint")).toBe(ShapeType.MULTIPOINT);
    });

    it("should throw on unsupported type", () => {
      expect(() => getShapeType("GeometryCollection")).toThrow();
    });
  });

  describe("generateWGS84PRJ", () => {
    it("should return valid WKT string", () => {
      const prj = generateWGS84PRJ();
      expect(typeof prj).toBe("string");
      expect(prj).toContain("WGS 84");
      expect(prj).toContain("GEOGCS");
    });
  });

  describe("isValidGeometry", () => {
    it("should validate valid point", () => {
      const point: Point = { type: "Point", coordinates: [0, 0] };
      expect(isValidGeometry(point)).toBe(true);

      const point2: Point = { type: "Point", coordinates: [-180, -90] };
      expect(isValidGeometry(point2)).toBe(true);
    });

    it("should reject invalid coordinates", () => {
      const invalidLon: Point = { type: "Point", coordinates: [200, 0] };
      expect(isValidGeometry(invalidLon)).toBe(false);

      const invalidLat: Point = { type: "Point", coordinates: [0, 100] };
      expect(isValidGeometry(invalidLat)).toBe(false);

      const nanCoord: Point = { type: "Point", coordinates: [NaN, 0] };
      expect(isValidGeometry(nanCoord)).toBe(false);
    });

    it("should reject null or missing type", () => {
      expect(isValidGeometry(null)).toBe(false);
      expect(isValidGeometry(undefined)).toBe(false);
      expect(isValidGeometry({})).toBe(false);
    });
  });

  describe("generateFilename", () => {
    it("should generate timestamp-based filename", () => {
      const filename = generateFilename("calles");
      expect(filename).toMatch(/^calles_\d{8}_\d{6}\.zip$/);
      expect(filename).toContain(".zip");
    });

    it("should have correct format", () => {
      const filename = generateFilename("provincias");
      const parts = filename.split("_");
      expect(parts[0]).toBe("provincias");
      expect(parts[2]).toMatch(/\.zip$/);
    });
  });

  describe("calculateBounds", () => {
    it("should calculate bounds from coordinates", () => {
      const coords = [0, 0, 10, 10, 5, 5];
      const bounds = calculateBounds(coords);
      expect(bounds.xmin).toBe(0);
      expect(bounds.ymin).toBe(0);
      expect(bounds.xmax).toBe(10);
      expect(bounds.ymax).toBe(10);
    });

    it("should handle single point", () => {
      const coords = [5, 5];
      const bounds = calculateBounds(coords);
      expect(bounds.xmin).toBe(5);
      expect(bounds.ymin).toBe(5);
      expect(bounds.xmax).toBe(5);
      expect(bounds.ymax).toBe(5);
    });

    it("should handle negative coordinates", () => {
      const coords = [-10, -10, 10, 10];
      const bounds = calculateBounds(coords);
      expect(bounds.xmin).toBe(-10);
      expect(bounds.ymin).toBe(-10);
      expect(bounds.xmax).toBe(10);
      expect(bounds.ymax).toBe(10);
    });

    it("should handle empty coordinates", () => {
      const coords: number[] = [];
      const bounds = calculateBounds(coords);
      expect(bounds).toEqual({ xmin: 0, ymin: 0, xmax: 0, ymax: 0 });
    });
  });
});
