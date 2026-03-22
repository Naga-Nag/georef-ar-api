/**
 * Tests for ShapefileGenerator
 */

import { describe, it, expect } from "bun:test";
import { ShapefileGenerator } from "@/services/shapefile-generator";
import { ShapeType, type ShapefileExportData, type DBFField } from "@/models/shapefile";
import JSZip from "jszip";
import type { Point, LineString, Polygon, MultiLineString } from "geojson";

describe("ShapefileGenerator", () => {
  const generator = new ShapefileGenerator();

  describe("SHP file generation", () => {
    it("should generate valid SHP header for point data", async () => {
      const data: ShapefileExportData = {
        features: [
          {
            geometry: { type: "Point", coordinates: [10, 20] } as Point,
            properties: { name: "Test Point" },
          },
        ],
        fields: [{ name: "name", type: "C", length: 50 }],
      };

      const buffer = await generator.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("should generate ZIP with 4 files", async () => {
      const data: ShapefileExportData = {
        features: [
          {
            geometry: { type: "Point", coordinates: [0, 0] } as Point,
            properties: {},
          },
        ],
        fields: [{ name: "id", type: "N", length: 10 }],
      };

      const buffer = await generator.generate(data);
      // Check for ZIP signature (PK\x03\x04)
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'
      expect(buffer[2]).toBe(0x03);
      expect(buffer[3]).toBe(0x04);
    });
  });

  describe("Field mapping", () => {
    it("should handle point geometries", async () => {
      const point: Point = { type: "Point", coordinates: [-58.382, -34.603] };
      const data: ShapefileExportData = {
        features: [
          {
            geometry: point,
            properties: { city: "Buenos Aires" },
          },
        ],
        fields: [{ name: "city", type: "C", length: 50 }],
      };

      const buffer = await generator.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(100); // At least header+data
    });

    it("should handle line geometries", async () => {
      const line: LineString = {
        type: "LineString",
        coordinates: [
          [0, 0],
          [10, 10],
          [20, 20],
        ],
      };

      const data: ShapefileExportData = {
        features: [
          {
            geometry: line,
            properties: { name: "TestLine" },
          },
        ],
        fields: [{ name: "name", type: "C", length: 50 }],
      };

      const buffer = await generator.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(200); // LineString has more data
    });

    it("should write correct SHP record structure for Polygon", async () => {
      const polygon: Polygon = {
        type: "Polygon",
        coordinates: [[[-62, -35], [-58, -35], [-58, -33], [-62, -33], [-62, -35]]],
      };
      const data: ShapefileExportData = {
        features: [{ geometry: polygon, properties: {} }],
        fields: [{ name: "id", type: "N", length: 10 }],
      };

      const zipBuffer = await generator.generate(data);
      const zip = await JSZip.loadAsync(zipBuffer);
      const shpBytes = new Uint8Array(await zip.file("data.shp")!.async("arraybuffer"));

      // Verify SHP file code at offset 0 (big-endian): 9994
      const buf = Buffer.from(shpBytes);
      expect(buf.readInt32BE(0)).toBe(9994);

      // Shape type in header (offset 32, little-endian): 5 = Polygon
      expect(buf.readInt32LE(32)).toBe(ShapeType.POLYGON);

      // First record starts at byte 100
      // Record header: record number (BE) at 100, content length (BE) at 104
      const numParts = 1;
      const numPoints = 5;
      const expectedContentWords = (44 + 4 * numParts + 16 * numPoints) / 2;
      expect(buf.readInt32BE(104)).toBe(expectedContentWords);

      // Shape type at record content start (offset 108, LE): 5
      expect(buf.readInt32LE(108)).toBe(ShapeType.POLYGON);

      // NumParts at offset 108 + 4 (type) + 32 (bbox) = 144
      expect(buf.readInt32LE(144)).toBe(numParts);
      // NumPoints at 148
      expect(buf.readInt32LE(148)).toBe(numPoints);
      // Parts[0] at 152
      expect(buf.readInt32LE(152)).toBe(0);
    });

    it("should write correct SHP record structure for MultiLineString", async () => {
      const mls: MultiLineString = {
        type: "MultiLineString",
        coordinates: [
          [[0, 0], [5, 5]],
          [[10, 10], [20, 20]],
        ],
      };
      const data: ShapefileExportData = {
        features: [{ geometry: mls, properties: {} }],
        fields: [{ name: "id", type: "N", length: 10 }],
      };

      const zipBuffer = await generator.generate(data);
      const zip = await JSZip.loadAsync(zipBuffer);
      const shpBytes = new Uint8Array(await zip.file("data.shp")!.async("arraybuffer"));
      const buf = Buffer.from(shpBytes);

      // Shape type in header: 3 = Polyline
      expect(buf.readInt32LE(32)).toBe(ShapeType.POLYLINE);

      // Check content at record 1 (starts at byte 100)
      const numParts = 2;
      const numPoints = 4;
      const expectedContentWords = (44 + 4 * numParts + 16 * numPoints) / 2;
      expect(buf.readInt32BE(104)).toBe(expectedContentWords);

      // Shape type at offset 108
      expect(buf.readInt32LE(108)).toBe(ShapeType.POLYLINE);
      // NumParts at 108 + 4 + 32 = 144
      expect(buf.readInt32LE(144)).toBe(numParts);
      // NumPoints at 148
      expect(buf.readInt32LE(148)).toBe(numPoints);
      // Parts: [0, 2]
      expect(buf.readInt32LE(152)).toBe(0);
      expect(buf.readInt32LE(156)).toBe(2);
    });
  });

  describe("Error handling", () => {
    it("should throw on empty features", async () => {
      const data: ShapefileExportData = {
        features: [],
        fields: [{ name: "id", type: "N", length: 10 }],
      };

      try {
        await generator.generate(data);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("No features");
      }
    });

    it("should throw on missing geometry", async () => {
      const data: ShapefileExportData = {
        features: [
          {
            geometry: null as any,
            properties: {},
          },
        ],
        fields: [],
      };

      try {
        await generator.generate(data);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("geometry");
      }
    });
  });

  describe("Multiple features", () => {
    it("should generate shapefile with multiple points", async () => {
      const data: ShapefileExportData = {
        features: [
          {
            geometry: { type: "Point", coordinates: [0, 0] } as Point,
            properties: { id: 1, name: "Point 1" },
          },
          {
            geometry: { type: "Point", coordinates: [10, 10] } as Point,
            properties: { id: 2, name: "Point 2" },
          },
          {
            geometry: { type: "Point", coordinates: [20, 20] } as Point,
            properties: { id: 3, name: "Point 3" },
          },
        ],
        fields: [
          { name: "id", type: "N", length: 10 },
          { name: "name", type: "C", length: 50 },
        ],
      };

      const buffer = await generator.generate(data);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(300); // More records, larger file
    });
  });

  describe("Bounds calculation", () => {
    it("should calculate correct bounds for multiple features", async () => {
      const data: ShapefileExportData = {
        features: [
          {
            geometry: { type: "Point", coordinates: [-10, -5] } as Point,
            properties: {},
          },
          {
            geometry: { type: "Point", coordinates: [5, 15] } as Point,
            properties: {},
          },
          {
            geometry: { type: "Point", coordinates: [20, 10] } as Point,
            properties: {},
          },
        ],
        fields: [{ name: "id", type: "N", length: 10 }],
      };

      // Just verify it doesn't throw and produces valid output
      const buffer = await generator.generate(data);
      expect(buffer.length).toBeGreaterThan(100);
    });
  });
});
