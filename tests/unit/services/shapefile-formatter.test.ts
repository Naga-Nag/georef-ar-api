/**
 * Tests for ShapefileFormatter
 */

import { describe, it, expect } from "bun:test";
import { ShapefileFormatter } from "@/services/shapefile-formatter";
import JSZip from "jszip";
import type { Point, LineString, MultiLineString } from "geojson";

describe("ShapefileFormatter", () => {
  const formatter = new ShapefileFormatter();

  describe("Feature extraction", () => {
    it("should format results as shapefile", async () => {
      const results = [
        {
          id: "1",
          name: "Test 1",
          geometry: { type: "Point", coordinates: [0, 0] } as Point,
        },
        {
          id: "2",
          name: "Test 2",
          geometry: { type: "Point", coordinates: [10, 10] } as Point,
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe("Geometry validation", () => {
    it("should reject results with invalid geometry", async () => {
      const results = [
        {
          id: "1",
          geometry: { type: "Point", coordinates: [200, 0] } as Point,
        },
      ];

      try {
        await formatter.formatAsShapefile(results);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("valid geometries");
      }
    });

    it("should reject results with missing geometry", async () => {
      const results = [
        {
          id: "1",
          geometry: null,
        },
      ];

      try {
        await formatter.formatAsShapefile(results);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("valid geometries");
      }
    });
  });

  describe("Field type inference", () => {
    it("should handle mixed data types", async () => {
      const results = [
        {
          id: 1,
          name: "Test",
          active: true,
          created: new Date("2026-03-21"),
          geometry: { type: "Point", coordinates: [0, 0] } as Point,
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(100);
    });

    it("should handle null values in mixed types", async () => {
      const results = [
        {
          id: 1,
          name: "Test",
          optional_field: null,
          geometry: { type: "Point", coordinates: [0, 0] } as Point,
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe("Error handling", () => {
    it("should throw on empty results", async () => {
      try {
        await formatter.formatAsShapefile([]);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("No results");
      }
    });

    it("should throw on null results", async () => {
      try {
        await formatter.formatAsShapefile(null as any);
        expect.unreachable();
      } catch (error: any) {
        expect(error.message).toContain("No results");
      }
    });
  });

  describe("Large datasets", () => {
    it("should handle 100 features", async () => {
      const results = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Feature ${i}`,
        value: Math.random() * 100,
        geometry: {
          type: "Point",
          coordinates: [Math.random() * 360 - 180, Math.random() * 180 - 90],
        } as Point,
      }));

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });

  describe("MultiLineString support (street geometry)", () => {
    it("should export MultiLineString geometry", async () => {
      const results = [
        {
          id: "1",
          nombre: "Calle Ejemplo",
          geometria: {
            type: "MultiLineString",
            coordinates: [
              [[-58.4, -34.6], [-58.3, -34.6]],
              [[-58.3, -34.6], [-58.2, -34.5]],
            ],
          } as MultiLineString,
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);

      const zip = await JSZip.loadAsync(buffer);
      expect(zip.file("data.shp")).not.toBeNull();
      expect(zip.file("data.dbf")).not.toBeNull();
    });
  });

  describe("DBF field name truncation with sourceKey", () => {
    it("should correctly export values for long field names", async () => {
      const results = [
        {
          id: "1",
          provincia_id: "06",
          geometry: { type: "Point", coordinates: [0, 0] } as Point,
        },
      ];

      const buffer = await formatter.formatAsShapefile(results);
      expect(buffer).toBeInstanceOf(Buffer);

      // Verify the ZIP is valid and contains files
      const zip = await JSZip.loadAsync(buffer);
      const dbfFile = zip.file("data.dbf");
      expect(dbfFile).not.toBeNull();

      // Read DBF content and check that provincia_id value "06" is present
      const dbfBytes = Buffer.from(await dbfFile!.async("arraybuffer"));
      // DBF data records start after header; value "06" should appear somewhere
      const dbfStr = dbfBytes.toString("latin1");
      expect(dbfStr).toContain("06");
    });
  });
});
