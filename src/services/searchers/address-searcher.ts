/**
 * AddressSearcher - Search for addresses (street + number)
 */

import { BaseSearcher, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
import { SearchBackend } from "@/services/meilisearch";

export interface Address {
  id: string;
  calle: string;
  altura: number;
  provincia: string;
  departamento?: string;
  municipio?: string;
  localidad?: string;
  geometry?: any;
  [key: string]: any;
}

export interface AddressSearchOptions extends SearchOptions {
  street: string;
  number: number;
  exactNumber?: boolean;
}

export class AddressSearcher extends BaseSearcher {
  constructor(backend: SearchBackend) {
    // Address data is typically stored in cuadras index
    super(backend, "cuadras");
  }

  /**
   * Search for address by street and number
   */
  async searchByAddress(
    street: string,
    number: number,
    options?: Partial<AddressSearchOptions>
  ): Promise<SearchResult<Address>> {
    if (!this.index) {
      await this.init();
    }

    const safeStreet = sanitizeFilterValue(street);
    const filters: string[] = [`calle = "${safeStreet}"`];

    // For address search, we typically look for street blocks containing the number
    if (options?.exactNumber) {
      filters.push(`altura = ${Number(number)}`);
    } else {
      // Search for blocks containing the number
      filters.push(`altura_inicio <= ${Number(number)} AND altura_fin >= ${Number(number)}`);
    }

    const meilisearchOptions: Record<string, any> = {
      filter: filters,
      limit: options?.limit || 100,
      offset: options?.offset || 0,
    };

    if (options?.fields && options.fields.length > 0) {
      meilisearchOptions.attributesToRetrieve = options.fields;
    }

    const result = await this.index!.search("", meilisearchOptions);

    return {
      hits: result.hits as Address[],
      total: result.estimatedTotalHits || result.hits.length,
      offset: result.offset || 0,
      limit: result.limit || options?.limit || 100,
    };
  }

  /**
   * Search for address with province filter
   */
  async searchByAddressAndProvince(
    street: string,
    number: number,
    provinceId: string,
    options?: Partial<AddressSearchOptions>
  ): Promise<SearchResult<Address>> {
    if (!this.index) {
      await this.init();
    }

    const safeStreet2 = sanitizeFilterValue(street);
    const safeProvinceId = sanitizeFilterValue(provinceId);
    const filters: string[] = [
      `calle = "${safeStreet2}"`,
      `provincia = "${safeProvinceId}"`,
    ];

    if (options?.exactNumber) {
      filters.push(`altura = ${Number(number)}`);
    } else {
      filters.push(`altura_inicio <= ${Number(number)} AND altura_fin >= ${Number(number)}`);
    }

    const meilisearchOptions: Record<string, any> = {
      filter: filters,
      limit: options?.limit || 100,
      offset: options?.offset || 0,
    };

    const result = await this.index!.search("", meilisearchOptions);

    return {
      hits: result.hits as Address[],
      total: result.estimatedTotalHits || result.hits.length,
      offset: result.offset || 0,
      limit: result.limit || options?.limit || 100,
    };
  }

  async getById(id: string): Promise<Address | null> {
    return super.searchById<Address>(id);
  }
}
