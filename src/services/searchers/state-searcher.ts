/**
 * StateSearcher - Search for Argentine states/provinces
 */

import { BaseSearcher, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface State {
  id: string;
  nombre: string;
  [key: string]: any;
}

export class StateSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "provincias");
  }

  /**
   * Search for states by name or query
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<State>> {
    const opts = {
      limit: options?.limit || 100,
      offset: options?.offset || 0,
      ...options,
    };

    return this.basicSearch<State>(query, opts);
  }

  /**
   * Search for state by ID
   */
  async getById(id: string): Promise<State | null> {
    return super.searchById<State>(id);
  }

  /**
   * Search for states by name (with optional exact match)
   */
  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<State[]> {
    return super.searchByName<State>(name, exact);
  }

  /**
   * Get all states
   */
  async getAll(limit: number = 100, offset: number = 0): Promise<SearchResult<State>> {
    return this.basicSearch<State>("", {
      limit,
      offset,
    });
  }
}
