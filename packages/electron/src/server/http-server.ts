import express from 'express';
import cors from 'cors';
import path from 'path';
import { getUploadsDir } from '../services/storage';
import { productsRouter } from './routes/products';
import { mockupRouter } from './routes/mockup';
import { listingRouter } from './routes/listing';
import { settingsRouter } from './routes/settings';
import { templateRouter } from './routes/templates';

export function startHttpServer(port: number): void {
  const app = express();

  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '50mb' }));

  // Serve uploaded local images
  app.use('/uploads', express.static(getUploadsDir()));

  // REST API routes
  app.use('/api/products', productsRouter);
  app.use('/api/mockup', mockupRouter);
  app.use('/api/listing', listingRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/templates', templateRouter);

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

}
