import { Router } from 'express';
import { validateRequest } from '../../middleware/validation';
import * as searchController from './search.controller';
import { searchListingsQuerySchema, suggestQuerySchema } from './search.schema';

const router = Router();

router.get(
  '/search/suggest',
  validateRequest({ query: suggestQuerySchema }),
  searchController.suggest
);

router.get(
  '/search',
  validateRequest({ query: searchListingsQuerySchema }),
  searchController.searchListings
);

export default router;
