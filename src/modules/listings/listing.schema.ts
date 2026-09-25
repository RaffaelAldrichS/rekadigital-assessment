import { z } from 'zod';
import { LISTING_SORT_FIELDS } from './listing.types';

const imageInputSchema = z.object({
  imageUrl: z.string().trim().min(1, 'Image URL is required').max(2048, 'Image URL is too long'),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const attributeInputSchema = z.object({
  attributeId: z.string().uuid('Invalid attribute ID format'),
  value: z.union([z.string().min(1).max(255), z.number().finite(), z.boolean()]),
});

const statusSchema = z.enum(['available', 'pending', 'sold']);

function resolveAlias<T>(
  camelValue: T | undefined,
  snakeValue: T | undefined,
  ctx: z.RefinementCtx,
  field: string,
  required: boolean
): T | undefined {
  const value = camelValue !== undefined ? camelValue : snakeValue;
  if (value === undefined && required) {
    ctx.addIssue({ code: 'custom', path: [field], message: `${field} is required` });
    return undefined;
  }
  return value;
}

export const createListingSchema = z
  .object({
    modelId: z.string().uuid('Invalid model ID format').optional(),
    model_id: z.string().uuid('Invalid model ID format').optional(),
    categoryId: z.string().uuid('Invalid category ID format').optional(),
    category_id: z.string().uuid('Invalid category ID format').optional(),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().max(5000).nullable().optional(),
    year: z.number().int().min(1886, 'Year must be greater than 1885').max(2100),
    mileage: z.number().int().min(0, 'Mileage must be non-negative').max(2000000000),
    price: z.number().min(0, 'Price must be non-negative').max(9999999999999),
    condition: z.string().trim().min(1, 'Condition is required').max(30),
    transmission: z.string().trim().min(1, 'Transmission is required').max(30),
    fuelType: z.string().trim().min(1).max(30).optional(),
    fuel_type: z.string().trim().min(1).max(30).optional(),
    color: z.string().trim().min(1, 'Color is required').max(50),
    city: z.string().trim().min(1, 'City is required').max(100),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    status: statusSchema.optional(),
    images: z.array(imageInputSchema).max(20, 'A listing can have at most 20 images').optional(),
    attributes: z.array(attributeInputSchema).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    resolveAlias(data.modelId, data.model_id, ctx, 'modelId', true);
    resolveAlias(data.categoryId, data.category_id, ctx, 'categoryId', true);
    resolveAlias(data.fuelType, data.fuel_type, ctx, 'fuelType', true);

    const seen = new Set<string>();
    (data.attributes ?? []).forEach((attribute, index) => {
      if (seen.has(attribute.attributeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['attributes', index, 'attributeId'],
          message: 'Duplicate attributeId in attributes',
        });
      }
      seen.add(attribute.attributeId);
    });
  })
  .transform((data) => ({
    modelId: (data.modelId ?? data.model_id) as string,
    categoryId: (data.categoryId ?? data.category_id) as string,
    title: data.title,
    description: data.description,
    year: data.year,
    mileage: data.mileage,
    price: data.price,
    condition: data.condition,
    transmission: data.transmission,
    fuelType: (data.fuelType ?? data.fuel_type) as string,
    color: data.color,
    city: data.city,
    latitude: data.latitude,
    longitude: data.longitude,
    status: data.status,
    images: data.images,
    attributes: data.attributes,
  }));

export type CreateListingBody = z.infer<typeof createListingSchema>;

export const updateListingSchema = z
  .object({
    modelId: z.string().uuid('Invalid model ID format').optional(),
    model_id: z.string().uuid('Invalid model ID format').optional(),
    categoryId: z.string().uuid('Invalid category ID format').optional(),
    category_id: z.string().uuid('Invalid category ID format').optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).nullable().optional(),
    year: z.number().int().min(1886).max(2100).optional(),
    mileage: z.number().int().min(0).max(2000000000).optional(),
    price: z.number().min(0).max(9999999999999).optional(),
    condition: z.string().trim().min(1).max(30).optional(),
    transmission: z.string().trim().min(1).max(30).optional(),
    fuelType: z.string().trim().min(1).max(30).optional(),
    fuel_type: z.string().trim().min(1).max(30).optional(),
    color: z.string().trim().min(1).max(50).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    status: statusSchema.optional(),
    images: z.array(imageInputSchema).max(20).optional(),
    attributes: z.array(attributeInputSchema).max(50).optional(),
  })
  .superRefine((data, ctx) => {
    const hasField = Object.entries(data).some(
      ([key, value]) => value !== undefined && key !== 'model_id' && key !== 'category_id' && key !== 'fuel_type'
    );
    const hasSnakeField =
      data.model_id !== undefined || data.category_id !== undefined || data.fuel_type !== undefined;
    if (!hasField && !hasSnakeField) {
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: 'At least one field must be provided for update',
      });
    }

    const seen = new Set<string>();
    (data.attributes ?? []).forEach((attribute, index) => {
      if (seen.has(attribute.attributeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['attributes', index, 'attributeId'],
          message: 'Duplicate attributeId in attributes',
        });
      }
      seen.add(attribute.attributeId);
    });
  })
  .transform((data) => {
    const modelId = data.modelId !== undefined ? data.modelId : data.model_id;
    const categoryId = data.categoryId !== undefined ? data.categoryId : data.category_id;
    const fuelType = data.fuelType !== undefined ? data.fuelType : data.fuel_type;
    return {
      ...(modelId !== undefined && { modelId }),
      ...(categoryId !== undefined && { categoryId }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.year !== undefined && { year: data.year }),
      ...(data.mileage !== undefined && { mileage: data.mileage }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.condition !== undefined && { condition: data.condition }),
      ...(data.transmission !== undefined && { transmission: data.transmission }),
      ...(fuelType !== undefined && { fuelType }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.city !== undefined && { city: data.city }),
      ...(data.latitude !== undefined && { latitude: data.latitude }),
      ...(data.longitude !== undefined && { longitude: data.longitude }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.images !== undefined && { images: data.images }),
      ...(data.attributes !== undefined && { attributes: data.attributes }),
    };
  });

export type UpdateListingBody = z.infer<typeof updateListingSchema>;

export const listingIdParamSchema = z.object({
  id: z.string().uuid('Invalid listing ID format'),
});

export const browseListingsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50').default(20),
  sort: z.enum(LISTING_SORT_FIELDS).default('created_at'),
  cursor: z.string().trim().min(1, 'Cursor cannot be empty').optional(),
});

export type BrowseListingsQueryInput = z.infer<typeof browseListingsQuerySchema>;

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export const listingCursorSchema = z
  .object({
    sort: z.enum(LISTING_SORT_FIELDS),
    value: z.union([z.string().min(1), z.number()]),
    id: z.string().uuid('Invalid cursor listing ID format'),
  })
  .superRefine((data, ctx) => {
    if (data.sort === 'created_at') {
      const isValid =
        typeof data.value === 'string' &&
        ISO_TIMESTAMP_PATTERN.test(data.value) &&
        !Number.isNaN(Date.parse(data.value));
      if (!isValid) {
        ctx.addIssue({ code: 'custom', path: ['value'], message: 'Cursor value must be an ISO timestamp' });
      }
      return;
    }

    const numericValue = typeof data.value === 'number' ? data.value : Number(data.value);
    if (!Number.isFinite(numericValue)) {
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'Cursor value must be numeric' });
    }
  });
