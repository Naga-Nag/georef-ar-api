/**
 * Base Searcher class - abstract base for all entity searchers
 */

import { SearchBackend } from "@/services/meilisearch";
import type { Index } from "meilisearch";

export interface SearchOptions {
  limit?: number;
  offset?: number;
  fields?: string[];
  highlightFields?: string[];
  exact?: boolean;
  filters?: string[];
  sort?: string[];
}

export interface SearchResult<T> {
  hits: T[];
  total: number;
  offset: number;
  limit: number;
}

export const MAX_LIMIT = 5000;

/**
 * Sanitize a string value for use in Meilisearch filter expressions.
 * Prevents filter injection by escaping double quotes.
 */
export function sanitizeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export abstract class BaseSearcher {
  protected backend: SearchBackend;
  protected indexName: string;
  protected index?: Index;

  constructor(backend: SearchBackend, indexName: string) {
    this.backend = backend;
    this.indexName = indexName;
  }

  /**
   * Initialize the searcher by getting the index
   */
  async init(): Promise<void> {
    this.index = await this.backend.getIndex(this.indexName);
  }

  /**
   * Perform a search with options
   */
  async basicSearch<T = any>(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<T>> {
    if (!this.index) {
      await this.init();
    }

    const meilisearchOptions: Record<string, any> = {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
    };

    if (options?.fields && options.fields.length > 0) {
      meilisearchOptions.attributesToRetrieve = options.fields;
    }

    if (options?.highlightFields && options.highlightFields.length > 0) {
      meilisearchOptions.attributesToHighlight = options.highlightFields;
    }

    if (options?.filters && options.filters.length > 0) {
      meilisearchOptions.filter = options.filters;
    }

    if (options?.sort && options.sort.length > 0) {
      meilisearchOptions.sort = options.sort;
    }

    const result = await this.index!.search(query, meilisearchOptions);

    return {
      hits: result.hits as T[],
      total: result.estimatedTotalHits || result.hits.length,
      offset: result.offset || 0,
      limit: result.limit || options?.limit || 100,
    };
  }

  /**
   * Search by exact ID match
   */
  protected async searchById<T = any>(id: string): Promise<T | null> {
    if (!this.index) {
      await this.init();
    }

    const safeId = sanitizeFilterValue(id);
    const result = await this.index!.search("", {
      filter: [`id = "${safeId}"`],
      limit: 1,
    });

    return (result.hits[0] as T) || null;
  }

  /**
   * Search by name with optional exact match
   */
  protected async searchByName<T = any>(
    name: string,
    exact: boolean = false,
    limit: number = 100
  ): Promise<T[]> {
    if (!this.index) {
      await this.init();
    }

    const meilisearchOptions: Record<string, any> = {
      limit: Math.min(limit, MAX_LIMIT),
    };

    if (exact) {
      // For exact match, use filter with quoted value
      const safeName = sanitizeFilterValue(name);
      meilisearchOptions.filter = [`nombre = "${safeName}"`];
    }

    const result = await this.index!.search(name, meilisearchOptions);
    return result.hits as T[];
  }

  /**
   * Filter results by a field value
   */
  protected async filterByField<T = any>(
    field: string,
    value: string,
    options?: SearchOptions
  ): Promise<SearchResult<T>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(value);
    const meilisearchOptions: Record<string, any> = {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      filter: [`${field} = "${safeValue}"`],
    };

    if (options?.fields && options.fields.length > 0) {
      meilisearchOptions.attributesToRetrieve = options.fields;
    }

    const result = await this.index!.search("", meilisearchOptions);

    return {
      hits: result.hits as T[],
      total: result.estimatedTotalHits || result.hits.length,
      offset: result.offset || 0,
      limit: result.limit || options?.limit || 100,
    };
  }

  /**
   * Filter by a nested field (searches both {field}.id and {field}.nombre)
   * Matches Python API behavior for hierarchical entities (provincia, departamento, municipio, etc.)
   */
  protected async filterByFieldNested<T = any>(
    field: string,
    value: string,
    options?: SearchOptions
  ): Promise<SearchResult<T>> {
    if (!this.index) {
      await this.init();
    }

    const meilisearchOptions: Record<string, any> = {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      // Search both {field}.id and {field}.nombre to match Python API behavior
      filter: [`${field}.id = "${value}" OR ${field}.nombre = "${value}"`],
    };

    if (options?.fields && options.fields.length > 0) {
      meilisearchOptions.attributesToRetrieve = options.fields;
    }

    const result = await this.index!.search("", meilisearchOptions);

    return {
      hits: result.hits as T[],
      total: result.estimatedTotalHits || result.hits.length,
      offset: result.offset || 0,
      limit: result.limit || options?.limit || 100,
    };
  }

  /**
   * Get index status
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.index) {
        await this.init();
      }
      const stats = await this.index!.getStats();
      return stats !== null;
    } catch {
      return false;
    }
  }
}
