import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '../src/db/migrations/runner';
import { pool } from '../src/db/pool';

describe('Relational Schema & Migrations', () => {
  const migrationsDir = path.join(__dirname, '../src/db/migrations');
  const schemaFile = path.join(migrationsDir, '001_init.sql');

  it('migration file 001_init.sql exists', () => {
    expect(fs.existsSync(schemaFile)).toBe(true);
  });

  it('contains all 10 core tables defined in TECHNICAL_SPEC.md', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');

    const expectedTables = [
      'makes',
      'models',
      'categories',
      'category_closure',
      'listings',
      'listing_images',
      'filter_attributes',
      'category_filter_attributes',
      'filter_attribute_options',
      'listing_attribute_values',
    ];

    for (const table of expectedTables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'i'));
    }
  });

  it('contains required constraints (CHECK, UNIQUE, Foreign Keys)', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');

    // CHECK constraints
    expect(sql).toMatch(/year > 1885/i);
    expect(sql).toMatch(/mileage >= 0/i);
    expect(sql).toMatch(/price >= 0/i);
    expect(sql).toMatch(/status IN \('available', 'pending', 'sold', 'removed'\)/i);
    expect(sql).toMatch(/depth >= 0/i);
    expect(sql).toMatch(/type IN \('enum', 'range', 'boolean'\)/i);
    expect(sql).toMatch(/check_single_value_populated/i);

    // Foreign Keys
    expect(sql).toMatch(/REFERENCES makes\(id\)/i);
    expect(sql).toMatch(/REFERENCES models\(id\)/i);
    expect(sql).toMatch(/REFERENCES categories\(id\)/i);
    expect(sql).toMatch(/REFERENCES listings\(id\)/i);
    expect(sql).toMatch(/REFERENCES filter_attributes\(id\)/i);
  });

  it('contains closure table structure with composite PK (ancestor_id, descendant_id)', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');
    expect(sql).toMatch(/PRIMARY KEY \(ancestor_id, descendant_id\)/i);
  });

  it('contains typed EAV storage structure for listing_attribute_values', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');
    expect(sql).toMatch(/value_text/i);
    expect(sql).toMatch(/value_numeric/i);
    expect(sql).toMatch(/value_boolean/i);
    expect(sql).toMatch(/PRIMARY KEY \(listing_id, attribute_id\)/i);
  });

  it('contains search_vector tsvector column and GIN index', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');
    expect(sql).toMatch(/search_vector TSVECTOR/i);
    expect(sql).toMatch(/USING GIN \(search_vector\)/i);
    expect(sql).toMatch(/trg_listings_search_vector/i);
  });

  it('contains all required secondary and performance indexes', () => {
    const sql = fs.readFileSync(schemaFile, 'utf-8');

    const expectedIndexes = [
      'idx_models_make_id',
      'idx_categories_parent_id',
      'idx_category_closure_ancestor_descendant',
      'idx_category_closure_descendant_ancestor',
      'idx_listings_model_id',
      'idx_listings_category_id',
      'idx_listings_status',
      'idx_listings_year',
      'idx_listings_price',
      'idx_listings_created_id_desc',
      'idx_listings_composite_filter',
      'idx_listings_search_vector',
      'idx_listing_images_listing_sort',
      'idx_filter_attr_opts_attr_val',
      'idx_listing_attr_vals_attr_text',
      'idx_listing_attr_vals_attr_numeric',
      'idx_listing_attr_vals_attr_boolean',
    ];

    for (const idx of expectedIndexes) {
      expect(sql).toContain(idx);
    }
  });

  it('executes schema migration cleanly via runMigrations', async () => {
    const executedQueries: string[] = [];

    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      executedQueries.push(typeof queryText === 'string' ? queryText : (queryText as any).text);
      if (typeof queryText === 'string' && queryText.includes('SELECT name FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

    await runMigrations(migrationsDir);

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'));
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS listings'));
    expect(mockQuery).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', ['001_init.sql']);
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');
  });
});
