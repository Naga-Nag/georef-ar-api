/**
 * SettlementSearcher - Search for Argentine settlements (asentamientos)
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Settlement {
  id: string;
  nombre: string;
  provincia: string;
  departamento?: string;
  municipio?: string;
  [key: string]: any;
}

export class SettlementSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "asentamientos");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Settlement>> {
    return this.basicSearch<Settlement>(query, options);
  }

  async getById(id: string): Promise<Settlement | null> {
    return super.searchById<Settlement>(id);
  }

  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<Settlement[]> {
    return super.searchByName<Settlement>(name, exact);
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Settlement>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Settlement>("provincia", safeValue, options);
  }
}
