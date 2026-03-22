/**
 * IntersectionSearcher - Search for street intersections
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Intersection {
  id: string;
  nombre: string;
  calle1: string;
  calle2: string;
  provincia: string;
  departamento?: string;
  municipio?: string;
  localidad?: string;
  [key: string]: any;
}

export class IntersectionSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    super(backend, "intersecciones");
  }

  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SearchResult<Intersection>> {
    return this.basicSearch<Intersection>(query, options);
  }

  async getById(id: string): Promise<Intersection | null> {
    return super.searchById<Intersection>(id);
  }

  /**
   * Search for intersection between two streets
   */
  async searchByStreets(
    street1: string,
    street2: string,
    options?: SearchOptions
  ): Promise<Intersection[]> {
    if (!this.index) {
      await this.init();
    }

    const safeStreet1 = sanitizeFilterValue(street1);
    const safeStreet2 = sanitizeFilterValue(street2);
    const filters = [
      `(calle1 = "${safeStreet1}" AND calle2 = "${safeStreet2}") OR (calle1 = "${safeStreet2}" AND calle2 = "${safeStreet1}")`,
    ];

    const meilisearchOptions: Record<string, any> = {
      filter: filters,
      limit: options?.limit || 100,
      offset: options?.offset || 0,
    };

    const result = await this.index!.search("", meilisearchOptions);
    return result.hits as Intersection[];
  }

  async searchByProvince(
    provinceValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Intersection>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(provinceValue);
    return this.filterByFieldNested<Intersection>("provincia", safeValue, options);
  }

  async searchByMunicipality(
    municipalityValue: string,
    options?: SearchOptions
  ): Promise<SearchResult<Intersection>> {
    if (!this.index) {
      await this.init();
    }

    const safeValue = sanitizeFilterValue(municipalityValue);
    return this.filterByFieldNested<Intersection>("municipio", safeValue, options);
  }
}
