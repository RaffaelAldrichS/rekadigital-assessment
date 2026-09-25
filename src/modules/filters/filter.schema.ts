import { z } from 'zod';

export const filterCategoryIdParamSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID format'),
});

export type FilterCategoryIdParams = z.infer<typeof filterCategoryIdParamSchema>;
