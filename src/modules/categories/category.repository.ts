import { pool } from '../../db/pool';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/app-error';
import { buildDynamicFilterPredicates } from '../filters/filter-predicate';
import { ValidatedDynamicFilter } from '../filters/filter.types';
import {
  Listing,
  ListingCursor,
  ListingSortField,
} from '../listings/listing.types';
import { Category, ClosureRow } from './category.types';

const CATEGORY_LISTING_SORT_COLUMNS: Record<ListingSortField, string> = {
  created_at: 'l.created_at',
  price: 'l.price',
  year: 'l.year',
  mileage: 'l.mileage',
};

function utcTimestamp(expr: string, alias: string): string {
  return `to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "${alias}"`;
}

export class CategoryRepository {
  async findAll(): Promise<Category[]> {
    const result = await pool.query<Category>(`
      SELECT
        id,
        parent_id as "parentId",
        name,
        slug,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM categories
      ORDER BY name ASC, id ASC;
    `);
    return result.rows;
  }

  async findById(id: string): Promise<Category | null> {
    const result = await pool.query<Category>(
      `
      SELECT
        id,
        parent_id as "parentId",
        name,
        slug,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM categories
      WHERE id = $1;
    `,
      [id]
    );
    return result.rows[0] || null;
  }

  async findDirectChildren(parentId: string): Promise<Category[]> {
    const result = await pool.query<Category>(
      `
      SELECT
        id,
        parent_id as "parentId",
        name,
        slug,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM categories
      WHERE parent_id = $1
      ORDER BY name ASC, id ASC;
    `,
      [parentId]
    );
    return result.rows;
  }

  async create(input: { name: string; slug: string; parentId: string | null }): Promise<Category> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (input.parentId !== null) {
        const parentRes = await client.query('SELECT id FROM categories WHERE id = $1', [input.parentId]);
        if (parentRes.rows.length === 0) {
          throw new NotFoundError('Parent category not found');
        }
      }

      const insertRes = await client.query<Category>(
        `
        INSERT INTO categories (name, slug, parent_id)
        VALUES ($1, $2, $3)
        RETURNING id, parent_id as "parentId", name, slug, created_at as "createdAt", updated_at as "updatedAt";
      `,
        [input.name, input.slug, input.parentId]
      );
      const newCategory = insertRes.rows[0];

      await client.query(
        `
        INSERT INTO category_closure (ancestor_id, descendant_id, depth)
        VALUES ($1, $1, 0);
      `,
        [newCategory.id]
      );

      if (input.parentId !== null) {
        await client.query(
          `
          INSERT INTO category_closure (ancestor_id, descendant_id, depth)
          SELECT ancestor_id, $1, depth + 1
          FROM category_closure
          WHERE descendant_id = $2;
        `,
          [newCategory.id, input.parentId]
        );
      }

      await client.query('COMMIT');
      return newCategory;
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) {
        throw error;
      }
      if (error.code === '23505') {
        throw new ConflictError('Category with this slug already exists under the specified parent');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    input: { name?: string; slug?: string; parentId?: string | null }
  ): Promise<Category> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const currRes = await client.query<Category>(
        `
        SELECT id, parent_id as "parentId", name, slug
        FROM categories
        WHERE id = $1
        FOR UPDATE;
      `,
        [id]
      );

      if (currRes.rows.length === 0) {
        throw new NotFoundError('Category not found');
      }

      const currentCategory = currRes.rows[0];

      if (input.parentId !== undefined && input.parentId !== currentCategory.parentId) {
        if (input.parentId === id) {
          throw new ValidationError('Category cannot be set as its own parent');
        }

        if (input.parentId !== null) {
          const parentRes = await client.query('SELECT id FROM categories WHERE id = $1', [input.parentId]);
          if (parentRes.rows.length === 0) {
            throw new NotFoundError('Parent category not found');
          }

          const cycleRes = await client.query(
            `
            SELECT 1 FROM category_closure WHERE ancestor_id = $1 AND descendant_id = $2;
          `,
            [id, input.parentId]
          );

          if (cycleRes.rows.length > 0) {
            throw new ConflictError('Cannot set parent category to a descendant category (cycle detected)');
          }
        }

        await client.query(
          `
          DELETE FROM category_closure
          WHERE descendant_id IN (
              SELECT descendant_id FROM category_closure WHERE ancestor_id = $1
          )
          AND ancestor_id IN (
              SELECT ancestor_id FROM category_closure WHERE descendant_id = $1 AND ancestor_id != $1
          );
        `,
          [id]
        );

        if (input.parentId !== null) {
          await client.query(
            `
            INSERT INTO category_closure (ancestor_id, descendant_id, depth)
            SELECT supertree.ancestor_id, subtree.descendant_id, supertree.depth + subtree.depth + 1
            FROM category_closure AS supertree
            CROSS JOIN category_closure AS subtree
            WHERE supertree.descendant_id = $1
              AND subtree.ancestor_id = $2;
          `,
            [input.parentId, id]
          );
        }
      }

      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (input.name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        params.push(input.name);
      }
      if (input.slug !== undefined) {
        updateFields.push(`slug = $${paramIndex++}`);
        params.push(input.slug);
      }
      if (input.parentId !== undefined) {
        updateFields.push(`parent_id = $${paramIndex++}`);
        params.push(input.parentId);
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      const updateSql = `
        UPDATE categories
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, parent_id as "parentId", name, slug, created_at as "createdAt", updated_at as "updatedAt";
      `;

      const updateRes = await client.query<Category>(updateSql, params);
      await client.query('COMMIT');
      return updateRes.rows[0];
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) {
        throw error;
      }
      if (error.code === '23505') {
        throw new ConflictError('Category with this slug already exists under the specified parent');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async findListingsByCategoryId(
    categoryId: string,
    params: {
      maxRows: number;
      sort: ListingSortField;
      cursor: ListingCursor | null;
      make?: string;
      minPrice?: number;
      maxPrice?: number;
      minYear?: number;
      maxYear?: number;
      fuelType?: string;
      status?: Exclude<Listing['status'], 'removed'>;
      dynamicFilters?: ValidatedDynamicFilter[];
    }
  ): Promise<Listing[]> {
    const catCheck = await pool.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
    if (catCheck.rows.length === 0) {
      throw new NotFoundError('Category not found');
    }

    const sortColumn = CATEGORY_LISTING_SORT_COLUMNS[params.sort];
    const values: unknown[] = [categoryId];
    const conditions = [`cc.ancestor_id = $1`, `l.status <> 'removed'`];
    const joins = [
      'JOIN models m ON m.id = l.model_id',
      'JOIN makes mk ON mk.id = m.make_id',
    ];

    if (params.make !== undefined) {
      values.push(params.make);
      const parameter = values.length;
      conditions.push(`(mk.id::text = $${parameter} OR mk.slug = $${parameter} OR LOWER(mk.name) = LOWER($${parameter}))`);
    }
    if (params.minPrice !== undefined) {
      values.push(params.minPrice);
      conditions.push(`l.price >= $${values.length}`);
    }
    if (params.maxPrice !== undefined) {
      values.push(params.maxPrice);
      conditions.push(`l.price <= $${values.length}`);
    }
    if (params.minYear !== undefined) {
      values.push(params.minYear);
      conditions.push(`l.year >= $${values.length}`);
    }
    if (params.maxYear !== undefined) {
      values.push(params.maxYear);
      conditions.push(`l.year <= $${values.length}`);
    }
    if (params.fuelType !== undefined) {
      values.push(params.fuelType);
      conditions.push(`l.fuel_type = $${values.length}`);
    }
    if (params.status !== undefined) {
      values.push(params.status);
      conditions.push(`l.status = $${values.length}`);
    }
    if (params.cursor) {
      values.push(params.cursor.value, params.cursor.id);
      conditions.push(`(${sortColumn}, l.id) < ($${values.length - 1}, $${values.length})`);
    }
    conditions.push(...buildDynamicFilterPredicates(params.dynamicFilters ?? [], values));
    values.push(params.maxRows);

    const result = await pool.query<Listing>(
      `
      SELECT
        l.id,
        l.model_id as "modelId",
        l.category_id as "categoryId",
        l.title,
        l.description,
        l.year,
        l.mileage,
        l.price,
        l.condition,
        l.transmission,
        l.fuel_type as "fuelType",
        l.color,
        l.city,
        l.latitude,
        l.longitude,
        l.status,
        ${utcTimestamp('l.created_at', 'createdAt')},
        ${utcTimestamp('l.updated_at', 'updatedAt')}
      FROM listings l
      JOIN category_closure cc ON l.category_id = cc.descendant_id
      ${joins.join('\n      ')}
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${sortColumn} DESC, l.id DESC
      LIMIT $${values.length};
    `,
      values
    );

    return result.rows;
  }

  async getClosureRows(categoryId?: string): Promise<ClosureRow[]> {
    if (categoryId) {
      const res = await pool.query<ClosureRow>(
        `
        SELECT ancestor_id, descendant_id, depth
        FROM category_closure
        WHERE ancestor_id = $1 OR descendant_id = $1
        ORDER BY depth ASC;
      `,
        [categoryId]
      );
      return res.rows;
    }
    const res = await pool.query<ClosureRow>(
      `SELECT ancestor_id, descendant_id, depth FROM category_closure ORDER BY ancestor_id, descendant_id;`
    );
    return res.rows;
  }
}
