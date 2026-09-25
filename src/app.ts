import express from 'express';
import { testConnection } from './db/pool';
import { errorHandler } from './middleware/error-handler';
import { NotFoundError } from './shared/errors/app-error';
import categoryRoutes from './modules/categories/category.routes';
import listingRoutes from './modules/listings/listing.routes';

export const app = express();

app.use(express.json());

app.get('/health', async (_req, res) => {
  const dbConnected = await testConnection();
  const status = dbConnected ? 'ok' : 'degraded';
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
    data: {
      status,
      database: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    },
  });
});

app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/listings', listingRoutes);

app.use((req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
});

app.use(errorHandler);

