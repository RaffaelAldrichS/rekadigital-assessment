import { Router } from 'express';
import { validateRequest } from '../../middleware/validation';
import {
  browseListingsQuerySchema,
  createListingSchema,
  listingIdParamSchema,
  updateListingSchema,
} from './listing.schema';
import * as listingController from './listing.controller';

const router = Router();

router.get(
  '/',
  validateRequest({ query: browseListingsQuerySchema }),
  listingController.browseListings
);

router.post(
  '/',
  validateRequest({ body: createListingSchema }),
  listingController.createListing
);

router.get(
  '/:id',
  validateRequest({ params: listingIdParamSchema }),
  listingController.getListingById
);

router.patch(
  '/:id',
  validateRequest({ params: listingIdParamSchema, body: updateListingSchema }),
  listingController.updateListing
);

router.delete(
  '/:id',
  validateRequest({ params: listingIdParamSchema }),
  listingController.deleteListing
);

export default router;
