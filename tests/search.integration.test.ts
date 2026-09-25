import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

const suffix = randomUUID().slice(0, 8);
const makeAId = randomUUID();
const makeBId = randomUUID();
const modelAId = randomUUID();
const modelDuplicateId = randomUUID();
const modelBId = randomUUID();
const rootCategoryId = randomUUID();
const childCategoryId = randomUUID();
const grandchildCategoryId = randomUUID();
const unrelatedCategoryId = randomUUID();
const enumAttributeId = randomUUID();
const rangeAttributeId = randomUUID();
const booleanAttributeId = randomUUID();
const makeAName = `Aurora Motors ${suffix}`;
const makeBName = `Borealis Motors ${suffix}`;
const modelAName = `Aurora Crossover ${suffix}`;
const modelBName = `Borealis S8 ${suffix}`;
const cityA = `Aurora City ${suffix}`;
const cityB = `Borealis City ${suffix}`;
const listingIds: string[] = [];

const ids = {
  childRed: randomUUID(),
  grandchildBlue: randomUUID(),
  childRemoved: randomUUID(),
  unrelated: randomUUID(),
  makeMatch: randomUUID(),
  cityMatch: randomUUID(),
  makeB: randomUUID(),
  duplicateModel: randomUUID(),
};

const dynamicFilters = (value: Record<string, unknown>) => encodeURIComponent(JSON.stringify(value));

async function insertFixtures(): Promise<void> {
  await pool.query(
    `
      INSERT INTO makes (id, name, slug) VALUES
        ($1, $2, $3),
        ($4, $5, $6)
    `,
    [makeAId, makeAName, `aurora-motors-${suffix}`, makeBId, makeBName, `borealis-motors-${suffix}`]
  );
  await pool.query(
    `
      INSERT INTO models (id, make_id, name, slug) VALUES
        ($1, $2, $3, $4),
        ($5, $2, $6, $7),
        ($8, $9, $10, $11)
    `,
    [
      modelAId,
      makeAId,
      modelAName,
      `aurora-crossover-${suffix}`,
      modelDuplicateId,
      modelAName,
      `aurora-crossover-duplicate-${suffix}`,
      modelBId,
      makeBId,
      modelBName,
      `borealis-s8-${suffix}`,
    ]
  );
  await pool.query(
    `
      INSERT INTO categories (id, parent_id, name, slug) VALUES
        ($1, NULL, $2, $3),
        ($4, $1, $5, $6),
        ($7, $4, $8, $9),
        ($10, NULL, $11, $12)
    `,
    [
      rootCategoryId,
      `root-${suffix}`,
      `root-${suffix}`,
      childCategoryId,
      `child-${suffix}`,
      `child-${suffix}`,
      grandchildCategoryId,
      `grandchild-${suffix}`,
      `grandchild-${suffix}`,
      unrelatedCategoryId,
      `unrelated-${suffix}`,
      `unrelated-${suffix}`,
    ]
  );
  await pool.query(
    `
      INSERT INTO category_closure (ancestor_id, descendant_id, depth) VALUES
        ($1, $1, 0),
        ($2, $2, 0),
        ($1, $2, 1),
        ($3, $3, 0),
        ($1, $3, 2),
        ($2, $3, 1),
        ($4, $4, 0)
    `,
    [rootCategoryId, childCategoryId, grandchildCategoryId, unrelatedCategoryId]
  );
  await pool.query(
    `
      INSERT INTO filter_attributes (id, key, name, type) VALUES
        ($1, $2, 'Body Color', 'enum'),
        ($3, $4, 'Seats', 'range'),
        ($5, $6, 'Sunroof', 'boolean')
    `,
    [
      enumAttributeId,
      `ticket06_color_${suffix}`,
      rangeAttributeId,
      `ticket06_seats_${suffix}`,
      booleanAttributeId,
      `ticket06_sunroof_${suffix}`,
    ]
  );
  await pool.query(
    `
      INSERT INTO filter_attribute_options (attribute_id, value, label, sort_order) VALUES
        ($1, 'red', 'Red', 0),
        ($1, 'blue', 'Blue', 1)
    `,
    [enumAttributeId]
  );
  await pool.query(
    `
      INSERT INTO category_filter_attributes (category_id, attribute_id) VALUES
        ($1, $2), ($1, $3), ($1, $4)
    `,
    [rootCategoryId, enumAttributeId, rangeAttributeId, booleanAttributeId]
  );

  const rows = [
    [ids.childRed, modelAId, childCategoryId, 'Aurora crossover', 'Seven seats for every trip', cityA, 'available', 200, 2022, 'manual', 'gasoline', 'red', 7, true],
    [ids.grandchildBlue, modelAId, grandchildCategoryId, 'Family wagon', 'Aurora exclusive content', cityA, 'available', 300, 2021, 'automatic', 'hybrid', 'blue', 5, false],
    [ids.childRemoved, modelBId, childCategoryId, 'Aurora removed listing', 'Removed content', cityB, 'removed', 100, 2023, 'automatic', 'diesel', 'red', 8, true],
    [ids.unrelated, modelBId, unrelatedCategoryId, 'Aurora unrelated listing', 'Outside subtree', `Outside City ${suffix}`, 'available', 400, 2024, 'manual', 'diesel', 'blue', 5, false],
    [ids.makeMatch, modelAId, rootCategoryId, 'Regular hatch', 'Make and model searchable', cityB, 'available', 500, 2020, 'manual', 'gasoline', 'red', 7, true],
    [ids.cityMatch, modelBId, rootCategoryId, 'Regular sedan', 'City searchable', cityA, 'available', 600, 2019, 'automatic', 'hybrid', 'blue', 5, false],
    [ids.makeB, modelBId, rootCategoryId, 'Borealis regular', 'Second make', cityB, 'available', 700, 2018, 'manual', 'diesel', 'red', 7, true],
    [ids.duplicateModel, modelDuplicateId, rootCategoryId, 'Duplicate model name', 'Suggestion deduplication', cityB, 'available', 800, 2017, 'manual', 'diesel', 'blue', 5, false],
  ] as const;
  listingIds.push(...rows.map(([id]) => id));

  for (const [id, modelId, categoryId, title, description, city, status, price, year, transmission, fuelType, color, seats, sunroof] of rows) {
    await pool.query(
      `
        INSERT INTO listings (
          id, model_id, category_id, title, description, year, mileage, price,
          condition, transmission, fuel_type, color, city, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 1000, $7, 'used', $8, $9, $10, $11, $12, $13)
      `,
      [id, modelId, categoryId, title, description, year, price, transmission, fuelType, color, city, status, '2026-09-25T10:00:00.000000Z']
    );
    await pool.query(
      `
        INSERT INTO listing_attribute_values (
          listing_id, attribute_id, value_text, value_numeric, value_boolean
        ) VALUES ($1, $2, $3, NULL, NULL), ($1, $4, NULL, $5, NULL), ($1, $6, NULL, NULL, $7)
      `,
      [id, enumAttributeId, color, rangeAttributeId, seats, booleanAttributeId, sunroof]
    );
  }
}

async function deleteFixtures(): Promise<void> {
  await pool.query('DELETE FROM listings WHERE id = ANY($1::uuid[])', [listingIds]);
  await pool.query('DELETE FROM category_closure WHERE ancestor_id = ANY($1::uuid[]) OR descendant_id = ANY($1::uuid[])', [
    [rootCategoryId, childCategoryId, grandchildCategoryId, unrelatedCategoryId],
  ]);
  await pool.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [
    [rootCategoryId, childCategoryId, grandchildCategoryId, unrelatedCategoryId],
  ]);
  await pool.query('DELETE FROM filter_attributes WHERE id = ANY($1::uuid[])', [
    [enumAttributeId, rangeAttributeId, booleanAttributeId],
  ]);
  await pool.query('DELETE FROM models WHERE id = ANY($1::uuid[])', [[modelAId, modelDuplicateId, modelBId]]);
  await pool.query('DELETE FROM makes WHERE id = ANY($1::uuid[])', [[makeAId, makeBId]]);
}

function facet(response: any, key: string) {
  return response.body.data.filters.find((entry: any) => entry.key === key);
}

describe('Ticket 06 database integration — full-text search, suggestions, and facets', () => {
  beforeAll(insertFixtures);
  afterAll(deleteFixtures);

  it('searches title, description, make, model, and city through search_vector', async () => {
    const title = await request(app).get('/api/v1/listings/search?q=removed');
    const description = await request(app).get('/api/v1/listings/search?q=exclusive');
    const make = await request(app).get(`/api/v1/listings/search?q=${encodeURIComponent(makeAName)}`);
    const model = await request(app).get(`/api/v1/listings/search?q=${encodeURIComponent(modelAName)}`);
    const city = await request(app).get(`/api/v1/listings/search?q=${encodeURIComponent(cityA)}`);

    expect(title.status).toBe(200);
    expect(title.body.data.map((listing: any) => listing.id)).not.toContain(ids.childRemoved);
    expect(description.body.data.map((listing: any) => listing.id)).toEqual([ids.grandchildBlue]);
    expect(make.body.data.map((listing: any) => listing.id)).toEqual(
      expect.arrayContaining([ids.childRed, ids.grandchildBlue, ids.makeMatch])
    );
    expect(model.body.data.map((listing: any) => listing.id)).toEqual(
      expect.arrayContaining([ids.childRed, ids.grandchildBlue, ids.makeMatch, ids.duplicateModel])
    );
    expect(city.body.data.map((listing: any) => listing.id)).toEqual(
      expect.arrayContaining([ids.childRed, ids.grandchildBlue, ids.cityMatch])
    );
  });

  it('returns an empty result for a no-match query and excludes removed listings', async () => {
    const response = await request(app).get('/api/v1/listings/search?q=neverwrittenlistingterm');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination).toEqual({ nextCursor: null, hasNextPage: false });
  });

  it('combines search text with scalar, subtree, and dynamic filters', async () => {
    const scalar = await request(app).get(
      '/api/v1/listings/search?q=Aurora&fuelType=gasoline&minPrice=150&maxPrice=300&transmission=manual'
    );
    const subtree = await request(app).get(`/api/v1/listings/search?q=Aurora&categoryId=${rootCategoryId}`);
    const dynamic = await request(app).get(
      `/api/v1/listings/search?q=Aurora&categoryId=${rootCategoryId}&maxPrice=300&filters=${dynamicFilters({
        [`ticket06_color_${suffix}`]: 'red',
      })}`
    );

    expect(scalar.body.data.map((listing: any) => listing.id)).toEqual([ids.childRed]);
    expect(subtree.body.data.map((listing: any) => listing.id).sort()).toEqual(
      [ids.childRed, ids.grandchildBlue, ids.makeMatch, ids.cityMatch, ids.duplicateModel].sort()
    );
    expect(dynamic.body.data.map((listing: any) => listing.id)).toEqual([ids.childRed]);
  });

  it('paginates search results deterministically without duplicates', async () => {
    const expected = await pool.query<{ id: string }>(
      `
        SELECT l.id
        FROM listings l
        WHERE l.status <> 'removed'
          AND l.search_vector @@ websearch_to_tsquery('english', 'Aurora')
          AND l.category_id IN (
            SELECT descendant_id FROM category_closure WHERE ancestor_id = $1
          )
        ORDER BY l.created_at DESC, l.id DESC
      `,
      [rootCategoryId]
    );
    const expectedIds = expected.rows.map((row) => row.id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query = new URLSearchParams({ q: 'Aurora', categoryId: rootCategoryId, limit: '1' });
      if (cursor) query.set('cursor', cursor);
      const response = await request(app).get(`/api/v1/listings/search?${query.toString()}`);

      expect(response.status).toBe(200);
      seen.push(...response.body.data.map((listing: any) => listing.id));
      cursor = response.body.pagination.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('paginates search results by an allowlisted non-default sort', async () => {
    const expected = await pool.query<{ id: string }>(
      `
        SELECT l.id
        FROM listings l
        WHERE l.status <> 'removed'
          AND l.search_vector @@ websearch_to_tsquery('english', 'Aurora')
          AND l.category_id IN (
            SELECT descendant_id FROM category_closure WHERE ancestor_id = $1
          )
        ORDER BY l.price DESC, l.id DESC
      `,
      [rootCategoryId]
    );
    const expectedIds = expected.rows.map((row) => row.id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const query = new URLSearchParams({
        q: 'Aurora',
        categoryId: rootCategoryId,
        sort: 'price',
        limit: '1',
      });
      if (cursor) query.set('cursor', cursor);
      const response = await request(app).get(`/api/v1/listings/search?${query.toString()}`);

      expect(response.status).toBe(200);
      seen.push(...response.body.data.map((listing: any) => listing.id));
      cursor = response.body.pagination.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBeGreaterThan(1);
    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('returns bounded, deterministic make, model, and city suggestions without duplicates', async () => {
    const make = await request(app).get(
      `/api/v1/listings/search/suggest?q=${encodeURIComponent(makeAName)}&type=make&limit=5`
    );
    const model = await request(app).get(
      `/api/v1/listings/search/suggest?q=${encodeURIComponent(modelAName)}&type=model&limit=5`
    );
    const city = await request(app).get(
      `/api/v1/listings/search/suggest?q=${encodeURIComponent(cityA)}&type=city&limit=5`
    );
    const bounded = await request(app).get(
      '/api/v1/listings/search/suggest?q=Aurora&limit=2'
    );

    expect(make.body.data.suggestions).toEqual([
      { type: 'make', value: `aurora-motors-${suffix}`, label: makeAName },
    ]);
    expect(model.body.data.suggestions).toEqual([
      { type: 'model', value: [modelAId, modelDuplicateId].sort()[0], label: modelAName },
    ]);
    expect(city.body.data.suggestions).toEqual([
      { type: 'city', value: cityA, label: cityA },
    ]);
    expect(bounded.body.data.suggestions).toHaveLength(3);
    expect(bounded.body.data.suggestions.length).toBeLessThanOrEqual(6);
    expect(bounded.body.data.suggestions.map((suggestion: any) => suggestion.type)).toEqual(
      expect.arrayContaining(['make', 'model', 'city'])
    );
  });

  it('rejects empty, invalid, oversized, and injection-shaped suggestion queries consistently', async () => {
    const empty = await request(app).get('/api/v1/listings/search/suggest?q=');
    const invalid = await request(app).get('/api/v1/listings/search/suggest?q=id;DROP%20TABLE%20listings');
    const tooLarge = await request(app).get(`/api/v1/listings/search/suggest?q=${'a'.repeat(101)}`);

    for (const response of [empty, invalid, tooLarge]) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns scalar and dynamic facet metadata with counts in the current search context', async () => {
    const response = await request(app).get(
      `/api/v1/filters?q=Aurora&categoryId=${rootCategoryId}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(5);
    expect(facet(response, 'make').options).toEqual(
      expect.arrayContaining([{ value: `aurora-motors-${suffix}`, label: makeAName, count: 4 }])
    );
    expect(facet(response, 'fuel_type').options).toEqual([
      { value: 'diesel', label: 'diesel', count: 1 },
      { value: 'gasoline', label: 'gasoline', count: 2 },
      { value: 'hybrid', label: 'hybrid', count: 2 },
    ]);
    expect(facet(response, `ticket06_color_${suffix}`).options).toEqual([
      { value: 'red', label: 'Red', count: 2 },
      { value: 'blue', label: 'Blue', count: 3 },
    ]);
    expect(facet(response, `ticket06_seats_${suffix}`).options).toEqual([]);
    expect(facet(response, 'city')).toBeUndefined();
    expect(facet(response, 'condition')).toBeUndefined();
  });

  it('counts facets against the full current filter context, including the facet own selection', async () => {
    const scalar = await request(app).get('/api/v1/filters?q=Aurora&fuelType=gasoline');
    const dynamic = await request(app).get(
      `/api/v1/filters?q=Aurora&categoryId=${rootCategoryId}&maxPrice=300&filters=${dynamicFilters({
        [`ticket06_color_${suffix}`]: 'red',
      })}`
    );

    expect(scalar.body.data.total).toBe(2);
    expect(facet(scalar, 'fuel_type').options).toEqual([
      { value: 'gasoline', label: 'gasoline', count: 2 },
    ]);
    expect(dynamic.body.data.total).toBe(1);
    expect(facet(dynamic, `ticket06_color_${suffix}`).options).toEqual([
      { value: 'red', label: 'Red', count: 1 },
      { value: 'blue', label: 'Blue', count: 0 },
    ]);
  });

  it('applies category subtree and removed exclusion to facets and returns zero-result metadata', async () => {
    const subtree = await request(app).get(`/api/v1/filters?q=Aurora&categoryId=${rootCategoryId}`);
    const zero = await request(app).get('/api/v1/filters?q=neverwrittenlistingterm');

    expect(subtree.body.data.total).toBe(5);
    expect(facet(subtree, 'make').options).toEqual(
      expect.arrayContaining([{ value: `aurora-motors-${suffix}`, label: makeAName, count: 4 }])
    );
    expect(zero.status).toBe(200);
    expect(zero.body.data.total).toBe(0);
    expect(zero.body.data.filters.length).toBeGreaterThan(0);
    expect(zero.body.data.filters.every((entry: any) => entry.options.every((option: any) => option.count === 0))).toBe(true);
  });
});
