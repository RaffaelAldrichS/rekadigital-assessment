import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '../src/db/migrations/runner';
import { pool } from '../src/db/pool';

describe('SQL Migration Runner', () => {
  const testMigrationsDir = path.join(__dirname, 'tmp_migrations');

  beforeEach(() => {
    if (fs.existsSync(testMigrationsDir)) {
      fs.rmSync(testMigrationsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testMigrationsDir, { recursive: true });
  });

  it('executes unapplied sql migrations in sequence', async () => {
    fs.writeFileSync(
      path.join(testMigrationsDir, '001_test.sql'),
      'CREATE TABLE test_table (id INT);'
    );

    const mockQuery = vi.fn().mockImplementation((queryText: string) => {
      if (queryText.includes('SELECT name FROM schema_migrations')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockClient = {
      query: mockQuery,
      release: vi.fn(),
    };

    vi.spyOn(pool, 'connect').mockResolvedValue(mockClient as any);

    await runMigrations(testMigrationsDir);

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'));
    expect(mockQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockQuery).toHaveBeenCalledWith('CREATE TABLE test_table (id INT);');
    expect(mockQuery).toHaveBeenCalledWith('INSERT INTO schema_migrations (name) VALUES ($1)', ['001_test.sql']);
    expect(mockQuery).toHaveBeenCalledWith('COMMIT');

    fs.rmSync(testMigrationsDir, { recursive: true, force: true });
  });
});
