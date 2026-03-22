/**
 * LocalitySearcher - Search for Argentine localities
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Locality {
  id: string;
  nombre: string;
  provincia: string;
  departamento: string;
  municipio?: string;
  [key: string]: any;
}

export class LocalitySearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "localidades");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Locality>> {
    return this.basicSearch<Locality>(query, options);
  }

  async getById(id: string): Promise<Locality | null> {
    return super.searchById<Locality>(id);
  }

  async getByName(
    name: string,
    exact: boolean = false
  ): Promise<Locality[]> {
    return super.searchByName<Locality>(name, exact);
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Locality>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Locality>("provincia", safeValue, options);
  }

  async searchByMunicipality(
    municipalityValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Locality>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(municipalityValue);
    return this.filterByFieldNested<Locality>("municipio", safeValue, options);
  }
}
