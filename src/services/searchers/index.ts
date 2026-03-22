/**
 * Searchers barrel export
 */

export { BaseSearcher, MAX_LIMIT, sanitizeFilterValue, type SearchOptions, type SearchResult } from "./base-searcher";
export { StateSearcher, type State } from "./state-searcher";
export { DepartmentSearcher, type Department } from "./department-searcher";
export { MunicipalitySearcher, type Municipality } from "./municipality-searcher";
export { LocalitySearcher, type Locality } from "./locality-searcher";
export { StreetSearcher, type Street } from "./street-searcher";
export { SettlementSearcher, type Settlement } from "./settlement-searcher";
export { IntersectionSearcher, type Intersection } from "./intersection-searcher";
export {
  AddressSearcher,
  type Address,
  type AddressSearchOptions,
} from "./address-searcher";
export { LocationSearcher, type LocationResult } from "./location-searcher";
