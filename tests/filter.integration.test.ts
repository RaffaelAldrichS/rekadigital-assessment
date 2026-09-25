import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';

const makeId = randomUUID();
const modelId = randomUUID();
const rootCategoryId = randomUUID();
const childCategoryId = randomUUID();
const enumAttributeId = randomUUID();
const rangeAttributeId = randomUUID();
const booleanAttributeId = randomUUID();
const listingIds: string[] = [];

const filters = (value: Record<string, unknown>) => encodeURIComponent(JSON.stringify(value));

async function insertFixtures(): Promise<void> {
  await pool.query('INSERT INTO makes (id, name, slug) VALUES ($1, $2, $3)', [makeId, `make-${makeId}`, `make-${makeId}`]);
  await pool.query('INSERT INTO models (id, make_id, name, slug) VALUES ($1, $2, $3, $4)', [
    modelId,
    makeId,
    `model-${modelId}`,
    `model-${modelId}`,
  ]);
  await pool.query(
    `
      INSERT INTO categories (id, parent_id, name, slug)
      VALUES ($1, NULL, $2, $3), ($4, $1, $5, $6)
    `,
    [rootCategoryId, `root-${rootCategoryId}`, `root-${rootCategoryId}`, childCategoryId, `child-${childCategoryId}`, `child-${childCategoryId}`]
  );
  await pool.query(
    `
      INSERT INTO category_closure (ancestor_id, descendant_id, depth)
      VALUES ($1, $1, 0), ($2, $2, 0), ($1, $2, 1)
    `,
    [rootCategoryId, childCategoryId]
  );
  await pool.query(
    `
      INSERT INTO filter_attributes (id, key, name, type)
      VALUES ($1, $2, 'Body Color', 'enum'),
             ($3, $4, 'Seats', 'range'),
             ($5, $6, 'Sunroof', 'boolean')
    `,
    [enumAttributeId, `body_color_${enumAttributeId}`, rangeAttributeId, `seats_${rangeAttributeId}`, booleanAttributeId, `sunroof_${booleanAttributeId}`]
  );
  await pool.query(
    `
      INSERT INTO filter_attribute_options (attribute_id, value, label, sort_order)
      VALUES ($1, 'red', 'Red', 0), ($1, 'blue', 'Blue', 1)
    `,
    [enumAttributeId]
  );
  await pool.query(
    `
      INSERT INTO category_filter_attributes (category_id, attribute_id)
      VALUES ($1, $3), ($1, $4), ($1, $5), ($2, $3), ($2, $4), ($2, $5)
    `,
    [rootCategoryId, childCategoryId, enumAttributeId, rangeAttributeId, booleanAttributeId]
  );

  const rows = [
    [randomUUID(), childCategoryId, 'available', 'diesel', 100, 2021, 7, true, 'red'],
    [randomUUID(), childCategoryId, 'sold', 'gasoline', 200, 2020, 5, false, 'blue'],
    [randomUUID(), childCategoryId, 'removed', 'diesel', 50, 2022, 8, true, 'red'],
    [randomUUID(), childCategoryId, 'available', 'gasoline', 400, 2022, 4, false, 'red'],
  ];
  listingIds.push(...rows.map(([id]) => id as string));
  for (const [id, categoryId, status, fuelType, price, year, seats, sunroof, color] of rows) {
    await pool.query(
      `
        INSERT INTO listings (
          id, model_id, category_id, title, year, mileage, price,
          condition, transmission, fuel_type, color, city, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 1000, $6, 'used', 'automatic', $7, $8, 'Jakarta', $9, NOW())
      `,
      [id, modelId, categoryId, `filter-listing-${id}`, year, price, fuelType, color, status]
    );
    await pool.query(
      `
        INSERT INTO listing_attribute_values (
          listing_id, attribute_id, value_text, value_numeric, value_boolean
        )
        VALUES ($1, $2, $3, NULL, NULL), ($1, $4, NULL, $5, NULL), ($1, $6, NULL, NULL, $7)
      `,
      [id, enumAttributeId, color, rangeAttributeId, seats, booleanAttributeId, sunroof]
    );
  }
}

async function deleteFixtures(): Promise<void> {
  await pool.query('DELETE FROM listings WHERE id = ANY($1::uuid[])', [listingIds]);
  await pool.query('DELETE FROM category_closure WHERE ancestor_id = ANY($1::uuid[]) OR descendant_id = ANY($1::uuid[])', [
    [rootCategoryId, childCategoryId],
  ]);
  await pool.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [[rootCategoryId, childCategoryId]]);
  await pool.query('DELETE FROM filter_attributes WHERE id = ANY($1::uuid[])', [[enumAttributeId, rangeAttributeId, booleanAttributeId]]);
  await pool.query('DELETE FROM models WHERE id = $1', [modelId]);
  await pool.query('DELETE FROM makes WHERE id = $1', [makeId]);
}

describe('Ticket 05 database integration — dynamic filters', () => {
  beforeAll(insertFixtures);
  afterAll(deleteFixtures);

  it('returns mapped category metadata and enum options', async () => {
    const response = await request(app).get(`/api/v1/filters/${rootCategoryId}`);

    expect(response.status).toBe(200);
    expect(response.body.data.filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: `body_color_${enumAttributeId}`, type: 'enum', options: expect.arrayContaining([expect.objectContaining({ value: 'red' })]) }),
        expect.objectContaining({ key: `seats_${rangeAttributeId}`, type: 'range', options: [] }),
        expect.objectContaining({ key: `sunroof_${booleanAttributeId}`, type: 'boolean', options: [] }),
      ])
    );
  });

  it('combines enum, range, boolean, scalar filters, and excludes removed listings', async () => {
    const response = await request(app).get(
      `/api/v1/listings?categoryId=${rootCategoryId}&make=${encodeURIComponent(`make-${makeId}`)}&minPrice=75&maxPrice=150&minYear=2020&fuelType=diesel&filters=${filters({
        [`body_color_${enumAttributeId}`]: 'red',
        [`seats_${rangeAttributeId}`]: { min: 6, max: 8 },
        [`sunroof_${booleanAttributeId}`]: true,
      })}`
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(listingIds[0]);
    expect(response.body.data[0].status).toBe('available');
  });

  it('supports numeric minimum, maximum, and no-match results', async () => {
    const minimum = await request(app).get(
      `/api/v1/listings?categoryId=${rootCategoryId}&filters=${filters({ [`seats_${rangeAttributeId}`]: { min: 7 } })}`
    );
    const maximum = await request(app).get(
      `/api/v1/listings?categoryId=${rootCategoryId}&filters=${filters({ [`seats_${rangeAttributeId}`]: { max: 5 } })}`
    );
    const noMatch = await request(app).get(
      `/api/v1/listings?categoryId=${rootCategoryId}&filters=${filters({ [`seats_${rangeAttributeId}`]: { min: 100, max: 200 } })}`
    );

    expect(minimum.status).toBe(200);
    expect(minimum.body.data).toHaveLength(1);
    expect(maximum.body.data).toHaveLength(2);
    expect(noMatch.status).toBe(200);
    expect(noMatch.body.data).toEqual([]);
    expect(noMatch.body.pagination).toEqual({ nextCursor: null, hasNextPage: false });
  });
});
