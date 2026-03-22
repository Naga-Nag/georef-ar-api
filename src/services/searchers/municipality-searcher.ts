/**
 * MunicipalitySearcher - Search for Argentine municipalities
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Municipality {
  id: string;
  nombre: string;
  provincia: string;
  departamento: string;
  [key: string]: any;
}

export class MunicipalitySearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "municipios");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Municipality>> {
    return this.basicSearch<Municipality>(query, options);
  }

  async getById(id: string): Promise<Municipality | null> {
    return super.searchById<Municipality>(id);
  }

  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<Municipality[]> {
    return super.searchByName<Municipality>(name, exact);
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Municipality>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Municipality>("provincia", safeValue, options);
  }

  async searchByDepartment(
    departmentValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Municipality>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(departmentValue);
    return this.filterByFieldNested<Municipality>("departamento", safeValue, options);
  }
}
