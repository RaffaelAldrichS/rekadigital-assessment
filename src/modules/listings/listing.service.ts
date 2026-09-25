import { NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { decodeCursor, encodeCursor } from '../../shared/pagination/cursor';
import { FilterService } from '../filters/filter.service';
import { ListingRepository } from './listing.repository';
import { listingCursorSchema } from './listing.schema';
import {
  BrowseListingsQuery,
  CreateListingInput,
  Listing,
  ListingCursor,
  ListingDetail,
  ListingSortField,
  PaginatedListings,
  UpdateListingInput,
} from './listing.types';

export function parseCursor(raw: string, requestedSort: ListingSortField): ListingCursor {
  let decoded: unknown;
  try {
    decoded = decodeCursor(raw);
  } catch {
    throw new ValidationError('Cursor is invalid or malformed');
  }

  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new ValidationError('Cursor is invalid or malformed');
  }

  const parsed = listingCursorSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new ValidationError('Cursor is invalid or malformed');
  }

  if (parsed.data.sort !== requestedSort) {
    throw new ValidationError('Cursor does not match the requested sort order');
  }

  return parsed.data;
}

export function buildCursor(row: Listing, sort: ListingSortField): ListingCursor {
  const value =
    sort === 'created_at'
      ? row.createdAt
      : sort === 'price'
        ? row.price
        : sort === 'year'
          ? row.year
          : row.mileage;
  return { sort, value, id: row.id };
}

export class ListingService {
  constructor(
    private listingRepo: ListingRepository = new ListingRepository(),
    private filterService: FilterService = new FilterService()
  ) {}

  async createListing(input: CreateListingInput): Promise<ListingDetail> {
    return this.listingRepo.create(input);
  }

  async getListingById(id: string): Promise<ListingDetail> {
    const listing = await this.listingRepo.findById(id);
    if (!listing) {
      throw new NotFoundError('Listing not found');
    }
    return listing;
  }

  async browseListings(query: BrowseListingsQuery): Promise<PaginatedListings> {
    const cursor = query.cursor !== undefined ? parseCursor(query.cursor, query.sort) : null;
    const dynamicFilters = await this.filterService.prepareDynamicFilters(query.categoryId, query.filters);

    const rows = await this.listingRepo.browse({
      maxRows: query.limit + 1,
      sort: query.sort,
      cursor,
      make: query.make,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      minYear: query.minYear,
      maxYear: query.maxYear,
      fuelType: query.fuelType,
      categoryId: query.categoryId,
      status: query.status,
      dynamicFilters,
    });

    const hasNextPage = rows.length > query.limit;
    const data = hasNextPage ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasNextPage && data.length > 0 ? encodeCursor(buildCursor(data[data.length - 1], query.sort)) : null;

    return {
      data,
      pagination: { nextCursor, hasNextPage },
    };
  }

  async updateListing(id: string, input: UpdateListingInput): Promise<ListingDetail> {
    return this.listingRepo.update(id, input);
  }

  async deleteListing(id: string): Promise<void> {
    const deleted = await this.listingRepo.softDelete(id);
    if (!deleted) {
      throw new NotFoundError('Listing not found');
    }
  }
}
