import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { pool } from '../src/db/pool';
import { ListingRepository } from '../src/modules/listings/listing.repository';

const rootId = randomUUID();
const childId = randomUUID();
const grandchildId = randomUUID();
const unrelatedId = randomUUID();
const makeId = randomUUID();
const modelId = randomUUID();
const attributeId = randomUUID();
const listingIds: string[] = [];
const unrelatedListingId = randomUUID();

async function insertFixtures(): Promise<void> {
  await pool.query('INSERT INTO makes (id, name, slug) VALUES ($1, $2, $3)', [
    makeId,
    `make-${makeId}`,
    `make-${makeId}`,
  ]);
  await pool.query('INSERT INTO models (id, make_id, name, slug) VALUES ($1, $2, $3, $4)', [
    modelId,
    makeId,
    `model-${modelId}`,
    `model-${modelId}`,
  ]);
  await pool.query(
    `
      INSERT INTO categories (id, parent_id, name, slug)
      VALUES
        ($1, NULL, $2, $3),
        ($4, $1, $5, $6),
        ($7, $4, $8, $9),
        ($10, NULL, $11, $12)
    `,
    [
      rootId,
      `root-${rootId}`,
      `root-${rootId}`,
      childId,
      `child-${childId}`,
      `child-${childId}`,
      grandchildId,
      `grandchild-${grandchildId}`,
      `grandchild-${grandchildId}`,
      unrelatedId,
      `unrelated-${unrelatedId}`,
      `unrelated-${unrelatedId}`,
    ]
  );
  await pool.query(
    `
      INSERT INTO category_closure (ancestor_id, descendant_id, depth)
      VALUES
        ($1, $1, 0),
        ($1, $2, 1),
        ($2, $2, 0),
        ($1, $3, 2),
        ($2, $3, 1),
        ($3, $3, 0),
        ($4, $4, 0)
    `,
    [rootId, childId, grandchildId, unrelatedId]
  );
  await pool.query(
    'INSERT INTO filter_attributes (id, key, name, type) VALUES ($1, $2, $3, $4)',
    [attributeId, `fuel_type_${attributeId}`, 'Fuel Type', 'enum']
  );
  await pool.query(
    'INSERT INTO filter_attribute_options (attribute_id, value, label) VALUES ($1, $2, $3)',
    [attributeId, 'gasoline', 'Gasoline']
  );
  await pool.query(
    `
      INSERT INTO category_filter_attributes (category_id, attribute_id, required)
      VALUES ($1, $2, TRUE), ($3, $2, TRUE)
    `,
    [rootId, attributeId, childId]
  );

  const listingRows = [
    [randomUUID(), rootId, 'available'],
    [randomUUID(), childId, 'available'],
    [randomUUID(), grandchildId, 'available'],
    [randomUUID(), rootId, 'available'],
    [randomUUID(), childId, 'available'],
    [randomUUID(), grandchildId, 'removed'],
  ];
  listingIds.push(...listingRows.map(([id]) => id as string));
  for (const [id, categoryId, status] of listingRows) {
    await pool.query(
      `
        INSERT INTO listings (
          id, model_id, category_id, title, year, mileage, price,
          condition, transmission, fuel_type, color, city, status, created_at
        )
        VALUES ($1, $2, $3, $4, 2020, 1000, 1000, 'used', 'automatic', 'gasoline', 'black', 'Jakarta', $5, $6)
      `,
      [id, modelId, categoryId, `listing-${id}`, status, '2026-01-01T00:00:00.000000Z']
    );
  }

  await pool.query(
    `
      INSERT INTO listings (
        id, model_id, category_id, title, year, mileage, price,
        condition, transmission, fuel_type, color, city, status, created_at
      )
      VALUES ($1, $2, $3, $4, 2020, 1000, 1000, 'used', 'automatic', 'gasoline', 'black', 'Jakarta', 'available', $5)
    `,
    [unrelatedListingId, modelId, unrelatedId, `listing-${unrelatedListingId}`, '2026-01-01T00:00:00.000000Z']
  );
}

async function deleteFixtures(): Promise<void> {
  await pool.query('DELETE FROM listings WHERE id = ANY($1::uuid[])', [[...listingIds, unrelatedListingId]]);
  await pool.query('DELETE FROM category_closure WHERE ancestor_id = ANY($1::uuid[]) OR descendant_id = ANY($1::uuid[])', [
    [rootId, childId, grandchildId, unrelatedId],
  ]);
  await pool.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [[rootId, childId, grandchildId, unrelatedId]]);
  await pool.query('DELETE FROM filter_attributes WHERE id = $1', [attributeId]);
  await pool.query('DELETE FROM models WHERE id = $1', [modelId]);
  await pool.query('DELETE FROM makes WHERE id = $1', [makeId]);
}

describe('Ticket 04 database integration — category listing pagination', () => {
  beforeAll(async () => {
    await insertFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
  });

  it('paginates subtree listings deterministically without removed rows or duplicates', async () => {
    const expected = await pool.query<{ id: string }>(
      `
        SELECT l.id
        FROM listings l
        JOIN category_closure cc ON l.category_id = cc.descendant_id
        WHERE cc.ancestor_id = $1 AND l.status <> 'removed'
        ORDER BY l.created_at DESC, l.id DESC
      `,
      [rootId]
    );
    const expectedIds = expected.rows.map((row) => row.id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      const query = new URLSearchParams({ limit: '2' });
      if (cursor) query.set('cursor', cursor);
      const response = await request(app).get(`/api/v1/categories/${rootId}/listings?${query.toString()}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.data.length).toBeLessThanOrEqual(2);
      seen.push(...response.body.data.map((listing: { id: string }) => listing.id));
      cursor = response.body.pagination.nextCursor;
      pageCount += 1;
    } while (cursor && pageCount < 10);

    expect(pageCount).toBeGreaterThan(1);
    expect(seen).toEqual(expectedIds);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).not.toContain(unrelatedListingId);
  });

  it('validates required and enum attributes and preserves valid values on category change', async () => {
    const listingRepo = new ListingRepository();
    const baseListing = {
      modelId,
      categoryId: rootId,
      title: `validated-${attributeId}`,
      year: 2020,
      mileage: 1000,
      price: 1000,
      condition: 'used',
      transmission: 'automatic',
      fuelType: 'gasoline',
      color: 'black',
      city: 'Jakarta',
      images: [
        { imageUrl: 'https://cdn.example.com/one.jpg' },
        { imageUrl: 'https://cdn.example.com/two.jpg' },
      ],
    };

    await expect(
      listingRepo.create({ ...baseListing, attributes: [] } as any)
    ).rejects.toThrow('Required attribute');

    await expect(
      listingRepo.create({ ...baseListing, attributes: [{ attributeId, value: 'diesel' }] } as any)
    ).rejects.toThrow('Value for enum attribute');

    const created = await listingRepo.create({
      ...baseListing,
      attributes: [{ attributeId, value: 'gasoline' }],
    } as any);
    listingIds.push(created.id);
    expect(created.images).toHaveLength(2);
    expect(created.attributes).toEqual([
      { attributeId, key: `fuel_type_${attributeId}`, type: 'enum', value: 'gasoline' },
    ]);

    const updated = await listingRepo.update(created.id, { categoryId: childId });
    expect(updated.categoryId).toBe(childId);
    expect(updated.attributes).toHaveLength(1);

    await expect(listingRepo.update(created.id, { categoryId: unrelatedId })).rejects.toThrow(
      'not available for the selected category'
    );
    const persisted = await pool.query<{ categoryId: string }>('SELECT category_id as "categoryId" FROM listings WHERE id = $1', [created.id]);
    const attributeCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM listing_attribute_values WHERE listing_id = $1',
      [created.id]
    );
    expect(persisted.rows[0].categoryId).toBe(childId);
    expect(attributeCount.rows[0].count).toBe('1');
  });

  it('rejects invalid category listing limits', async () => {
    const response = await request(app).get(`/api/v1/categories/${rootId}/listings?limit=51`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
