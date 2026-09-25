import fs from 'fs';
import path from 'path';
import { pool } from '../pool';

export async function runMigrations(migrationsDir?: string): Promise<void> {
  const dir = migrationsDir || path.join(__dirname);
  
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM schema_migrations');
    const appliedSet = new Set(rows.map((r) => r.name));

    if (!fs.existsSync(dir)) {
      console.log(`Migrations directory ${dir} does not exist, skipping.`);
      return;
    }

    const files = fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const filePath = path.join(dir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`Applying migration: ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`Applied migration successfully: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
