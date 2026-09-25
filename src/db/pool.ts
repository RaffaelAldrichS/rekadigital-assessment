import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error on idle client:', err);
});

export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch (error) {
    console.error('PostgreSQL connection test failed:', error);
    return false;
  }
}
