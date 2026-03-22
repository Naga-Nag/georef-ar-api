/**
 * Core Shapefile format implementation
 * Generates valid ESRI Shapefile format files (.shp, .shx, .dbf, .prj)
 */

import JSZip from "jszip";
import { ShapeType, ShapefileError, type ShapefileExportData, type DBFField, type ShapefileBounds } from "../models/shapefile";
import { generateWGS84PRJ, geomToShapeRecord, calculateBounds, valueToDBFString } from "../utils/shapefile";

export class ShapefileGenerator {
  private shapeType: number = 0;
  private bounds: ShapefileBounds = { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  private records: Array<{
    shapeType: number;
    coordinates: number[];
    parts?: number[];
    properties?: Record<string, any>;
  }> = [];

  /**
   * Generate complete Shapefile ZIP archive
   */
  async generate(data: ShapefileExportData): Promise<Buffer> {
    this.validateInput(data);
    this.processRecords(data);

    const shpBuffer = this.generateSHP();
    const shxBuffer = this.generateSHX();
    const dbfBuffer = this.generateDBF(data.fields || []);
    const prjBuffer = this.generatePRJ();

    return this.createZIP(shpBuffer, shxBuffer, dbfBuffer, prjBuffer);
  }

  private validateInput(data: ShapefileExportData): void {
    if (!data.features || data.features.length === 0) {
      throw new ShapefileError("No features provided for Shapefile generation");
    }

    for (const feature of data.features) {
      if (!feature.geometry) {
        throw new ShapefileError("Feature missing geometry");
      }
    }
  }

  private processRecords(data: ShapefileExportData): void {
    // Reset state for each generation
    this.records = [];
    this.shapeType = 0;
    this.bounds = { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };

    let hasGeometry = false;
    const allCoordinates: number[] = [];

    for (const feature of data.features) {
      try {
        const record = geomToShapeRecord(feature.geometry);

        if (!hasGeometry) {
          this.shapeType = record.shapeType;
          hasGeometry = true;
        }

        this.records.push({
          ...record,
          properties: feature.properties,
        });
        allCoordinates.push(...record.coordinates);
      } catch (error) {
        throw new ShapefileError(`Failed to process geometry: ${error}`);
      }
    }

    this.bounds = calculateBounds(allCoordinates);
  }

  private generatePRJ(): Buffer {
    const prjContent = generateWGS84PRJ();
    return Buffer.from(prjContent, "utf8");
  }

  /**
   * Generate SHP file (geometry records)
   */
  private generateSHP(): Buffer {
    let fileLength = 50; // Header length in 16-bit words
    for (const record of this.records) {
      fileLength += 4 + this.calculateContentLength(record); // 4 words = 8-byte record header
    }

    const buffer = Buffer.alloc(fileLength * 2);
    let offset = 0;

    // Write SHP header (100 bytes, per ESRI Shapefile spec)
    const header = Buffer.alloc(100); // zero-initialized
    header.writeInt32BE(9994, 0);          // File code [BE]
    // Bytes 4-23: Unused (already 0)
    header.writeInt32BE(fileLength, 24);   // File length in 16-bit words [BE]
    header.writeInt32LE(1000, 28);         // Version [LE]
    header.writeInt32LE(this.shapeType, 32); // Shape type [LE]

    // Bounding box (8 doubles starting at byte 36)
    header.writeDoubleLE(this.bounds.xmin, 36);
    header.writeDoubleLE(this.bounds.ymin, 44);
    header.writeDoubleLE(this.bounds.xmax, 52);
    header.writeDoubleLE(this.bounds.ymax, 60);
    // Zmin/Zmax/Mmin/Mmax (bytes 68-99, already 0)

    header.copy(buffer, offset);
    offset += 100;

    // Write records
    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i];
      const recordNumber = i + 1;

      // Record header (big-endian)
      buffer.writeInt32BE(recordNumber, offset); // Record number
      offset += 4;
      const contentLength = this.calculateContentLength(record);
      buffer.writeInt32BE(contentLength, offset); // Content length in 16-bit words
      offset += 4;

      // Shape content (little-endian)
      offset = this.writeShapeContent(buffer, offset, record);
    }

    return buffer;
  }

  /**
   * Calculate content length in 16-bit words for a shape record (excludes 8-byte record header)
   */
  private calculateContentLength(record: {
    shapeType: number;
    coordinates: number[];
    parts?: number[];
  }): number {
    const numPoints = record.coordinates.length / 2;
    const numParts = record.parts?.length || 0;
    switch (record.shapeType) {
      case ShapeType.POINT:
        // shape type (4) + X (8) + Y (8) = 20 bytes = 10 words
        return 10;
      case ShapeType.POLYLINE:
      case ShapeType.POLYGON:
        // shape type (4) + bbox (32) + numParts (4) + numPoints (4) + parts[] (4*numParts) + points (16*numPoints)
        return (44 + 4 * numParts + 16 * numPoints) / 2;
      case ShapeType.MULTIPOINT:
        // shape type (4) + bbox (32) + numPoints (4) + points (16*numPoints)
        return (40 + 16 * numPoints) / 2;
      default:
        return (4 + 16 * numPoints) / 2;
    }
  }

  /**
   * Write shape content into buffer at offset, returns new offset after writing
   */
  private writeShapeContent(
    buffer: Buffer,
    offset: number,
    record: { shapeType: number; coordinates: number[]; parts?: number[] }
  ): number {
    const numPoints = record.coordinates.length / 2;
    switch (record.shapeType) {
      case ShapeType.POINT: {
        buffer.writeInt32LE(record.shapeType, offset); offset += 4;
        buffer.writeDoubleLE(record.coordinates[0], offset); offset += 8;
        buffer.writeDoubleLE(record.coordinates[1], offset); offset += 8;
        break;
      }
      case ShapeType.POLYLINE:
      case ShapeType.POLYGON: {
        const parts = record.parts || [0];
        const numParts = parts.length;
        const bounds = calculateBounds(record.coordinates);
        buffer.writeInt32LE(record.shapeType, offset); offset += 4;
        buffer.writeDoubleLE(bounds.xmin, offset); offset += 8;
        buffer.writeDoubleLE(bounds.ymin, offset); offset += 8;
        buffer.writeDoubleLE(bounds.xmax, offset); offset += 8;
        buffer.writeDoubleLE(bounds.ymax, offset); offset += 8;
        buffer.writeInt32LE(numParts, offset); offset += 4;
        buffer.writeInt32LE(numPoints, offset); offset += 4;
        for (const part of parts) {
          buffer.writeInt32LE(part, offset); offset += 4;
        }
        for (let j = 0; j < record.coordinates.length; j += 2) {
          buffer.writeDoubleLE(record.coordinates[j], offset); offset += 8;
          buffer.writeDoubleLE(record.coordinates[j + 1], offset); offset += 8;
        }
        break;
      }
      case ShapeType.MULTIPOINT: {
        const bounds = calculateBounds(record.coordinates);
        buffer.writeInt32LE(record.shapeType, offset); offset += 4;
        buffer.writeDoubleLE(bounds.xmin, offset); offset += 8;
        buffer.writeDoubleLE(bounds.ymin, offset); offset += 8;
        buffer.writeDoubleLE(bounds.xmax, offset); offset += 8;
        buffer.writeDoubleLE(bounds.ymax, offset); offset += 8;
        buffer.writeInt32LE(numPoints, offset); offset += 4;
        for (let j = 0; j < record.coordinates.length; j += 2) {
          buffer.writeDoubleLE(record.coordinates[j], offset); offset += 8;
          buffer.writeDoubleLE(record.coordinates[j + 1], offset); offset += 8;
        }
        break;
      }
      default: {
        buffer.writeInt32LE(record.shapeType, offset); offset += 4;
        for (let j = 0; j < record.coordinates.length; j += 2) {
          buffer.writeDoubleLE(record.coordinates[j], offset); offset += 8;
          buffer.writeDoubleLE(record.coordinates[j + 1], offset); offset += 8;
        }
      }
    }
    return offset;
  }

  /**
   * Generate SHX file (index)
   */
  private generateSHX(): Buffer {
    // Index file: 50-word header + 4 words per record (record offset and length)
    const indexLength = 50 + this.records.length * 4;
    const buffer = Buffer.alloc(indexLength * 2);

    // Write header (same as SHP except file length, per ESRI spec)
    const header = Buffer.alloc(100); // zero-initialized
    header.writeInt32BE(9994, 0);           // File code [BE]
    // Bytes 4-23: Unused (already 0)
    header.writeInt32BE(indexLength, 24);   // File length in 16-bit words [BE]
    header.writeInt32LE(1000, 28);          // Version [LE]
    header.writeInt32LE(this.shapeType, 32); // Shape type [LE]

    header.writeDoubleLE(this.bounds.xmin, 36);
    header.writeDoubleLE(this.bounds.ymin, 44);
    header.writeDoubleLE(this.bounds.xmax, 52);
    header.writeDoubleLE(this.bounds.ymax, 60);

    header.copy(buffer, 0);
    let offset = 100;

    // Write index records
    let shapeOffset = 50; // Start after SHP header

    for (const record of this.records) {
      buffer.writeInt32BE(shapeOffset, offset); // Record offset
      offset += 4;

      const contentLength = this.calculateContentLength(record);
      buffer.writeInt32BE(contentLength, offset);
      offset += 4;

      // Update position for next record
      shapeOffset += 4 + contentLength; // record header (4 16-bit words) + content
    }

    return buffer;
  }

  /**
   * Generate DBF file (attribute database)
   */
  private generateDBF(fields: DBFField[]): Buffer {
    if (fields.length === 0) {
      throw new ShapefileError("No fields provided for DBF generation");
    }

    // Estimate buffer size
    let recordLength = 1; // Delete flag
    for (const field of fields) {
      recordLength += field.length;
    }

    const recordCount = this.records.length;
    const headerLength = 32 + fields.length * 32 + 1;
    const totalSize = headerLength + recordLength * recordCount;

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write DBF header (32 bytes)
    const now = new Date();
    buffer.writeUInt8(0x03, offset++); // File type (dBASE III)
    buffer.writeUInt8(now.getFullYear() - 1900, offset++);
    buffer.writeUInt8(now.getMonth() + 1, offset++);
    buffer.writeUInt8(now.getDate(), offset++);

    buffer.writeUInt32LE(recordCount, offset);
    offset += 4;

    buffer.writeUInt16LE(headerLength, offset);
    offset += 2;

    buffer.writeUInt16LE(recordLength, offset);
    offset += 2;

    // Reserved
    buffer.fill(0x00, offset, offset + 20);
    offset += 20;

    // Write field descriptors (32 bytes each)
    for (const field of fields) {
      // Field name (11 bytes, null-terminated)
      const nameBuffer = Buffer.alloc(11);
      Buffer.from(field.name.substring(0, 10)).copy(nameBuffer);
      nameBuffer.copy(buffer, offset);
      offset += 11;

      // Field type (1 byte)
      buffer.writeUInt8(field.type.charCodeAt(0), offset++);

      // Reserved (4 bytes)
      buffer.fill(0x00, offset, offset + 4);
      offset += 4;

      // Field length (1 byte)
      buffer.writeUInt8(field.length, offset++);

      // Decimal count (1 byte)
      buffer.writeUInt8(field.decimalCount || 0, offset++);

      // Reserved (14 bytes)
      buffer.fill(0x00, offset, offset + 14);
      offset += 14;
    }

    // Field terminator
    buffer.writeUInt8(0x0d, offset++);

    // Write data records with field values
    for (let i = 0; i < recordCount; i++) {
      const record = this.records[i];
      buffer.writeUInt8(0x20, offset++); // Delete flag: 0x20 = active

      // Write field values
      for (const field of fields) {
        const value = record.properties?.[field.sourceKey ?? field.name];
        const strValue = valueToDBFString(value, field.type, field.length);
        Buffer.from(strValue).copy(buffer, offset, 0, field.length);
        offset += field.length;
      }
    }

    return buffer;
  }

  /**
   * Create ZIP archive with all Shapefile components
   */
  private async createZIP(
    shpBuffer: Buffer,
    shxBuffer: Buffer,
    dbfBuffer: Buffer,
    prjBuffer: Buffer
  ): Promise<Buffer> {
    const zip = new JSZip();

    // Add files to ZIP (filename will be set by formatter)
    zip.file("data.shp", shpBuffer);
    zip.file("data.shx", shxBuffer);
    zip.file("data.dbf", dbfBuffer);
    zip.file("data.prj", prjBuffer);

    return zip.generateAsync({ type: "arraybuffer" }).then((buffer) => Buffer.from(buffer));
  }
}
