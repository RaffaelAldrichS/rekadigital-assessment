import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { buildCategoryTree, slugify } from '../src/modules/categories/category.service';
import { Category } from '../src/modules/categories/category.types';
import { CategoryRepository } from '../src/modules/categories/category.repository';

describe('Ticket 03 — Category Module & Closure Table', () => {
  describe('Category Helpers & Utilities', () => {
    it('slugify converts strings correctly', () => {
      expect(slugify('SUVs & Crossovers')).toBe('suvs-crossovers');
      expect(slugify(' Electric Cars ')).toBe('electric-cars');
      expect(slugify(' Sedan / Hatchback ')).toBe('sedan-hatchback');
    });

    it('buildCategoryTree constructs arbitrary-depth nested category tree', () => {
      const flatCategories: Category[] = [
        {
          id: 'cat-root-1',
          parentId: null,
          name: 'Vehicles',
          slug: 'vehicles',
          createdAt: '2026-09-25T00:00:00.000Z',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
        {
          id: 'cat-child-1',
          parentId: 'cat-root-1',
          name: 'Cars',
          slug: 'cars',
          createdAt: '2026-09-25T00:00:00.000Z',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
        {
          id: 'cat-child-2',
          parentId: 'cat-child-1',
          name: 'SUVs',
          slug: 'suvs',
          createdAt: '2026-09-25T00:00:00.000Z',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
        {
          id: 'cat-child-3',
          parentId: 'cat-child-2',
          name: '7-Seater SUVs',
          slug: '7-seater-suvs',
          createdAt: '2026-09-25T00:00:00.000Z',
          updatedAt: '2026-09-25T00:00:00.000Z',
        },
      ];

      const tree = buildCategoryTree(flatCategories);

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('cat-root-1');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('cat-child-1');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].id).toBe('cat-child-2');
      expect(tree[0].children[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].children[0].id).toBe('cat-child-3');
      expect(tree[0].children[0].children[0].children[0].children).toEqual([]);
    });
  });

  describe('Category Repository & Transactional Operations', () => {
    let mockClient: any;
    let categoryRepo: CategoryRepository;

    beforeEach(() => {
      mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);
      categoryRepo = new CategoryRepository();
    });

    it('create root category executes correct SQL and closure table self-row', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO categories')) {
          return Promise.resolve({
            rows: [
              {
                id: '11111111-1111-4111-a111-111111111111',
                parentId: null,
                name: 'Trucks',
                slug: 'trucks',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const cat = await categoryRepo.create({
        name: 'Trucks',
        slug: 'trucks',
        parentId: null,
      });

      expect(cat.name).toBe('Trucks');
      expect(cat.parentId).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO category_closure'),
        ['11111111-1111-4111-a111-111111111111']
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('create nested category inherits ancestor relationships in closure table', async () => {
      const parentId = '22222222-2222-4222-a222-222222222222';
      const childId = '33333333-3333-4333-a333-333333333333';

      mockClient.query.mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('SELECT id FROM categories WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: parentId }] });
        }
        if (sql.includes('INSERT INTO categories')) {
          return Promise.resolve({
            rows: [
              {
                id: childId,
                parentId,
                name: 'Pickup Trucks',
                slug: 'pickup-trucks',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const cat = await categoryRepo.create({
        name: 'Pickup Trucks',
        slug: 'pickup-trucks',
        parentId,
      });

      expect(cat.parentId).toBe(parentId);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT ancestor_id, $1, depth + 1'),
        [childId, parentId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('prevents self-parent assignment on update', async () => {
      const catId = '44444444-4444-4444-a444-444444444444';

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, parent_id as "parentId"')) {
          return Promise.resolve({
            rows: [{ id: catId, parentId: null, name: 'Bikes', slug: 'bikes' }],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(categoryRepo.update(catId, { parentId: catId })).rejects.toThrow(
        'Category cannot be set as its own parent'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('prevents cycle assignment when setting parent to a descendant', async () => {
      const catId = '55555555-5555-4555-a555-555555555555';
      const descendantId = '66666666-6666-4666-a666-666666666666';

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, parent_id as "parentId"')) {
          return Promise.resolve({
            rows: [{ id: catId, parentId: null, name: 'Cars', slug: 'cars' }],
          });
        }
        if (sql.includes('SELECT id FROM categories WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: descendantId }] });
        }
        if (sql.includes('SELECT 1 FROM category_closure WHERE ancestor_id = $1 AND descendant_id = $2')) {
          // descendantId is indeed a descendant of catId
          return Promise.resolve({ rows: [{ 1: 1 }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await expect(categoryRepo.update(catId, { parentId: descendantId })).rejects.toThrow(
        'Cannot set parent category to a descendant category (cycle detected)'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('parent reassignment updates closure relationships transactionally', async () => {
      const catId = '77777777-7777-4777-a777-777777777777';
      const newParentId = '88888888-8888-4888-a888-888888888888';

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('SELECT id, parent_id as "parentId"')) {
          return Promise.resolve({
            rows: [{ id: catId, parentId: null, name: 'Sedan', slug: 'sedan' }],
          });
        }
        if (sql.includes('SELECT id FROM categories WHERE id = $1')) {
          return Promise.resolve({ rows: [{ id: newParentId }] });
        }
        if (sql.includes('SELECT 1 FROM category_closure WHERE ancestor_id = $1 AND descendant_id = $2')) {
          return Promise.resolve({ rows: [] });
        }
        if (sql.includes('UPDATE categories')) {
          return Promise.resolve({
            rows: [
              {
                id: catId,
                parentId: newParentId,
                name: 'Sedan',
                slug: 'sedan',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const updated = await categoryRepo.update(catId, { parentId: newParentId });

      expect(updated.parentId).toBe(newParentId);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM category_closure'),
        [catId]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO category_closure'),
        [newParentId, catId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('HTTP API Endpoints for Categories', () => {
    it('GET /api/v1/categories returns category tree', async () => {
      vi.spyOn(pool, 'query').mockImplementation((sql: any) => {
        const queryStr = typeof sql === 'string' ? sql : sql.text;
        if (queryStr.includes('FROM categories')) {
          return Promise.resolve({
            rows: [
              {
                id: '4ba66f77-d769-488f-b8fc-cb02d1233fe6',
                parentId: null,
                name: 'Cars',
                slug: 'cars',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'a60effa6-45f7-48ae-bcef-079ad5a2b91d',
                parentId: '4ba66f77-d769-488f-b8fc-cb02d1233fe6',
                name: 'SUVs',
                slug: 'suvs',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app).get('/api/v1/categories');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Cars');
      expect(res.body.data[0].children).toHaveLength(1);
      expect(res.body.data[0].children[0].name).toBe('SUVs');
    });

    it('GET /api/v1/categories/:id returns category detail and direct children', async () => {
      const catId = '4ba66f77-d769-488f-b8fc-cb02d1233fe6';

      vi.spyOn(pool, 'query').mockImplementation((sql: any, params?: any[]) => {
        const queryStr = typeof sql === 'string' ? sql : sql.text;
        if (queryStr.includes('WHERE id = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: catId,
                parentId: null,
                name: 'Cars',
                slug: 'cars',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          } as any);
        }
        if (queryStr.includes('WHERE parent_id = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: 'a60effa6-45f7-48ae-bcef-079ad5a2b91d',
                parentId: catId,
                name: 'SUVs',
                slug: 'suvs',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app).get(`/api/v1/categories/${catId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(catId);
      expect(res.body.data.children).toHaveLength(1);
      expect(res.body.data.children[0].name).toBe('SUVs');
    });

    it('GET /api/v1/categories/:id returns 404 for non-existent category', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const nonExistentId = '6cc772b2-0d6d-4e88-a5f8-8513a1e561b2';
      const res = await request(app).get(`/api/v1/categories/${nonExistentId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('POST /api/v1/categories validates request body', async () => {
      const res = await request(app).post('/api/v1/categories').send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/categories/:id/listings returns listings in subtree', async () => {
      const catId = '4ba66f77-d769-488f-b8fc-cb02d1233fe6';

      vi.spyOn(pool, 'query').mockImplementation((sql: any) => {
        const queryStr = typeof sql === 'string' ? sql : sql.text;
        if (queryStr.includes('SELECT id FROM categories')) {
          return Promise.resolve({ rows: [{ id: catId }] } as any);
        }
        if (queryStr.includes('FROM listings l')) {
          return Promise.resolve({
            rows: [
              {
                id: 'e131ee68-3f12-4c32-be33-08268b4f9222',
                modelId: '2a48536c-d889-49a9-9dce-cdb7f958d4d1',
                categoryId: 'a60effa6-45f7-48ae-bcef-079ad5a2b91d',
                title: 'Toyota Fortuner 2.8',
                price: '550000000.00',
                status: 'available',
              },
            ],
          } as any);
        }
        return Promise.resolve({ rows: [] } as any);
      });

      const res = await request(app).get(`/api/v1/categories/${catId}/listings`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Toyota Fortuner 2.8');
    });
  });
});
