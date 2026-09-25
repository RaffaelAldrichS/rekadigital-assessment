import { Router } from 'express';
import { validateRequest } from '../../middleware/validation';
import { facetsQuerySchema } from '../search/search.schema';
import * as filterController from './filter.controller';
import { filterCategoryIdParamSchema } from './filter.schema';

const router = Router();

router.get(
  '/',
  validateRequest({ query: facetsQuerySchema }),
  filterController.getFacets
);

router.get(
  '/:categoryId',
  validateRequest({ params: filterCategoryIdParamSchema }),
  filterController.getCategoryFilters
);

export default router;
