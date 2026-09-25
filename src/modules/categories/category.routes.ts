import { Router } from 'express';
import { validateRequest } from '../../middleware/validation';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
} from './category.schema';
import * as categoryController from './category.controller';

const router = Router();

router.get('/', categoryController.getCategories);

router.post(
  '/',
  validateRequest({ body: createCategorySchema }),
  categoryController.createCategory
);

router.get(
  '/:id',
  validateRequest({ params: categoryIdParamSchema }),
  categoryController.getCategoryById
);

router.patch(
  '/:id',
  validateRequest({ params: categoryIdParamSchema, body: updateCategorySchema }),
  categoryController.updateCategory
);

router.get(
  '/:id/listings',
  validateRequest({ params: categoryIdParamSchema }),
  categoryController.getCategoryListings
);

export default router;
