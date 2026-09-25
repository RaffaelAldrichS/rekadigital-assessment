import { NextFunction, Request, Response } from 'express';
import { FilterService } from './filter.service';

const filterService = new FilterService();

export async function getCategoryFilters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categoryId = req.params.categoryId as string;
    const metadata = await filterService.getCategoryFilters(categoryId);
    res.json({ data: metadata });
  } catch (error) {
    next(error);
  }
}
