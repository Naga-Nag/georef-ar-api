/**
 * Response formatter - Formats search results and errors
 */

import { QueryResult, ErrorResponse } from "@/models/result";

export interface FormatterOptions {
  flatten?: boolean;
  fields?: string[];
  format?: "json" | "geojson";
  onlyGeometry?: boolean;
}

export interface FormattedEntity {
  [key: string]: any;
}

export class ResponseFormatter {
  /**
   * Format query results with optional flattening and field selection
   */
  /**
   * Remove geometry fields from an entity (default behaviour when no campos filter is given)
   */
  static excludeGeometry<T extends Record<string, any>>(entity: T): Partial<T> {
    const result: any = {};
    for (const [key, value] of Object.entries(entity)) {
      if (key !== "geometria" && key !== "geometry") {
        result[key] = value;
      }
    }
    return result;
  }

  static format<T extends Record<string, any>>(
    data: T[],
    options: FormatterOptions & Record<string, any>,
    queryParams: Record<string, any> = {}
  ): QueryResult<T> {
    let formatted: any[] = data;

    // Apply field filtering if specified; otherwise exclude geometry by default
    if (options.fields && options.fields.length > 0) {
      formatted = data.map((item) => this.selectFields(item, options.fields!));
    } else {
      formatted = data.map((item) => this.excludeGeometry(item));
    }

    // Apply flattening if requested
    if (options.flatten) {
      formatted = data.map((item) => this.flatten(item));
    }

    // Apply format transformation (GeoJSON)
    if (options.format === "geojson") {
      formatted = data.map((item) => this.toGeoJSON(item));
    }

    return {
      cantidad: formatted.length,
      inicio: options.offset || 0,
      resultados: formatted as T[],
      parametros: {
        ...queryParams,
        orden: options.order || "asc",
        limite: options.limit || 100,
        inicio: options.offset || 0,
      },
    };
  }

  /**
   * Select specific fields from an entity
   */
  static selectFields<T extends Record<string, any>>(
    entity: T,
    fields: string[]
  ): Partial<T> {
    const result: any = {};

    for (const field of fields) {
      // Handle nested fields like "provincia.nombre"
      if (field.includes(".")) {
        const parts = field.split(".");
        let value: any = entity;

        for (const part of parts) {
          if (value && typeof value === "object") {
            value = value[part];
          } else {
            value = null;
            break;
          }
        }

        if (value !== null && value !== undefined) {
          let current = result;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
              current[parts[i]] = {};
            }
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        }
      } else if (field in entity) {
        result[field] = entity[field];
      }
    }

    return result;
  }

  /**
   * Flatten nested objects using underscore notation
   * e.g., {provincia: {nombre: "Buenos Aires"}} becomes {provincia_nombre: "Buenos Aires"}
   */
  static flatten(
    obj: Record<string, any>,
    prefix: string = ""
  ): FormattedEntity {
    const result: FormattedEntity = {};

    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}_${key}` : key;

      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !(value instanceof Date)
      ) {
        // Recursively flatten nested objects
        Object.assign(result, this.flatten(value, newKey));
      } else if (Array.isArray(value)) {
        // Keep arrays as-is
        result[newKey] = value;
      } else {
        result[newKey] = value;
      }
    }

    return result;
  }

  /**
   * Convert entity to GeoJSON format
   */
  static toGeoJSON(entity: Record<string, any>): Record<string, any> {
    const geometry = entity.geometry;

    if (geometry) {
      return {
        type: "Feature",
        geometry,
        properties: Object.entries(entity)
          .filter(([key]) => key !== "geometry")
          .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
          }, {} as Record<string, any>),
      };
    }

    // If no geometry, return as-is
    return entity;
  }

  /**
   * Format a single entity for detail endpoint
   */
  static formatSingle<T extends Record<string, any>>(
    entity: T | null,
    options: FormatterOptions = {}
  ): T | null {
    if (!entity) {
      return null;
    }

    let result = entity;

    if (options.fields && options.fields.length > 0) {
      result = this.selectFields(entity, options.fields) as T;
    } else {
      result = this.excludeGeometry(entity) as T;
    }

    if (options.flatten) {
      result = this.flatten(entity) as T;
    }

    if (options.format === "geojson") {
      result = this.toGeoJSON(entity) as T;
    }

    return result;
  }

  /**
   * Create 404 error response
   */
  static create404Error(): ErrorResponse {
    return {
      error: {
        codigo: 404,
        descripcion: "Recurso no encontrado",
      },
      status: 404,
      code: "NOT_FOUND",
    };
  }

  /**
   * Create 405 error response (Method Not Allowed)
   */
  static create405Error(allowedMethods: string[] = []): ErrorResponse {
    return {
      error: {
        codigo: 405,
        descripcion: "Método no permitido",
        metodosPermitidos: allowedMethods,
      },
      status: 405,
      code: "METHOD_NOT_ALLOWED",
    };
  }

  /**
   * Create 400 error response (Bad Request)
   */
  static create400Error(details: string = ""): ErrorResponse {
    return {
      error: {
        codigo: 400,
        descripcion: "Solicitud inválida",
        detalles: details,
      },
      status: 400,
      code: "BAD_REQUEST",
    };
  }

  /**
   * Create 500 error response (Server Error)
   */
  static create500Error(message: string = ""): ErrorResponse {
    return {
      error: {
        codigo: 500,
        descripcion: "Error interno del servidor",
        mensaje: message,
      },
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
    };
  }

  /**
   * Create parameter validation error response
   */
  static createParameterError(details: Record<string, string[]>): ErrorResponse {
    return {
      error: {
        codigo: 400,
        descripcion: "Error en los parámetros",
        errores: details,
      },
      status: 400,
      code: "PARAMETER_ERROR",
    };
  }
}
