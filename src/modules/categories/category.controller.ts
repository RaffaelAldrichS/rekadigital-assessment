import { Request, Response, NextFunction } from 'express';
import { CategoryService } from './category.service';

const categoryService = new CategoryService();

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tree = await categoryService.getCategoryTree();
    res.json({ data: tree });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = await categoryService.getCategoryById(id);
    res.json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await categoryService.createCategory(req.body);
    res.status(201).json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const category = await categoryService.updateCategory(id, req.body);
    res.json({ data: category });
  } catch (error) {
    next(error);
  }
}

export async function getCategoryListings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params.id as string;
    const listings = await categoryService.getCategoryListings(id);
    res.json({ data: listings });
  } catch (error) {
    next(error);
  }
}
