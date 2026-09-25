import { NotFoundError } from '../../shared/errors/app-error';
import { encodeCursor } from '../../shared/pagination/cursor';
import { buildCursor, parseCursor } from '../listings/listing.service';
import {
  BrowseListingsQuery,
  PaginatedListings,
} from '../listings/listing.types';
import { CategoryRepository } from './category.repository';
import { Category, CategoryNode, CreateCategoryInput, UpdateCategoryInput } from './category.types';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const nodeMap = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const cat of categories) {
    nodeMap.set(cat.id, { ...cat, children: [] });
  }

  for (const cat of categories) {
    const node = nodeMap.get(cat.id)!;
    if (cat.parentId === null) {
      roots.push(node);
    } else {
      const parent = nodeMap.get(cat.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
  }

  return roots;
}

export class CategoryService {
  constructor(private categoryRepo: CategoryRepository = new CategoryRepository()) {}

  async getCategoryTree(): Promise<CategoryNode[]> {
    const allCategories = await this.categoryRepo.findAll();
    return buildCategoryTree(allCategories);
  }

  async getCategoryById(id: string): Promise<CategoryNode> {
    const category = await this.categoryRepo.findById(id);
    if (!category) {
      throw new NotFoundError('Category not found');
    }
    const children = await this.categoryRepo.findDirectChildren(id);
    const childNodes: CategoryNode[] = children.map((child) => ({ ...child, children: [] }));
    return {
      ...category,
      children: childNodes,
    };
  }

  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const slug = input.slug && input.slug.trim().length > 0 ? input.slug.trim() : slugify(input.name);
    const parentId = input.parentId !== undefined ? input.parentId : null;

    return this.categoryRepo.create({
      name: input.name,
      slug,
      parentId,
    });
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const updatePayload: { name?: string; slug?: string; parentId?: string | null } = {};

    if (input.name !== undefined) {
      updatePayload.name = input.name;
    }
    if (input.slug !== undefined) {
      updatePayload.slug = input.slug.trim().length > 0 ? input.slug.trim() : slugify(input.name || '');
    }
    if (input.parentId !== undefined) {
      updatePayload.parentId = input.parentId;
    }

    return this.categoryRepo.update(id, updatePayload);
  }

  async getCategoryListings(id: string, query: BrowseListingsQuery): Promise<PaginatedListings> {
    const cursor = query.cursor !== undefined ? parseCursor(query.cursor, query.sort) : null;
    const rows = await this.categoryRepo.findListingsByCategoryId(id, {
      maxRows: query.limit + 1,
      sort: query.sort,
      cursor,
    });
    const hasNextPage = rows.length > query.limit;
    const data = hasNextPage ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasNextPage && data.length > 0 ? encodeCursor(buildCursor(data[data.length - 1], query.sort)) : null;

    return {
      data,
      pagination: { nextCursor, hasNextPage },
    };
  }
}
