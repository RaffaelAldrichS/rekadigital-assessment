import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import * as dbPool from '../src/db/pool';

describe('GET /health', () => {
  it('returns 200 and healthy status when DB is connected', async () => {
    vi.spyOn(dbPool, 'testConnection').mockResolvedValueOnce(true);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data).toHaveProperty('timestamp');
  });

  it('returns 503 and degraded status when DB connection fails', async () => {
    vi.spyOn(dbPool, 'testConnection').mockResolvedValueOnce(false);

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database).toBe('disconnected');
  });
});
