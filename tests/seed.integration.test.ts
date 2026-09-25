import { pool } from '../src/db/pool';
import { app } from '../src/app';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('Seed & Verification Suite', () => {
  let toyotaId: string;
  let suvId: string;
  let insertedRemovedId: string | null = null;

  beforeAll(async () => {
    const makeRes = await pool.query("SELECT id FROM makes WHERE slug = 'toyota'");
    toyotaId = makeRes.rows[0]?.id;

    const catRes = await pool.query("SELECT id FROM categories WHERE slug = 'suv'");
    suvId = catRes.rows[0]?.id;
  });

  afterAll(async () => {
    if (insertedRemovedId) {
      await pool.query('DELETE FROM listings WHERE id = $1', [insertedRemovedId]);
    }
  });

  it('should have seeded >= 500 listings', async () => {
    const res = await pool.query('SELECT COUNT(*) FROM listings');
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(500);
  });

  it('should have populated search_vector for all seeded listings', async () => {
    const res = await pool.query('SELECT COUNT(*) FROM listings WHERE search_vector IS NULL');
    expect(parseInt(res.rows[0].count)).toBe(0);
  });

  it('should respect foreign keys and constraints', async () => {
    const orphans = await pool.query(`
      SELECT l.id FROM listings l
      LEFT JOIN models m ON m.id = l.model_id
      LEFT JOIN categories c ON c.id = l.category_id
      WHERE m.id IS NULL OR c.id IS NULL
    `);
    expect(orphans.rows.length).toBe(0);
  });

  it('should have valid dynamic attribute values', async () => {
    const res = await pool.query(`
      SELECT lav.listing_id FROM listing_attribute_values lav
      JOIN filter_attributes fa ON fa.id = lav.attribute_id
      WHERE fa.type = 'enum' AND NOT EXISTS (
        SELECT 1 FROM filter_attribute_options fao 
        WHERE fao.attribute_id = lav.attribute_id AND fao.value = lav.value_text
      )
    `);
    expect(res.rows.length).toBe(0);
  });

  it('should allow full-text search against seeded content', async () => {
    const res = await request(app).get('/api/v1/listings/search?q=Toyota');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should allow dynamic filters via repository', async () => {
    if (!suvId) return;
    const res = await request(app).get(
      `/api/v1/listings?categoryId=${suvId}&filters=${encodeURIComponent(JSON.stringify({ transmission: 'automatic' }))}`
    );
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((l: any) => expect(l.transmission).toBe('automatic'));
  });

  it('should paginate deterministically without skipping or duplicating', async () => {
    const seen = new Set<string>();
    let cursor = undefined;
    const limit = 50;

    for (let i = 0; i < 20; i++) {
      const url = cursor 
        ? `/api/v1/listings/search?q=Test&limit=${limit}&cursor=${cursor}`
        : `/api/v1/listings/search?q=Test&limit=${limit}`;
      const res = await request(app).get(url);
      
      if (res.status !== 200 || !res.body.data) {
        console.error('Pagination failure:', res.body);
        break;
      }

      res.body.data.forEach((l: any) => expect(seen.has(l.id)).toBe(false));
      res.body.data.forEach((l: any) => seen.add(l.id));
      cursor = res.body.pagination.nextCursor;
      if (!cursor) break;
    }

    expect(seen.size).toBeGreaterThan(100);
  });

  it('should exclude removed listings from default browse', async () => {
    const insert = await pool.query(
      "INSERT INTO listings (model_id, category_id, title, year, mileage, price, condition, transmission, fuel_type, color, city, status) VALUES ((SELECT id FROM models LIMIT 1), (SELECT id FROM categories LIMIT 1), 'Removed Test', 2024, 1000, 1000, 'new', 'manual', 'petrol', 'white', 'Test', 'removed') RETURNING id"
    );
    insertedRemovedId = insert.rows[0].id;

    const res = await request(app).get('/api/v1/listings?limit=50');
    expect(res.status).toBe(200);
    const found = res.body.data.find((l: any) => l.id === insertedRemovedId);
    expect(found).toBeUndefined();
  });
});
