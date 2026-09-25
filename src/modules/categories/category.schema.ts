import { z } from 'zod';

export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    slug: z.string().trim().min(1).max(140).optional(),
    parentId: z.string().uuid('Invalid parent ID format').nullable().optional(),
    parent_id: z.string().uuid('Invalid parent ID format').nullable().optional(),
  })
  .transform((data) => ({
    name: data.name,
    slug: data.slug,
    parentId: data.parentId !== undefined ? data.parentId : data.parent_id,
  }));

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(1).max(140).optional(),
    parentId: z.string().uuid('Invalid parent ID format').nullable().optional(),
    parent_id: z.string().uuid('Invalid parent ID format').nullable().optional(),
  })
  .transform((data) => {
    const parentId = data.parentId !== undefined ? data.parentId : data.parent_id;
    return {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.slug !== undefined && { slug: data.slug }),
      ...(parentId !== undefined && { parentId }),
    };
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('Invalid category ID format'),
});
