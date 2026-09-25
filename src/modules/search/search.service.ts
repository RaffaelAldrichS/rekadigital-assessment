import { encodeCursor } from '../../shared/pagination/cursor';
import { FilterService } from '../filters/filter.service';
import { buildCursor, parseCursor } from '../listings/listing.service';
import { PaginatedListings } from '../listings/listing.types';
import { SearchRepository } from './search.repository';
import {
  FacetsQuery,
  FacetDefinition,
  MAX_FACET_OPTIONS,
  SearchListingsQuery,
  Suggestion,
  SuggestQuery,
} from './search.types';

const SCALAR_FACETS = [
  { key: 'make', name: 'Make', type: 'enum' as const },
  { key: 'model', name: 'Model', type: 'enum' as const },
  { key: 'transmission', name: 'Transmission', type: 'enum' as const },
  { key: 'fuel_type', name: 'Fuel Type', type: 'enum' as const },
  { key: 'status', name: 'Status', type: 'enum' as const },
];

export class SearchService {
  constructor(
    private searchRepo: SearchRepository = new SearchRepository(),
    private filterService: FilterService = new FilterService()
  ) {}

  async searchListings(query: SearchListingsQuery): Promise<PaginatedListings> {
    const cursor = query.cursor !== undefined ? parseCursor(query.cursor, query.sort) : null;
    const dynamicFilters = await this.filterService.prepareDynamicFilters(query.categoryId, query.filters);
    const rows = await this.searchRepo.search({
      q: query.q,
      maxRows: query.limit + 1,
      sort: query.sort,
      cursor,
      make: query.make,
      model: query.model,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minYear: query.minYear,
      maxYear: query.maxYear,
      fuelType: query.fuelType,
      transmission: query.transmission,
      categoryId: query.categoryId,
      status: query.status,
      dynamicFilters,
    });
    const hasNextPage = rows.length > query.limit;
    const data = hasNextPage ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasNextPage && data.length > 0 ? buildSearchCursor(data[data.length - 1], query.sort) : null;
    return { data, pagination: { nextCursor, hasNextPage } };
  }

  suggest(query: SuggestQuery): Promise<Suggestion[]> {
    return this.searchRepo.suggest(query.q, query.type, query.limit);
  }

  async getFacets(query: FacetsQuery): Promise<{
    context: { q?: string; categoryId?: string };
    total: number;
    filters: FacetDefinition[];
  }> {
    const dynamicFilters = await this.filterService.prepareDynamicFilters(query.categoryId, query.filters);
    const params = {
      q: query.q,
      make: query.make,
      model: query.model,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minYear: query.minYear,
      maxYear: query.maxYear,
      fuelType: query.fuelType,
      transmission: query.transmission,
      categoryId: query.categoryId,
      status: query.status,
      dynamicFilters,
    };
    const metadata = query.categoryId === undefined
      ? undefined
      : await this.filterService.getCategoryFilters(query.categoryId);
    const activeMetadata = (metadata?.filters ?? []).slice(0, MAX_FACET_OPTIONS);
    const enumMetadata = activeMetadata.filter((definition) => definition.type === 'enum');
    const facetData = await this.searchRepo.getFacets(
      params,
      enumMetadata.map((definition) => definition.id)
    );
    const countByAttributeValue = new Map(
      facetData.dynamicCounts.map((entry) => [`${entry.attributeId}:${entry.value}`, entry.count])
    );
    const scalarFacetDefinitions: FacetDefinition[] = SCALAR_FACETS.map((definition) => ({
      id: definition.key,
      ...definition,
      required: false,
      options: facetData.scalarOptions
        .filter((option) => option.key === definition.key)
        .map((option) => ({ value: option.value, label: option.label, count: option.count })),
    }));
    const dynamicFacetDefinitions = activeMetadata.map((definition) => ({
      id: definition.id,
      key: definition.key,
      name: definition.name,
      type: definition.type,
      required: definition.required,
      options:
        definition.type === 'enum'
          ? definition.options.slice(0, MAX_FACET_OPTIONS).map((option) => ({
              value: option.value,
              label: option.label,
              count: countByAttributeValue.get(`${definition.id}:${option.value}`) ?? 0,
            }))
          : [],
    }));

    return {
      context: {
        ...(query.q !== undefined ? { q: query.q } : {}),
        ...(query.categoryId !== undefined ? { categoryId: query.categoryId } : {}),
      },
      total: facetData.total,
      filters: [...scalarFacetDefinitions, ...dynamicFacetDefinitions],
    };
  }
}

function buildSearchCursor(row: PaginatedListings['data'][number], sort: SearchListingsQuery['sort']): string {
  return encodeCursor(buildCursor(row, sort));
}
