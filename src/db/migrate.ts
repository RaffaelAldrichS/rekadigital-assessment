import path from 'path';
import { runMigrations } from './migrations/runner';
import { pool } from './pool';

async function main() {
  try {
    const migrationsDir = path.join(__dirname, 'migrations');
    await runMigrations(migrationsDir);
    console.log('All migrations completed successfully.');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
