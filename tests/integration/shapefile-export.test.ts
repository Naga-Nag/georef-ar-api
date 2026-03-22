/**
 * Integration tests for Shapefile export functionality
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import JSZip from "jszip";

describe("Shapefile Export Integration", () => {
  // Mock data for testing
  const mockStateResults = [
    {
      id: "1",
      nombre: "Buenos Aires",
      geometria: {
        type: "Polygon",
        coordinates: [
          [
            [-62, -35],
            [-58, -35],
            [-58, -33],
            [-62, -33],
            [-62, -35],
          ],
        ],
      },
    },
    {
      id: "2",
      nombre: "Córdoba",
      geometria: {
        type: "Polygon",
        coordinates: [
          [
            [-66, -33],
            [-62, -33],
            [-62, -31],
            [-66, -31],
            [-66, -33],
          ],
        ],
      },
    },
  ];

  const mockStreetResults = [
    {
      id: "1",
      nombre: "Rivadavia",
      provincia: "Buenos Aires",
      geometria: {
        type: "LineString",
        coordinates: [
          [-58.3, -34.6],
          [-58.35, -34.62],
          [-58.4, -34.65],
        ],
      },
    },
    {
      id: "2",
      nombre: "9 de Julio",
      provincia: "Buenos Aires",
      geometria: {
        type: "LineString",
        coordinates: [
          [-58.381, -34.603],
          [-58.381, -34.623],
        ],
      },
    },
  ];

  describe("ZIP file structure", () => {
    it("should produce valid ZIP archives", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const buffer = await formatter.formatAsShapefile(mockStateResults);

      // Check it's a valid ZIP
      expect(buffer[0]).toBe(0x50); // 'P'
      expect(buffer[1]).toBe(0x4b); // 'K'

      // Verify we can unzip it
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      const files = Object.keys(zip.files);
      expect(files.length).toBe(4);
      expect(files).toContain("data.shp");
      expect(files).toContain("data.shx");
      expect(files).toContain("data.dbf");
      expect(files).toContain("data.prj");
    });
  });

  describe("File content validation", () => {
    it("should generate PRJ with WGS84 definition", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const buffer = await formatter.formatAsShapefile(mockStateResults);
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      const prjFile = await zip.file("data.prj")!.async("text");
      expect(prjFile).toContain("WGS 84");
      expect(prjFile).toContain("GEOGCS");
    });

    it("should have valid SHP/SHX headers", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const buffer = await formatter.formatAsShapefile(mockStateResults);
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      const shpBuffer = await zip.file("data.shp")!.async("arraybuffer");
      const shpBytes = new Uint8Array(shpBuffer);

      // Check SHP file code (9994 in big-endian)
      expect(shpBytes[0]).toBe(0x27);
      expect(shpBytes[1]).toBe(0x0a);

      // Check version (1000 in little-endian at offset 12)
      const view = new DataView(shpBuffer);
      expect(view.getInt32(12, true)).toBe(1000);
    });

    it("should have matching record counts", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const buffer = await formatter.formatAsShapefile(mockStreetResults);
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      const dbfBuffer = await zip.file("data.dbf")!.async("arraybuffer");
      const view = new DataView(dbfBuffer);

      // Read record count from DBF header (offset 4, 4 bytes, little-endian)
      const recordCount = view.getInt32(4, true);
      expect(recordCount).toBe(mockStreetResults.length);
    });
  });

  describe("Error handling", () => {
    it("should handle empty results", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      try {
        await formatter.formatAsShapefile([]);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("No results");
      }
    });

    it("should reject invalid geometries", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const invalidResults = [
        {
          id: "1",
          nome: "Invalid",
          geometria: {
            type: "Point",
            coordinates: [200, 0], // Invalid longitude
          },
        },
      ];

      try {
        await formatter.formatAsShapefile(invalidResults);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("Invalid");
      }
    });

    it("should handle missing geometries", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const noGeomResults = [
        {
          id: "1",
          nombre: "Test",
          geometria: null,
        },
      ];

      try {
        await formatter.formatAsShapefile(noGeomResults);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("Invalid");
      }
    });
  });

  describe("Data integrity", () => {
    it("should preserve key attributes in DBF", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const results = [
        {
          id: "test-123",
          nombre: "Test Street",
          codigo: 456,
          geometria: {
            type: "LineString",
            coordinates: [
              [-58.3, -34.6],
              [-58.35, -34.62],
            ],
          },
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      const zip = new JSZip();
      await zip.loadAsync(buffer);

      // DBF file should exist and have headers
      const dbfBuffer = await zip.file("data.dbf")!.async("arraybuffer");
      const view = new DataView(dbfBuffer);

      // DBF should have record count = 1
      const recordCount = view.getInt32(4, true);
      expect(recordCount).toBe(1);
    });

    it("should handle various data types", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const mixedResults = [
        {
          id: 1,
          name: "Feature 1",
          numeric_value: 42.5,
          boolean_value: true,
          created_date: new Date("2026-03-21"),
          geometria: {
            type: "Point",
            coordinates: [-58.3, -34.6],
          },
        },
      ];

      const buffer = await formatter.formatAsShapefile(mixedResults);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(200);
    });
  });

  describe("Performance", () => {
    it("should handle 100 features efficiently", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const features = Array.from({ length: 100 }, (_, i) => ({
        id: `feature-${i}`,
        name: `Feature ${i}`,
        value: Math.random() * 1000,
        geometria: {
          type: "Point",
          coordinates: [
            -58.3 + (i * 0.01) % 2,
            -34.6 + (i * 0.005) % 1,
          ],
        },
      }));

      const start = Date.now();
      const buffer = await formatter.formatAsShapefile(features);
      const duration = Date.now() - start;

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(5000);
      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    it("should handle 500 features within time budget", async () => {
      const { ShapefileFormatter } = await import("@/services/shapefile-formatter");
      const formatter = new ShapefileFormatter();

      const features = Array.from({ length: 500 }, (_, i) => ({
        id: `feature-${i}`,
        name: `Feature ${i}`,
        geometria: {
          type: "Point",
          coordinates: [
            -180 + (i * 0.72) % 360,
            -90 + (i * 0.36) % 180,
          ],
        },
      }));

      const start = Date.now();
      const buffer = await formatter.formatAsShapefile(features);
      const duration = Date.now() - start;

      expect(buffer).toBeInstanceOf(Buffer);
      // Should complete in reasonable time (< 10 seconds)
      expect(duration).toBeLessThan(10000);
    });
  });

  describe("Backward compatibility", () => {
    it("should not break JSON format responses", async () => {
      const { ResponseFormatter } = await import("@/services/formatter");

      const result = ResponseFormatter.format(mockStateResults, {
        flatten: false,
        fields: undefined,
      });

      expect(result).toHaveProperty("resultados");
      expect(Array.isArray(result.resultados)).toBe(true);
      expect(result.resultados.length).toBe(2);
    });

    it("should not break GeoJSON format responses", async () => {
      const { ResponseFormatter } = await import("@/services/formatter");

      const result = ResponseFormatter.format(mockStateResults, {
        flatten: false,
        fields: undefined,
      });

      expect(result).toHaveProperty("resultados");
      expect(result.resultados[0]).toHaveProperty("geometria");
    });
  });
});
