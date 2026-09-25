import type { Listing, ListingCursor, ListingSortField } from '../listings/listing.types';
import type { ValidatedDynamicFilter } from '../filters/filter.types';

export const MAX_FACET_OPTIONS = 50;

export type SuggestionType = 'make' | 'model' | 'city';

export interface ListingFilterContext {
  q?: string;
  make?: string;
  model?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  fuelType?: string;
  transmission?: string;
  categoryId?: string;
  status?: Exclude<Listing['status'], 'removed'>;
  filters?: string;
}

export interface SearchListingsQuery extends ListingFilterContext {
  q: string;
  limit: number;
  sort: ListingSortField;
  cursor?: string;
}

export type FacetsQuery = ListingFilterContext;

export interface SuggestQuery {
  q: string;
  type?: SuggestionType;
  limit: number;
}

export interface SearchRepositoryParams {
  q?: string;
  maxRows?: number;
  sort?: ListingSortField;
  cursor?: ListingCursor | null;
  make?: string;
  model?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  fuelType?: string;
  transmission?: string;
  categoryId?: string;
  status?: Exclude<Listing['status'], 'removed'>;
  dynamicFilters?: ValidatedDynamicFilter[];
}

export interface Suggestion {
  type: SuggestionType;
  value: string;
  label: string;
}

export interface FacetOptionRow {
  key: string;
  value: string;
  label: string;
  count: number;
}

export interface FacetQueryRow {
  kind: 'total' | 'scalar' | 'dynamic';
  attributeId: string | null;
  key: string | null;
  value: string | null;
  label: string | null;
  count: number;
  total: number | null;
}

export interface FacetResult {
  total: number;
  scalarOptions: FacetOptionRow[];
  dynamicCounts: Array<{ attributeId: string; value: string; count: number }>;
}

export interface FacetDefinition {
  id: string;
  key: string;
  name: string;
  type: 'enum' | 'range' | 'boolean';
  required: boolean;
  options: Array<{
    value: string;
    label: string;
    count: number;
  }>;
}
