import express from 'express';
import cors from 'cors';
import path from 'path';
import { productsRouter } from './routes/products';
import { mockupRouter } from './routes/mockup';
import { pricingRouter } from './routes/pricing';
import { listingRouter } from './routes/listing';
import { settingsRouter } from './routes/settings';

export function startHttpServer(port: number) {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '50mb' }));

  // REST API routes
  app.use('/api/products', productsRouter);
  app.use('/api/mockup', mockupRouter);
  app.use('/api/pricing', pricingRouter);
  app.use('/api/listing', listingRouter);
  app.use('/api/settings', settingsRouter);

  // Serve React SPA static files
  const webDistPath = path.resolve(__dirname, '../../../web/dist');
  app.use(express.static(webDistPath));

  // SPA fallback - serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });

  app.listen(port, '127.0.0.1', () => {
    console.log(`HTTP server listening on http://localhost:${port}`);
  });

  return app;
}
