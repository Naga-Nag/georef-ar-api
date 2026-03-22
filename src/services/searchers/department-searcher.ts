/**
 * DepartmentSearcher - Search for Argentine departments
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Department {
  id: string;
  nombre: string;
  provincia: string;
  [key: string]: any;
}

export class DepartmentSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "departamentos");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Department>> {
    return this.basicSearch<Department>(query, options);
  }

  async getById(id: string): Promise<Department | null> {
    return super.searchById<Department>(id);
  }

  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<Department[]> {
    return super.searchByName<Department>(name, exact);
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Department>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Department>("provincia", safeValue, options);
  }
}
