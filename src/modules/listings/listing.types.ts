export const LISTING_SORT_FIELDS = ['created_at', 'price', 'year', 'mileage'] as const;

export type ListingSortField = (typeof LISTING_SORT_FIELDS)[number];

export type ListingStatus = 'available' | 'pending' | 'sold' | 'removed';

export type FilterAttributeType = 'enum' | 'range' | 'boolean';

export interface Listing {
  id: string;
  modelId: string;
  categoryId: string;
  title: string;
  description: string | null;
  year: number;
  mileage: number;
  price: string;
  condition: string;
  transmission: string;
  fuelType: string;
  color: string;
  city: string;
  latitude: string | null;
  longitude: string | null;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ListingImage {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

export interface ListingAttributeValue {
  attributeId: string;
  key: string;
  type: FilterAttributeType;
  value: string | number | boolean;
}

export interface ListingDetail extends Listing {
  model: { id: string; name: string; slug: string };
  make: { id: string; name: string; slug: string };
  category: { id: string; name: string; slug: string; parentId: string | null };
  images: ListingImage[];
  attributes: ListingAttributeValue[];
}

export interface ListingImageInput {
  imageUrl: string;
  sortOrder?: number;
}

export interface ListingAttributeInput {
  attributeId: string;
  value: string | number | boolean;
}

export interface CreateListingInput {
  modelId: string;
  categoryId: string;
  title: string;
  description?: string | null;
  year: number;
  mileage: number;
  price: number;
  condition: string;
  transmission: string;
  fuelType: string;
  color: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
  status?: Exclude<ListingStatus, 'removed'>;
  images?: ListingImageInput[];
  attributes?: ListingAttributeInput[];
}

export interface UpdateListingInput {
  modelId?: string;
  categoryId?: string;
  title?: string;
  description?: string | null;
  year?: number;
  mileage?: number;
  price?: number;
  condition?: string;
  transmission?: string;
  fuelType?: string;
  color?: string;
  city?: string;
  latitude?: number | null;
  longitude?: number | null;
  status?: Exclude<ListingStatus, 'removed'>;
  images?: ListingImageInput[];
  attributes?: ListingAttributeInput[];
}

export interface ListingCursor {
  sort: ListingSortField;
  value: string | number;
  id: string;
}

export interface BrowseListingsQuery {
  limit: number;
  sort: ListingSortField;
  cursor?: string;
  make?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  fuelType?: string;
  categoryId?: string;
  status?: Exclude<ListingStatus, 'removed'>;
  filters?: string;
}

export interface PaginatedListings {
  data: Listing[];
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}
