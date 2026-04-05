import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';
import { PhotoshopClient } from '../../services/photoshop-client';
import { broadcastToWeb } from '../ws-server';
import type { ApiResponse, MockupTemplateListResponse } from '@temu-lister/shared';

export const mockupRouter = Router();

// GET /api/mockup/templates - List mockup templates
mockupRouter.get('/templates', (_req, res) => {
  const templates = dbAll('SELECT * FROM mockup_templates');
  const response: ApiResponse<MockupTemplateListResponse> = {
    success: true,
    data: { templates: templates as any[] },
  };
  res.json(response);
});

// POST /api/mockup/templates - Add mockup template
mockupRouter.post('/templates', (req, res) => {
  const { name, psdPath, smartObjectLayerName } = req.body;
  const id = uuid();

  dbRun(
    'INSERT INTO mockup_templates (id, name, psd_path, smart_object_layer_name) VALUES (?, ?, ?, ?)',
    [id, name, psdPath, smartObjectLayerName]
  );

  res.json({ success: true, data: { id } });
});

// DELETE /api/mockup/templates/:id
mockupRouter.delete('/templates/:id', (req, res) => {
  dbRun('DELETE FROM mockup_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// POST /api/mockup/batch - Start batch mockup processing
mockupRouter.post('/batch', async (req, res) => {
  const { config } = req.body;
  const { productIds, templateIds, removeBackground, exportFormat, jpgQuality } = config;

  // Respond immediately, process in background
  res.json({ success: true, data: { message: 'Batch mockup started' } });

  // Get PS settings
  const psHost = dbGet("SELECT value FROM settings WHERE key = 'ps_host'")?.value || '127.0.0.1';
  const psPort = parseInt(dbGet("SELECT value FROM settings WHERE key = 'ps_port'")?.value || '49494');
  const psPassword = dbGet("SELECT value FROM settings WHERE key = 'ps_password'")?.value || '';

  const placeholders = templateIds.map(() => '?').join(',');
  const templates = dbAll(`SELECT * FROM mockup_templates WHERE id IN (${placeholders})`, templateIds);

  const prodPlaceholders = productIds.map(() => '?').join(',');
  const products = dbAll(`SELECT * FROM products WHERE id IN (${prodPlaceholders})`, productIds);

  const total = products.length * templates.length;
  let current = 0;

  try {
    const psClient = new PhotoshopClient();
    await psClient.connect(psHost, psPort, psPassword);

    for (const product of products) {
      const images = dbAll(
        'SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1',
        [product.id]
      );

      if (images.length === 0) continue;

      for (const template of templates) {
        current++;
        broadcastToWeb({
          type: 'mockup:progress',
          id: uuid(),
          timestamp: Date.now(),
          payload: {
            current,
            total,
            productTitle: product.title,
            templateName: template.name,
            status: 'processing',
          },
        });

        try {
          const imagePath = images[0].local_path || images[0].original_url;
          const outputDir = dbGet("SELECT value FROM settings WHERE key = 'output_dir'")?.value || './output';
          const outputPath = `${outputDir}/${product.id}_${template.id}.${exportFormat}`;

          await psClient.replaceSmartObject(
            template.psd_path,
            template.smart_object_layer_name,
            imagePath,
            outputPath,
            exportFormat === 'jpg' ? jpgQuality : undefined
          );

          // Save mockup image record
          dbRun(
            'INSERT INTO mockup_images (id, product_id, source_image_id, template_id, output_path, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuid(), product.id, images[0].id, template.id, outputPath, current, new Date().toISOString()]
          );

          broadcastToWeb({
            type: 'mockup:progress',
            id: uuid(),
            timestamp: Date.now(),
            payload: {
              current,
              total,
              productTitle: product.title,
              templateName: template.name,
              status: 'completed',
            },
          });
        } catch (err) {
          broadcastToWeb({
            type: 'mockup:progress',
            id: uuid(),
            timestamp: Date.now(),
            payload: {
              current,
              total,
              productTitle: product.title,
              templateName: template.name,
              status: 'error',
              error: String(err),
            },
          });
        }
      }
    }

    psClient.disconnect();
  } catch (err) {
    console.error('Batch mockup error:', err);
  }
});

// POST /api/mockup/test-connection - Test PS connection
mockupRouter.post('/test-connection', async (req, res) => {
  const { host, port, password } = req.body;
  try {
    const client = new PhotoshopClient();
    await client.connect(host || '127.0.0.1', port || 49494, password || '');
    client.disconnect();
    res.json({ success: true, data: { message: 'Connected to Photoshop successfully' } });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});
