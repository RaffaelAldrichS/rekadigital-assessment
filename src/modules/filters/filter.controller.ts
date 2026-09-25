import { NextFunction, Request, Response } from 'express';
import { FacetsQueryInput } from '../search/search.schema';
import { FacetsQuery } from '../search/search.types';
import { SearchService } from '../search/search.service';
import { FilterService } from './filter.service';

const filterService = new FilterService();
const searchService = new SearchService();

export async function getFacets(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = req.query as unknown as FacetsQueryInput;
    const facets = await searchService.getFacets(query as FacetsQuery);
    res.json({ data: facets });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryFilters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categoryId = req.params.categoryId as string;
    const metadata = await filterService.getCategoryFilters(categoryId);
    res.json({ data: metadata });
  } catch (error) {
    next(error);
  }
}
