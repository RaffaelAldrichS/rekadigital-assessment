import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validation';
import { errorHandler } from '../src/middleware/error-handler';
import { NotFoundError, ConflictError, AppError } from '../src/shared/errors/app-error';

describe('Error Handler & Validation Middleware', () => {
  const createTestApp = () => {
    const testApp = express();
    testApp.use(express.json());

    // Test route for validation
    testApp.post(
      '/test-validation',
      validateRequest({
        body: z.object({
          name: z.string().min(3),
          age: z.number().min(18),
        }),
      }),
      (_req, res) => {
        res.json({ success: true });
      }
    );

    // Test routes for custom errors
    testApp.get('/test-not-found', (_req, _res, next) => {
      next(new NotFoundError('Custom not found message'));
    });

    testApp.get('/test-conflict', (_req, _res, next) => {
      next(new ConflictError('Custom conflict message'));
    });

    testApp.get('/test-app-error', (_req, _res, next) => {
      next(new AppError(422, 'UNPROCESSABLE_ENTITY', 'Custom domain error'));
    });

    testApp.get('/test-500', (_req, _res, next) => {
      next(new Error('Unexpected error'));
    });

    testApp.use(errorHandler);
    return testApp;
  };

  const testApp = createTestApp();

  it('returns 400 with VALIDATION_ERROR envelope on validation failure', async () => {
    const res = await request(testApp)
      .post('/test-validation')
      .send({ name: 'a', age: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { field: 'name', message: expect.any(String) },
          { field: 'age', message: expect.any(String) },
        ],
      },
    });
  });

  it('returns 404 with NOT_FOUND code on NotFoundError', async () => {
    const res = await request(testApp).get('/test-not-found');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Custom not found message',
      },
    });
  });

  it('returns 409 with CONFLICT code on ConflictError', async () => {
    const res = await request(testApp).get('/test-conflict');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Custom conflict message',
      },
    });
  });

  it('returns 422 for custom AppError', async () => {
    const res = await request(testApp).get('/test-app-error');

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Custom domain error',
      },
    });
  });

  it('returns 500 with INTERNAL_SERVER_ERROR on unhandled error', async () => {
    const res = await request(testApp).get('/test-500');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });
});
