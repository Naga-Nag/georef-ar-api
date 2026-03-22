/**
 * Meilisearch client wrapper
 */

import { MeiliSearch, Index } from "meilisearch";
import { config } from "../config";

const FILTERABLE_ATTRIBUTES: Record<string, string[]> = {
  provincias: ["id", "nombre"],
  departamentos: ["id", "nombre", "provincia.id", "provincia.nombre", "geometry"],
  municipios: ["id", "nombre", "provincia.id", "provincia.nombre", "departamento.id", "departamento.nombre", "geometry"],
  localidades: ["id", "nombre", "provincia.id", "provincia.nombre", "municipio.id", "municipio.nombre"],
  localidades_censales: ["id", "nombre", "provincia.id", "provincia.nombre"],
  asentamientos: ["id", "nombre", "provincia.id", "provincia.nombre"],
  calles: ["id", "nombre", "provincia.id", "provincia.nombre", "municipio.id", "municipio.nombre", "localidad.id", "localidad.nombre"],
  intersecciones: ["id", "provincia.id", "provincia.nombre", "municipio.id", "municipio.nombre", "calle1.id", "calle1.nombre", "calle2.id", "calle2.nombre"],
  cuadras: ["id", "calle.id", "calle.nombre", "provincia.id", "provincia.nombre", "altura", "altura_inicio", "altura_fin"],
};

// Indexes that use filter-only queries (no full-text search needed).
// Setting a minimal searchableAttributes list prevents MeiliSearch from
// tokenizing expensive fields like geometry, dramatically reducing index time.
const SEARCHABLE_ATTRIBUTES: Record<string, string[]> = {
  cuadras: ["id"],
  intersecciones: ["id"],
};

export class SearchBackend {
  private client: MeiliSearch;
  private indexCache = new Map<string, Promise<Index>>();

  constructor() {
    this.client = new MeiliSearch({
      host: config.meilisearch.host,
      apiKey: config.meilisearch.apiKey,
    });
  }

  /**
   * Search in a Meilisearch index
   */
  async search(
    indexName: string,
    query: string,
    options?: Record<string, any>
  ): Promise<any> {
    try {
      const index = await this.client.getIndex(indexName);
      return index.search(query, options);
    } catch (error) {
      console.error(`[SEARCH] Error searching index ${indexName}:`, error);
      throw error;
    }
  }

  /**
   * Get index by name
   */
  async getIndex(name: string): Promise<Index> {
    let cached = this.indexCache.get(name);
    if (!cached) {
      cached = this.client.getIndex(name);
      this.indexCache.set(name, cached);
      cached.catch(() => this.indexCache.delete(name));
    }
    return cached;
  }

  /**
   * List all indexes
   */
  async listIndexes(): Promise<any> {
    return this.client.getIndexes();
  }

  /**
   * Check if Meilisearch is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const health = await (this.client as any).health();
      return health.status === "available";
    } catch {
      return false;
    }
  }

  /**
   * Get index stats
   */
  async getStats(indexName: string): Promise<any> {
    try {
      const index = await this.client.getIndex(indexName);
      return index.getRawInfo();
    } catch (error) {
      console.error(`[STATS] Error getting stats for ${indexName}:`, error);
      throw error;
    }
  }

  private async getIndexWithRetry(
    indexName: string,
    retries: number = 5,
    delayMs: number = 200
  ): Promise<Index> {
    let lastError: unknown;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.client.getIndex(indexName);
      } catch (error) {
        lastError = error;

        if (attempt === retries - 1) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }

    throw lastError;
  }

  /**
   * Create an index with standard configuration
   */
  async createIndex(
    indexName: string,
    options?: { primaryKey?: string }
  ): Promise<Index> {
    try {
      const createOptions = {
        primaryKey: options?.primaryKey || "id",
      };

      const task = await this.client.createIndex(indexName, createOptions);
      console.log(`[INDEX] Creating index ${indexName}:`, task);

      // Wait for task completion if taskUid exists
      if (task && (task as any).taskUid) {
        const result = await this.client.waitForTask((task as any).taskUid, {
          timeOutMs: 600000, // 10 minutes — task may queue behind bulk document tasks
        });

        if (result?.status === "failed") {
          throw new Error(
            result.error?.message || `Failed to create index ${indexName}`
          );
        }
      }

      const index = await this.getIndexWithRetry(indexName);

      // Set index configuration with common searchable attributes
      const defaultConfig: Record<string, any> = {
        displayedAttributes: ["*"],
      };

      const searchable = SEARCHABLE_ATTRIBUTES[indexName];
      defaultConfig.searchableAttributes = searchable ?? ["*"];

      const filterable = FILTERABLE_ATTRIBUTES[indexName];
      if (filterable) {
        defaultConfig.filterableAttributes = filterable;
      }

      const settingsTask = await (index as any).updateSettings(defaultConfig);
      if (settingsTask && (settingsTask as any).taskUid) {
        await this.client.waitForTask((settingsTask as any).taskUid, {
          timeOutMs: 600000, // 10 minutes — settings update may queue behind bulk document tasks
        });
      }
      console.log(`✅ Created index ${indexName}`);

      return index;
    } catch (error: any) {
      // Index might already exist
      if (error.code === "index_already_exists" || error.message?.includes("already exists")) {
        console.log(`[INDEX] Index ${indexName} already exists`);
        return this.getIndexWithRetry(indexName);
      }
      console.error(`[INDEX] Error creating index ${indexName}:`, error);
      throw error;
    }
  }

  /**
   * Get or create index
   */
  async getOrCreateIndex(
    indexName: string,
    options?: { primaryKey?: string }
  ): Promise<Index> {
    try {
      const index = await this.client.getIndex(indexName);
      // Ensure settings are configured for existing indexes
      const settings: Record<string, any> = {};
      const filterable = FILTERABLE_ATTRIBUTES[indexName];
      if (filterable) {
        settings.filterableAttributes = filterable;
      }
      const searchable = SEARCHABLE_ATTRIBUTES[indexName];
      if (searchable) {
        settings.searchableAttributes = searchable;
      }
      if (Object.keys(settings).length > 0) {
        const task = await (index as any).updateSettings(settings);
        if (task && (task as any).taskUid) {
          await this.client.waitForTask((task as any).taskUid, {
            timeOutMs: 600000, // 10 minutes
          });
        }
      }
      return index;
    } catch (error) {
      // Index doesn't exist, create it
      console.log(`[INDEX] Index ${indexName} not found, creating...`);
      return this.createIndex(indexName, {
        primaryKey: options?.primaryKey || "id",
      });
    }
  }
}

export const searchBackend = new SearchBackend();
