/**
 * StreetSearcher - Search for Argentine streets
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Street {
  id: string;
  nombre: string;
  provincia: string;
  departamento?: string;
  municipio?: string;
  localidad?: string;
  [key: string]: any;
}

export class StreetSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "calles");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Street>> {
    return this.basicSearch<Street>(query, options);
  }

  async getById(id: string): Promise<Street | null> {
    return super.searchById<Street>(id);
  }

  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<Street[]> {
    return super.searchByName<Street>(name, exact);
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Street>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Street>("provincia", safeValue, options);
  }

  async searchByMunicipality(
    municipalityValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Street>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(municipalityValue);
    return this.filterByFieldNested<Street>("municipio", safeValue, options);
  }

  async searchByLocality(
    localityValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Street>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(localityValue);
    return this.filterByFieldNested<Street>("localidad", safeValue, options);
  }
}
