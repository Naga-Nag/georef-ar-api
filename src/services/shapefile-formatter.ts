/**
 * Shapefile formatter - Integration with existing response pipeline
 */

import { ShapefileGenerator } from "./shapefile-generator";
import { ShapefileError, type DBFField, type ShapefileExportData } from "../models/shapefile";
import { truncateFieldName, isValidGeometry } from "../utils/shapefile";

export class ShapefileFormatter {
  private generator: ShapefileGenerator;

  constructor() {
    this.generator = new ShapefileGenerator();
  }

  /**
   * Format results as Shapefile ZIP archive
   * Gracefully skips records with invalid geometries instead of failing
   */
  async formatAsShapefile(results: any[]): Promise<Buffer> {
    if (!results || results.length === 0) {
      throw new ShapefileError("No results to export");
    }

    // Filter out records with invalid geometries gracefully
    const validResults = this.filterValidGeometries(results);

    if (validResults.length === 0) {
      throw new ShapefileError(
        `No valid geometries found in any of the ${results.length} records`
      );
    }

    // Log skipped records for debugging
    const skippedCount = results.length - validResults.length;
    if (skippedCount > 0) {
      console.log(
        `[SHAPEFILE] Skipped ${skippedCount}/${results.length} records with invalid geometries`
      );
    }

    // Extract and prepare data
    const features = this.extractFeatures(validResults);
    const fields = this.extractFields(validResults);

    // Generate Shapefile
    const data: ShapefileExportData = {
      features,
      fields,
    };

    return this.generator.generate(data);
  }

  /**
   * Filter results to only include records with valid geometries
   */
  private filterValidGeometries(results: any[]): any[] {
    const validResults: any[] = [];
    const skippedReasons: Map<string, number> = new Map();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const geom = result.geometry || result.geometria;

      if (!geom) {
        skippedReasons.set("missing_geometry", (skippedReasons.get("missing_geometry") || 0) + 1);
        continue;
      }

      if (!isValidGeometry(geom)) {
        skippedReasons.set("invalid_geometry", (skippedReasons.get("invalid_geometry") || 0) + 1);
        continue;
      }

      validResults.push(result);
    }

    // Log detailed skip reasons
    if (skippedReasons.size > 0) {
      const reasons = Array.from(skippedReasons.entries())
        .map(([reason, count]) => `${reason}: ${count}`)
        .join(", ");
      console.log(`[SHAPEFILE] Filtered records - ${reasons}`);
    }

    return validResults;
  }

  /**
   * Extract features from results, handling both 'geometry' and 'geometria' property names
   */
  private extractFeatures(
    results: any[]
  ): Array<{ geometry: any; properties: Record<string, any> }> {
    return results.map((result) => {
      // Handle both 'geometry' and 'geometria' property names
      const geom = result.geometry || result.geometria;
      
      return {
        geometry: geom,
        properties: {
          ...result,
          // Remove geometry fields from properties to avoid duplication
          geometry: undefined,
          geometria: undefined,
        },
      };
    });
  }

  /**
   * Extract DBF field definitions from results
   */
  private extractFields(results: any[]): DBFField[] {
    if (results.length === 0) {
      return [];
    }

    const firstResult = results[0];
    const fieldMap = new Map<string, DBFField>();
    const usedNames = new Set<string>();

    for (const [key, value] of Object.entries(firstResult)) {
      if (key === "geometry" || key === "geometria") continue;

      const fieldType = this.inferFieldType(value);
      const fieldLength = this.inferFieldLength(value, fieldType);
      let fieldName = truncateFieldName(key);

      // Handle name collisions
      let index = 1;
      while (usedNames.has(fieldName) && index < 10) {
        fieldName = truncateFieldName(key, index);
        index++;
      }

      if (!usedNames.has(fieldName)) {
        usedNames.add(fieldName);
        fieldMap.set(fieldName, {
          name: fieldName,
          sourceKey: fieldName !== key ? key : undefined,
          type: fieldType,
          length: fieldLength,
          decimalCount: fieldType === "N" ? 2 : undefined,
        });
      }
    }

    return Array.from(fieldMap.values());
  }

  /**
   * Infer DBF field type from value
   */
  private inferFieldType(value: any): string {
    if (value === null || value === undefined) {
      return "C"; // Character (default)
    }

    if (typeof value === "boolean") {
      return "L"; // Logical
    }

    if (typeof value === "number") {
      return "N"; // Numeric
    }

    if (value instanceof Date) {
      return "D"; // Date
    }

    return "C"; // Character (string or other)
  }

  /**
   * Infer DBF field length from value
   */
  private inferFieldLength(value: any, fieldType: string): number {
    switch (fieldType) {
      case "L": // Logical
        return 1;
      case "D": // Date (YYYYMMDD)
        return 8;
      case "N": // Numeric
        return Math.min(20, Math.max(10, String(value).length + 2));
      case "C": // Character
      default:
        return Math.min(254, Math.max(10, String(value).length + 5));
    }
  }
}
