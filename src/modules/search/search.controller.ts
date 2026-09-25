import { NextFunction, Request, Response } from 'express';
import { SearchListingsQueryInput, SuggestQueryInput } from './search.schema';
import { SearchService } from './search.service';
import { SearchListingsQuery, SuggestQuery } from './search.types';

const searchService = new SearchService();

export async function searchListings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as SearchListingsQueryInput;
    const result = await searchService.searchListings(query as SearchListingsQuery);
    res.json({ data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
}

export async function suggest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as SuggestQueryInput;
    const suggestions = await searchService.suggest(query as SuggestQuery);
    res.json({ data: { q: query.q, suggestions } });
  } catch (error) {
    next(error);
  }
}
