import { z } from 'zod';
import { LISTING_SORT_FIELDS } from '../listings/listing.types';

const queryNumber = z.coerce.number().finite();
const statusSchema = z.enum(['available', 'pending', 'sold']);
const searchTextSchema = z
  .string()
  .trim()
  .min(1, 'Search query is required')
  .max(500)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Search query contains unsupported characters');
const filterFields = {
  make: z.string().trim().min(1).max(100).optional(),
  model: z.string().trim().min(1).max(100).optional(),
  minPrice: queryNumber.nonnegative('Minimum price must be non-negative').optional(),
  maxPrice: queryNumber.nonnegative('Maximum price must be non-negative').optional(),
  minYear: queryNumber.int().min(1886, 'Year must be greater than 1885').max(2100).optional(),
  maxYear: queryNumber.int().min(1886, 'Year must be greater than 1885').max(2100).optional(),
  fuelType: z.string().trim().min(1).max(30).optional(),
  transmission: z.string().trim().min(1).max(30).optional(),
  categoryId: z.string().uuid('Invalid category ID format').optional(),
  status: statusSchema.optional(),
  filters: z.string().trim().min(1, 'Dynamic filters cannot be empty').max(10000).optional(),
};

function addRangeIssues(
  data: { minPrice?: number; maxPrice?: number; minYear?: number; maxYear?: number },
  ctx: z.RefinementCtx
): void {
  if (data.minPrice !== undefined && data.maxPrice !== undefined && data.minPrice > data.maxPrice) {
    ctx.addIssue({ code: 'custom', path: ['minPrice'], message: 'Minimum price cannot exceed maximum price' });
  }
  if (data.minYear !== undefined && data.maxYear !== undefined && data.minYear > data.maxYear) {
    ctx.addIssue({ code: 'custom', path: ['minYear'], message: 'Minimum year cannot exceed maximum year' });
  }
}

export const searchListingsQuerySchema = z
  .object({
    q: searchTextSchema,
    limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').default(20),
    sort: z.enum(LISTING_SORT_FIELDS).default('created_at'),
    cursor: z.string().trim().min(1, 'Cursor cannot be empty').optional(),
    ...filterFields,
  })
  .superRefine(addRangeIssues);

export const facetsQuerySchema = z
  .object({
    q: searchTextSchema.optional(),
    ...filterFields,
  })
  .superRefine(addRangeIssues);

const suggestionQueryPattern = /^[\p{L}\p{N} .,&'+\-]+$/u;

export const suggestQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Suggestion query is required')
    .max(100, 'Suggestion query is too long')
    .regex(suggestionQueryPattern, 'Suggestion query contains unsupported characters'),
  type: z.enum(['make', 'model', 'city']).optional(),
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(10, 'Limit cannot exceed 10').default(5),
});

export type SearchListingsQueryInput = z.infer<typeof searchListingsQuerySchema>;
export type FacetsQueryInput = z.infer<typeof facetsQuerySchema>;
export type SuggestQueryInput = z.infer<typeof suggestQuerySchema>;
