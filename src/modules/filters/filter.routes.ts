import { Router } from 'express';
import { validateRequest } from '../../middleware/validation';
import * as filterController from './filter.controller';
import { filterCategoryIdParamSchema } from './filter.schema';

const router = Router();

router.get(
  '/:categoryId',
  validateRequest({ params: filterCategoryIdParamSchema }),
  filterController.getCategoryFilters
);

export default router;
