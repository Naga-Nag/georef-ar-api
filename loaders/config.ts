/**
 * Data source configuration for NDJSON loader
 * Maps entities to their NDJSON data sources and metadata
 */

export interface DataSource {
  name: string;
  index: string;
  url: string;
  entityType: string;
}

// Entity type constants (matching Python service/names.py)
export const ENTITIES = {
  PROVINCIAS: "provincias",
  DEPARTAMENTOS: "departamentos",
  MUNICIPIOS: "municipios",
  LOCALIDADES_CENSALES: "localidades_censales",
  ASENTAMIENTOS: "asentamientos",
  LOCALIDADES: "localidades",
  CALLES: "calles",
  INTERSECCIONES: "intersecciones",
  CUADRAS: "cuadras",
} as const;

// Default data sources from infra.datos.gob.ar
const INFRA_BASE_URL = "https://infra.datos.gob.ar/georef";

export const DATA_SOURCES: Record<string, DataSource> = {
  [ENTITIES.PROVINCIAS]: {
    name: "Provincias (Estados)",
    index: "provincias",
    url: `${INFRA_BASE_URL}/provincias.ndjson`,
    entityType: ENTITIES.PROVINCIAS,
  },
  [ENTITIES.DEPARTAMENTOS]: {
    name: "Departamentos",
    index: "departamentos",
    url: `${INFRA_BASE_URL}/departamentos.ndjson`,
    entityType: ENTITIES.DEPARTAMENTOS,
  },
  [ENTITIES.MUNICIPIOS]: {
    name: "Municipios",
    index: "municipios",
    url: `${INFRA_BASE_URL}/municipios.ndjson`,
    entityType: ENTITIES.MUNICIPIOS,
  },
  [ENTITIES.LOCALIDADES_CENSALES]: {
    name: "Localidades Censales",
    index: "localidades_censales",
    url: `${INFRA_BASE_URL}/localidades_censales.ndjson`,
    entityType: ENTITIES.LOCALIDADES_CENSALES,
  },
  [ENTITIES.ASENTAMIENTOS]: {
    name: "Asentamientos",
    index: "asentamientos",
    url: `${INFRA_BASE_URL}/asentamientos.ndjson`,
    entityType: ENTITIES.ASENTAMIENTOS,
  },
  [ENTITIES.LOCALIDADES]: {
    name: "Localidades",
    index: "localidades",
    url: `${INFRA_BASE_URL}/localidades.ndjson`,
    entityType: ENTITIES.LOCALIDADES,
  },
  [ENTITIES.CALLES]: {
    name: "Calles",
    index: "calles",
    url: `${INFRA_BASE_URL}/calles.ndjson`,
    entityType: ENTITIES.CALLES,
  },
  [ENTITIES.INTERSECCIONES]: {
    name: "Intersecciones",
    index: "intersecciones",
    url: `${INFRA_BASE_URL}/intersecciones.ndjson`,
    entityType: ENTITIES.INTERSECCIONES,
  },
  [ENTITIES.CUADRAS]: {
    name: "Cuadras (Street Blocks)",
    index: "cuadras",
    url: `${INFRA_BASE_URL}/cuadras.ndjson`,
    entityType: ENTITIES.CUADRAS,
  },
};

// Loading order: hierarchical geographic dependency
export const RECOMMENDED_LOAD_ORDER = [
  ENTITIES.PROVINCIAS,
  ENTITIES.DEPARTAMENTOS,
  ENTITIES.MUNICIPIOS,
  ENTITIES.LOCALIDADES_CENSALES,
  ENTITIES.ASENTAMIENTOS,
  ENTITIES.LOCALIDADES,
  ENTITIES.CALLES,
  ENTITIES.INTERSECCIONES,
  ENTITIES.CUADRAS,
];

/**
 * Get data source by entity name
 */
export function getDataSource(entity: string): DataSource | null {
  return DATA_SOURCES[entity] || null;
}

/**
 * Get all available entities
 */
export function getAllEntities(): string[] {
  return Object.keys(DATA_SOURCES);
}

/**
 * Parse entity names from command line argument
 * Accepts: "provincias,departamentos" or "all"
 */
export function parseEntityArgument(arg: string): string[] {
  if (arg.toLowerCase() === "all") {
    return RECOMMENDED_LOAD_ORDER;
  }

  const entities = arg.split(",").map((e) => e.trim().toLowerCase());
  const valid = entities.filter((e) => e in DATA_SOURCES);

  if (valid.length === 0) {
    console.error(
      `No valid entities found. Available: ${getAllEntities().join(", ")}`
    );
    return [];
  }

  if (valid.length < entities.length) {
    const invalid = entities.filter((e) => !(e in DATA_SOURCES));
    console.warn(`Skipping invalid entities: ${invalid.join(", ")}`);
  }

  return valid;
}
