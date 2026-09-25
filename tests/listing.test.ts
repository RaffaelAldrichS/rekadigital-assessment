import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { decodeCursor, encodeCursor } from '../src/shared/pagination/cursor';
import { ValidationError, NotFoundError } from '../src/shared/errors/app-error';
import {
  browseListingsQuerySchema,
  createListingSchema,
  listingCursorSchema,
  updateListingSchema,
} from '../src/modules/listings/listing.schema';
import { buildCursor, parseCursor } from '../src/modules/listings/listing.service';
import { ListingRepository } from '../src/modules/listings/listing.repository';
import { Listing } from '../src/modules/listings/listing.types';

const LISTING_ID = 'e131ee68-3f12-4c32-be33-08268b4f9222';
const MODEL_ID = '2a48536c-d889-49a9-9dce-cdb7f958d4d1';
const CATEGORY_ID = 'a60effa6-45f7-48ae-bcef-079ad5a2b91d';
const MAKE_ID = '9c3f1a72-1b5d-4e88-9a2c-6d4f8e1b3a55';
const ATTRIBUTE_ID = 'b7e4a1c2-9d3f-4a6e-8c1b-5f2e9d7a4c31';

const validCreateBody = {
  modelId: MODEL_ID,
  categoryId: CATEGORY_ID,
  title: 'Toyota Fortuner 2.8 GR Sport',
  description: 'First hand, low mileage',
  year: 2021,
  mileage: 25000,
  price: 550000000,
  condition: 'used',
  transmission: 'automatic',
  fuelType: 'diesel',
  color: 'Black',
  city: 'Jakarta',
  images: [{ imageUrl: 'https://cdn.example.com/1.jpg' }],
  attributes: [{ attributeId: ATTRIBUTE_ID, value: 'diesel' }],
};

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LISTING_ID,
    modelId: MODEL_ID,
    categoryId: CATEGORY_ID,
    title: 'Toyota Fortuner 2.8 GR Sport',
    description: 'First hand, low mileage',
    year: 2021,
    mileage: 25000,
    price: '550000000.00',
    condition: 'used',
    transmission: 'automatic',
    fuelType: 'diesel',
    color: 'Black',
    city: 'Jakarta',
    latitude: null,
    longitude: null,
    status: 'available',
    createdAt: '2026-09-25T10:00:00.000000Z',
    updatedAt: '2026-09-25T10:00:00.000000Z',
    modelName: 'Fortuner',
    modelSlug: 'fortuner',
    makeId: MAKE_ID,
    makeName: 'Toyota',
    makeSlug: 'toyota',
    categoryName: 'SUVs',
    categorySlug: 'suvs',
    categoryParentId: CATEGORY_ID,
    ...overrides,
  };
}

function createMockClient(options: { failOnAttributeInsert?: boolean; modelMissing?: boolean } = {}): any {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };
  client.query.mockImplementation((sql: string, _params?: any[]) => {
    const text = typeof sql === 'string' ? sql : String(sql);
    if (text.includes('SELECT id FROM models')) {
      return Promise.resolve({ rows: options.modelMissing ? [] : [{ id: MODEL_ID }] });
    }
    if (text.includes('SELECT id FROM categories')) {
      return Promise.resolve({ rows: [{ id: CATEGORY_ID }] });
    }
    if (text.includes('INSERT INTO listings')) {
      return Promise.resolve({ rows: [{ id: LISTING_ID }] });
    }
    if (text.includes('INSERT INTO listing_images')) {
      return Promise.resolve({ rows: [] });
    }
    if (text.includes('FROM filter_attributes')) {
      return Promise.resolve({
        rows: [{ id: ATTRIBUTE_ID, key: 'fuel_type', type: 'enum', mapped: ATTRIBUTE_ID }],
      });
    }
    if (text.includes('INSERT INTO listing_attribute_values')) {
      if (options.failOnAttributeInsert) {
        return Promise.reject(new Error('simulated attribute insert failure'));
      }
      return Promise.resolve({ rows: [] });
    }
    if (text.includes('JOIN models m')) {
      return Promise.resolve({ rows: [detailRow()] });
    }
    if (text.includes('FROM listing_images')) {
      return Promise.resolve({ rows: [] });
    }
    if (text.includes('FROM listing_attribute_values')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
  return client;
}

function mockDetailPoolQuery(imageRows: any[] = [], attributeRows: any[] = []) {
  return vi.spyOn(pool, 'query').mockImplementation(((sql: any) => {
    const text = typeof sql === 'string' ? sql : sql.text;
    if (text.includes('JOIN models m')) {
      return Promise.resolve({ rows: [detailRow()] } as any);
    }
    if (text.includes('FROM listing_images')) {
      return Promise.resolve({ rows: imageRows } as any);
    }
    if (text.includes('FROM listing_attribute_values')) {
      return Promise.resolve({ rows: attributeRows } as any);
    }
    return Promise.resolve({ rows: [] } as any);
  }) as any);
}

describe('Ticket 04 — Listing CRUD & Cursor Pagination', () => {
  describe('Cursor helpers', () => {
    it('encodeCursor produces base64url output that roundtrips', () => {
      const payload = { sort: 'created_at', value: '2026-09-25T10:00:00.000000Z', id: LISTING_ID };
      const encoded = encodeCursor(payload);

      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(decodeCursor(encoded)).toEqual(payload);
    });

    it('parseCursor decodes a valid cursor payload', () => {
      const encoded = encodeCursor({ sort: 'created_at', value: '2026-09-25T10:00:00.000000Z', id: LISTING_ID });

      const cursor = parseCursor(encoded, 'created_at');

      expect(cursor).toEqual({ sort: 'created_at', value: '2026-09-25T10:00:00.000000Z', id: LISTING_ID });
    });

    it('parseCursor rejects malformed cursors', () => {
      expect(() => parseCursor('!!!not-base64!!!', 'created_at')).toThrow(ValidationError);
      expect(() => parseCursor(encodeCursor([1, 2, 3]), 'created_at')).toThrow('Cursor is invalid or malformed');
      expect(() => parseCursor(encodeCursor({ foo: 'bar' }), 'created_at')).toThrow('Cursor is invalid or malformed');
      expect(() =>
        parseCursor(encodeCursor({ sort: 'created_at', value: 'not-a-date', id: LISTING_ID }), 'created_at')
      ).toThrow('Cursor is invalid or malformed');
      expect(() =>
        parseCursor(encodeCursor({ sort: 'price', value: '1000', id: LISTING_ID }), 'created_at')
      ).toThrow('Cursor does not match the requested sort order');
    });

    it('buildCursor captures the complete ordering state per sort field', () => {
      const row = {
        id: LISTING_ID,
        createdAt: '2026-09-25T10:00:00.000000Z',
        price: '550000000.00',
        year: 2021,
        mileage: 25000,
      } as Listing;

      expect(buildCursor(row, 'created_at')).toEqual({
        sort: 'created_at',
        value: '2026-09-25T10:00:00.000000Z',
        id: LISTING_ID,
      });
      expect(buildCursor(row, 'price')).toEqual({ sort: 'price', value: '550000000.00', id: LISTING_ID });
      expect(buildCursor(row, 'year')).toEqual({ sort: 'year', value: 2021, id: LISTING_ID });
      expect(buildCursor(row, 'mileage')).toEqual({ sort: 'mileage', value: 25000, id: LISTING_ID });
    });
  });

  describe('Request validation schemas', () => {
    it('createListingSchema accepts a valid payload', () => {
      const parsed = createListingSchema.safeParse(validCreateBody);
      expect(parsed.success).toBe(true);
    });

    it('createListingSchema accepts snake_case aliases', () => {
      const parsed = createListingSchema.safeParse({
        ...validCreateBody,
        modelId: undefined,
        model_id: MODEL_ID,
        categoryId: undefined,
        category_id: CATEGORY_ID,
        fuelType: undefined,
        fuel_type: 'diesel',
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.modelId).toBe(MODEL_ID);
        expect(parsed.data.categoryId).toBe(CATEGORY_ID);
        expect(parsed.data.fuelType).toBe('diesel');
      }
    });

    it('createListingSchema rejects invalid payloads', () => {
      expect(createListingSchema.safeParse({}).success).toBe(false);
      expect(createListingSchema.safeParse({ ...validCreateBody, modelId: 'nope' }).success).toBe(false);
      expect(createListingSchema.safeParse({ ...validCreateBody, year: 1500 }).success).toBe(false);
      expect(createListingSchema.safeParse({ ...validCreateBody, price: -1 }).success).toBe(false);
      expect(createListingSchema.safeParse({ ...validCreateBody, title: '' }).success).toBe(false);
      expect(
        createListingSchema.safeParse({
          ...validCreateBody,
          attributes: [
            { attributeId: ATTRIBUTE_ID, value: 'a' },
            { attributeId: ATTRIBUTE_ID, value: 'b' },
          ],
        }).success
      ).toBe(false);
    });

    it('updateListingSchema requires at least one field', () => {
      expect(updateListingSchema.safeParse({}).success).toBe(false);
      expect(updateListingSchema.safeParse({ title: 'Updated title' }).success).toBe(true);
    });

    it('browseListingsQuerySchema applies defaults and bounds', () => {
      expect(browseListingsQuerySchema.parse({})).toEqual({ limit: 20, sort: 'created_at' });
      expect(browseListingsQuerySchema.parse({ limit: '5' })).toEqual({ limit: 5, sort: 'created_at' });
      expect(browseListingsQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
      expect(browseListingsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
      expect(browseListingsQuerySchema.safeParse({ sort: 'sqli;drop' }).success).toBe(false);
      expect(browseListingsQuerySchema.safeParse({ sort: 'created_at' }).success).toBe(true);
    });

    it('listingCursorSchema rejects non-numeric values for numeric sorts', () => {
      expect(
        listingCursorSchema.safeParse({ sort: 'price', value: 'not-a-number', id: LISTING_ID }).success
      ).toBe(false);
      expect(listingCursorSchema.safeParse({ sort: 'price', value: '550000000.00', id: LISTING_ID }).success).toBe(
        true
      );
      expect(listingCursorSchema.safeParse({ sort: 'year', value: 2021, id: LISTING_ID }).success).toBe(true);
    });
  });

  describe('Listing repository — transactional writes', () => {
    let mockClient: any;
    let listingRepo: ListingRepository;

    beforeEach(() => {
      listingRepo = new ListingRepository();
    });

    it('create runs in a transaction and writes listing, images, and attributes', async () => {
      mockClient = createMockClient();
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      const listing = await listingRepo.create(validCreateBody as any);

      expect(listing.id).toBe(LISTING_ID);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO listings'),
        expect.arrayContaining([MODEL_ID, CATEGORY_ID])
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO listing_images'),
        [LISTING_ID, 'https://cdn.example.com/1.jpg', 0]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO listing_attribute_values'),
        [LISTING_ID, ATTRIBUTE_ID, 'diesel', null, null]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('create rolls back the whole transaction when a related write fails', async () => {
      mockClient = createMockClient({ failOnAttributeInsert: true });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(listingRepo.create(validCreateBody as any)).rejects.toThrow(
        'simulated attribute insert failure'
      );

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('create rejects a missing model with 404 and rolls back', async () => {
      mockClient = createMockClient({ modelMissing: true });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(listingRepo.create(validCreateBody as any)).rejects.toThrow(NotFoundError);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('create rejects attributes that are not mapped to the listing category', async () => {
      mockClient = createMockClient();
      mockClient.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('SELECT fa.id, fa.key, fa.type')) {
          return Promise.resolve({
            rows: [{ id: ATTRIBUTE_ID, key: 'sunroof', type: 'boolean', mapped: null }],
          });
        }
        if (text.includes('SELECT id FROM models')) {
          return Promise.resolve({ rows: [{ id: MODEL_ID }] });
        }
        if (text.includes('SELECT id FROM categories')) {
          return Promise.resolve({ rows: [{ id: CATEGORY_ID }] });
        }
        if (text.includes('INSERT INTO listings')) {
          return Promise.resolve({ rows: [{ id: LISTING_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(listingRepo.create(validCreateBody as any)).rejects.toThrow(
        'Attribute "sunroof" is not available for the selected category'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('create rejects attribute values that do not match the attribute type', async () => {
      mockClient = createMockClient();
      mockClient.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('SELECT fa.id, fa.key, fa.type')) {
          return Promise.resolve({
            rows: [{ id: ATTRIBUTE_ID, key: 'seats', type: 'range', mapped: ATTRIBUTE_ID }],
          });
        }
        if (text.includes('SELECT id FROM models')) {
          return Promise.resolve({ rows: [{ id: MODEL_ID }] });
        }
        if (text.includes('SELECT id FROM categories')) {
          return Promise.resolve({ rows: [{ id: CATEGORY_ID }] });
        }
        if (text.includes('INSERT INTO listings')) {
          return Promise.resolve({ rows: [{ id: LISTING_ID }] });
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(listingRepo.create({ ...validCreateBody, attributes: [{ attributeId: ATTRIBUTE_ID, value: 'seven' }] } as any)).rejects.toThrow(
        'Attribute "seats" expects a numeric value'
      );
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('update replaces images and attributes transactionally and patches scalar fields', async () => {
      mockClient = createMockClient();
      mockClient.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ id: LISTING_ID, categoryId: CATEGORY_ID, status: 'available' }] });
        }
        if (text.includes('INSERT INTO listing_images')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('JOIN models m')) {
          return Promise.resolve({ rows: [detailRow({ title: 'Renamed' })] });
        }
        if (text.includes('FROM listing_images')) {
          return Promise.resolve({ rows: [] });
        }
        if (text.includes('FROM listing_attribute_values')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      const updated = await listingRepo.update(LISTING_ID, {
        title: 'Renamed',
        images: [{ imageUrl: 'https://cdn.example.com/new.jpg', sortOrder: 0 }],
        attributes: [],
      });

      expect(updated.title).toBe('Renamed');
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM listing_images'),
        [LISTING_ID]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM listing_attribute_values'),
        [LISTING_ID]
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE listings SET title = \$\d+, updated_at = NOW\(\)/),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('update rolls back when a related write fails', async () => {
      mockClient = createMockClient();
      mockClient.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ id: LISTING_ID, categoryId: CATEGORY_ID, status: 'available' }] });
        }
        if (text.includes('DELETE FROM listing_images')) {
          return Promise.reject(new Error('simulated delete failure'));
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(
        listingRepo.update(LISTING_ID, { images: [{ imageUrl: 'https://cdn.example.com/x.jpg' }] })
      ).rejects.toThrow('simulated delete failure');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
    });

    it('update returns 404 for a missing or removed listing', async () => {
      mockClient = createMockClient();
      mockClient.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(mockClient);

      await expect(listingRepo.update(LISTING_ID, { title: 'x' })).rejects.toThrow('Listing not found');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('softDelete performs an UPDATE to status = removed, never a physical DELETE', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ id: LISTING_ID }] } as any);

      const deleted = await listingRepo.softDelete(LISTING_ID);

      expect(deleted).toBe(true);
      const [sql] = querySpy.mock.calls[0] as unknown as [string];
      expect(sql).toContain('UPDATE listings');
      expect(sql).toContain("SET status = 'removed'");
      expect(sql).not.toContain('DELETE FROM listings');
    });

    it('softDelete reports false when the listing does not exist', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const deleted = await listingRepo.softDelete(LISTING_ID);

      expect(deleted).toBe(false);
    });
  });

  describe('Browse query — keyset pagination SQL', () => {
    let listingRepo: ListingRepository;

    beforeEach(() => {
      listingRepo = new ListingRepository();
    });

    it('first page queries without a cursor and without OFFSET', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await listingRepo.browse({ maxRows: 3, sort: 'created_at', cursor: null });

      const [sql, params] = querySpy.mock.calls[0] as unknown as [string, any[]];
      expect(sql).toContain("l.status <> 'removed'");
      expect(sql).toContain('ORDER BY l.created_at DESC, l.id DESC');
      expect(sql).not.toMatch(/\bOFFSET\b/);
      expect(sql).not.toContain('$1, $2');
      expect(params).toEqual([3]);
    });

    it('next page applies a row-value keyset predicate with the cursor state', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await listingRepo.browse({
        maxRows: 3,
        sort: 'created_at',
        cursor: { sort: 'created_at', value: '2026-09-25T10:00:00.000000Z', id: LISTING_ID },
      });

      const [sql, params] = querySpy.mock.calls[0] as unknown as [string, any[]];
      expect(sql).toContain('(l.created_at, l.id) < ($1, $2)');
      expect(sql).toContain('ORDER BY l.created_at DESC, l.id DESC');
      expect(params).toEqual(['2026-09-25T10:00:00.000000Z', LISTING_ID, 3]);
    });

    it('only allowlisted sort fields reach the SQL identifier position', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await listingRepo.browse({ maxRows: 10, sort: 'price', cursor: null });

      const [sql] = querySpy.mock.calls[0] as unknown as [string];
      expect(sql).toContain('ORDER BY l.price DESC, l.id DESC');
    });
  });

  describe('HTTP API — listing endpoints', () => {
    it('POST /api/v1/listings creates a listing and returns 201', async () => {
      vi.spyOn(pool, 'connect').mockResolvedValue(createMockClient());

      const res = await request(app).post('/api/v1/listings').send(validCreateBody);

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe(LISTING_ID);
      expect(res.body.data.status).toBe('available');
      expect(res.body.data.model.name).toBe('Fortuner');
      expect(res.body.data.make.name).toBe('Toyota');
      expect(res.body.data.category.name).toBe('SUVs');
    });

    it('POST /api/v1/listings rejects an invalid body with 400', async () => {
      const res = await request(app).post('/api/v1/listings').send({ title: '' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('POST /api/v1/listings returns 404 when the model does not exist', async () => {
      vi.spyOn(pool, 'connect').mockResolvedValue(createMockClient({ modelMissing: true }));

      const res = await request(app).post('/api/v1/listings').send(validCreateBody);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(res.body.error.message).toBe('Model not found');
    });

    it('GET /api/v1/listings/:id returns the listing with related data', async () => {
      mockDetailPoolQuery(
        [{ id: 'aa111111-1111-4111-8111-111111111111', imageUrl: 'https://cdn.example.com/1.jpg', sortOrder: 0 }],
        [
          {
            attributeId: ATTRIBUTE_ID,
            key: 'fuel_type',
            type: 'enum',
            valueText: 'diesel',
            valueNumeric: null,
            valueBoolean: null,
          },
        ]
      );

      const res = await request(app).get(`/api/v1/listings/${LISTING_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(LISTING_ID);
      expect(res.body.data.model.name).toBe('Fortuner');
      expect(res.body.data.make.name).toBe('Toyota');
      expect(res.body.data.category.name).toBe('SUVs');
      expect(res.body.data.images).toHaveLength(1);
      expect(res.body.data.attributes).toEqual([
        { attributeId: ATTRIBUTE_ID, key: 'fuel_type', type: 'enum', value: 'diesel' },
      ]);
    });

    it('GET /api/v1/listings/:id returns 404 for a missing listing', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const res = await request(app).get(`/api/v1/listings/${LISTING_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('GET /api/v1/listings/:id rejects a non-uuid path parameter', async () => {
      const res = await request(app).get('/api/v1/listings/not-a-uuid');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('PATCH /api/v1/listings/:id updates the listing', async () => {
      const client = createMockClient();
      client.query.mockImplementation((sql: string) => {
        const text = typeof sql === 'string' ? sql : String(sql);
        if (text.includes('FOR UPDATE')) {
          return Promise.resolve({ rows: [{ id: LISTING_ID, categoryId: CATEGORY_ID, status: 'available' }] });
        }
        if (text.includes('JOIN models m')) {
          return Promise.resolve({ rows: [detailRow({ title: 'Updated title' })] });
        }
        return Promise.resolve({ rows: [] });
      });
      vi.spyOn(pool, 'connect').mockResolvedValue(client);

      const res = await request(app)
        .patch(`/api/v1/listings/${LISTING_ID}`)
        .send({ title: 'Updated title', price: 500000000 });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated title');
      expect(client.query).toHaveBeenCalledWith('BEGIN');
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('PATCH /api/v1/listings/:id rejects an empty body', async () => {
      const res = await request(app).patch(`/api/v1/listings/${LISTING_ID}`).send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('DELETE /api/v1/listings/:id soft deletes and returns 204', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [{ id: LISTING_ID }] } as any);

      const res = await request(app).delete(`/api/v1/listings/${LISTING_ID}`);

      expect(res.status).toBe(204);
      const [sql] = querySpy.mock.calls[0] as unknown as [string];
      expect(sql).toContain('UPDATE listings');
      expect(sql).toContain("SET status = 'removed'");
      expect(sql).not.toContain('DELETE FROM listings');
    });

    it('DELETE /api/v1/listings/:id returns 404 when already removed or missing', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const res = await request(app).delete(`/api/v1/listings/${LISTING_ID}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('a soft-deleted listing is excluded from detail reads', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const res = await request(app).get(`/api/v1/listings/${LISTING_ID}`);

      expect(res.status).toBe(404);
      const firstCall = (vi.mocked(pool.query).mock.calls[0] ?? []) as any[];
      expect(String(firstCall[0])).toContain("l.status <> 'removed'");
    });
  });

  describe('HTTP API — browse pagination', () => {
    function listingRow(id: string, createdAt: string, overrides: Record<string, unknown> = {}) {
      return {
        id,
        modelId: MODEL_ID,
        categoryId: CATEGORY_ID,
        title: `Listing ${id}`,
        description: null,
        year: 2021,
        mileage: 1000,
        price: '1000000.00',
        condition: 'used',
        transmission: 'automatic',
        fuelType: 'diesel',
        color: 'Black',
        city: 'Jakarta',
        latitude: null,
        longitude: null,
        status: 'available',
        createdAt,
        updatedAt: createdAt,
        ...overrides,
      };
    }

    it('first page returns an envelope with a next cursor when more rows exist', async () => {
      const createdAt = '2026-09-25T10:00:00.000000Z';
      const rows = [
        listingRow('00000000-0000-4000-8000-000000000005', createdAt),
        listingRow('00000000-0000-4000-8000-000000000004', createdAt),
        listingRow('00000000-0000-4000-8000-000000000003', createdAt),
      ];
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows } as any);

      const res = await request(app).get('/api/v1/listings?limit=2');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.hasNextPage).toBe(true);

      const [sql, params] = querySpy.mock.calls[0] as unknown as [string, any[]];
      expect(sql).not.toMatch(/\bOFFSET\b/);
      expect(sql).toContain("l.status <> 'removed'");
      expect(params).toEqual([3]);

      const cursor = decodeCursor(res.body.pagination.nextCursor) as any;
      expect(cursor.sort).toBe('created_at');
      expect(cursor.id).toBe(rows[1].id);
      expect(cursor.value).toBe(createdAt);
    });

    it('last page returns hasNextPage false and a null cursor', async () => {
      const createdAt = '2026-09-25T10:00:00.000000Z';
      const rows = [
        listingRow('00000000-0000-4000-8000-000000000002', createdAt),
        listingRow('00000000-0000-4000-8000-000000000001', createdAt),
      ];
      vi.spyOn(pool, 'query').mockResolvedValue({ rows } as any);

      const res = await request(app).get('/api/v1/listings?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.hasNextPage).toBe(false);
      expect(res.body.pagination.nextCursor).toBeNull();
    });

    it('next page request forwards the cursor as a parameterized keyset predicate', async () => {
      const cursor = encodeCursor({
        sort: 'created_at',
        value: '2026-09-25T10:00:00.000000Z',
        id: '00000000-0000-4000-8000-000000000003',
      });
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const res = await request(app).get(`/api/v1/listings?limit=2&cursor=${encodeURIComponent(cursor)}`);

      expect(res.status).toBe(200);
      const [sql, params] = querySpy.mock.calls[0] as unknown as [string, any[]];
      expect(sql).toContain('(l.created_at, l.id) < ($1, $2)');
      expect(params).toEqual(['2026-09-25T10:00:00.000000Z', '00000000-0000-4000-8000-000000000003', 3]);
    });

    it('rejects malformed cursors with 400', async () => {
      vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      const garbage = await request(app).get('/api/v1/listings?cursor=%21%21%21');
      expect(garbage.status).toBe(400);
      expect(garbage.body.error.code).toBe('VALIDATION_ERROR');

      const wrongShape = await request(app).get(
        `/api/v1/listings?cursor=${encodeURIComponent(encodeCursor({ foo: 1 }))}`
      );
      expect(wrongShape.status).toBe(400);

      const wrongSort = await request(app).get(
        `/api/v1/listings?cursor=${encodeURIComponent(
          encodeCursor({ sort: 'price', value: '1000', id: LISTING_ID })
        )}`
      );
      expect(wrongSort.status).toBe(400);
    });

    it('rejects invalid sort fields and out-of-bounds limits with 400', async () => {
      const invalidSort = await request(app).get('/api/v1/listings?sort=id%3Bdrop%20table');
      expect(invalidSort.status).toBe(400);
      expect(invalidSort.body.error.code).toBe('VALIDATION_ERROR');

      const tooLarge = await request(app).get('/api/v1/listings?limit=51');
      expect(tooLarge.status).toBe(400);

      const tooSmall = await request(app).get('/api/v1/listings?limit=0');
      expect(tooSmall.status).toBe(400);
    });

    it('pages deterministically across identical created_at timestamps without duplicates', async () => {
      const createdAt = '2026-09-25T10:00:00.000000Z';
      const allRows = [
        listingRow('00000000-0000-4000-8000-000000000005', createdAt),
        listingRow('00000000-0000-4000-8000-000000000004', createdAt),
        listingRow('00000000-0000-4000-8000-000000000003', createdAt),
        listingRow('00000000-0000-4000-8000-000000000002', createdAt),
        listingRow('00000000-0000-4000-8000-000000000001', createdAt),
      ];

      vi.spyOn(pool, 'query').mockImplementation(((sql: any, params?: any[]) => {
        const text = typeof sql === 'string' ? sql : sql.text;
        if (!text.includes('FROM listings l')) {
          return Promise.resolve({ rows: [] } as any);
        }

        let rows = [...allRows];
        if (params && params.length === 3) {
          const [value, id] = params as [string, string];
          rows = rows.filter(
            (row) => row.createdAt < value || (row.createdAt === value && row.id < id)
          );
        }
        rows.sort((a, b) => {
          if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
          return a.id < b.id ? 1 : -1;
        });
        const maxRows = params ? (params[params.length - 1] as number) : 3;
        rows = rows.slice(0, maxRows);
        return Promise.resolve({ rows } as any);
      }) as any);

      async function collectAllIds(): Promise<string[]> {
        const seen: string[] = [];
        let cursor: string | null = null;
        let guard = 0;
        do {
          const url: string = cursor
            ? `/api/v1/listings?limit=2&cursor=${encodeURIComponent(cursor)}`
            : '/api/v1/listings?limit=2';
          const res = await request(app).get(url);
          expect(res.status).toBe(200);
          seen.push(...res.body.data.map((item: any) => item.id));
          cursor = res.body.pagination.nextCursor;
          guard += 1;
        } while (cursor && guard < 10);
        return seen;
      }

      const firstPass = await collectAllIds();
      expect(firstPass).toHaveLength(5);
      expect(new Set(firstPass).size).toBe(5);
      expect(firstPass).toEqual([
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000001',
      ]);

      const secondPass = await collectAllIds();
      expect(secondPass).toEqual(firstPass);
    });

    it('browse excludes soft-deleted listings from the SQL scope', async () => {
      const querySpy = vi.spyOn(pool, 'query').mockResolvedValue({ rows: [] } as any);

      await request(app).get('/api/v1/listings');

      const [sql] = querySpy.mock.calls[0] as unknown as [string];
      expect(sql).toContain("l.status <> 'removed'");
      expect(sql).not.toContain("status = 'removed'");
    });
  });
});
