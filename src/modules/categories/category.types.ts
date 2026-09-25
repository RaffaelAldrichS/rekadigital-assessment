export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface CategoryNode extends Category {
  children: CategoryNode[];
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  parentId?: string | null;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  parentId?: string | null;
}

export interface ClosureRow {
  ancestor_id: string;
  descendant_id: string;
  depth: number;
}
