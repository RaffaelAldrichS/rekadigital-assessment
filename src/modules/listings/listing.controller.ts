import { Request, Response, NextFunction } from 'express';
import { ListingService } from './listing.service';
import { BrowseListingsQueryInput } from './listing.schema';
import { BrowseListingsQuery, CreateListingInput, UpdateListingInput } from './listing.types';

const listingService = new ListingService();

export async function browseListings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as BrowseListingsQueryInput;
    const result = await listingService.browseListings(query as BrowseListingsQuery);
    res.json({ data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
}

export async function getListingById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const listing = await listingService.getListingById(id);
    res.json({ data: listing });
  } catch (error) {
    next(error);
  }
}

export async function createListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const listing = await listingService.createListing(req.body as CreateListingInput);
    res.status(201).json({ data: listing });
  } catch (error) {
    next(error);
  }
}

export async function updateListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const listing = await listingService.updateListing(id, req.body as UpdateListingInput);
    res.json({ data: listing });
  } catch (error) {
    next(error);
  }
}

export async function deleteListing(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    await listingService.deleteListing(id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
