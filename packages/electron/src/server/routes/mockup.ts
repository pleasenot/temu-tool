import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { dbAll, dbGet, dbRun } from '../../services/database';
import { PhotoshopClient } from '../../services/photoshop-client';
import { broadcastToWeb } from '../ws-server';
import { getSetting } from '../../services/secure-settings';
import type { ApiResponse, MockupTemplateListResponse } from '@temu-lister/shared';

export const mockupRouter: RouterType = Router();

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

// GET /api/mockup/test-connection - Test PS connection using stored settings
mockupRouter.get('/test-connection', async (_req, res) => {
  const host = getSetting('ps_host') || '127.0.0.1';
  const port = parseInt(getSetting('ps_port') || '49494');
  const password = getSetting('ps_password') || '';

  const client = new PhotoshopClient();
  try {
    await client.connect(host, port, password);

    const jsx = `
      var docName = (app.documents.length > 0) ? app.activeDocument.name : "(no document)";
      "PS " + app.version + " | docs=" + app.documents.length + " | active=" + docName + " | os=" + $.os;
    `;
    const result = await client.executeScript(jsx, 8000);
    client.disconnect();
    res.json({
      success: true,
      data: {
        message: 'Photoshop verified',
        info: result,
      },
    });
  } catch (err) {
    try { client.disconnect(); } catch {}
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/mockup/test-connection - Test PS connection (real handshake + JSX ping)
mockupRouter.post('/test-connection', async (req, res) => {
  const { host, port, password } = req.body;
  const client = new PhotoshopClient();
  try {
    await client.connect(host || '127.0.0.1', port || 49494, password || '');
    // Run a real JSX command. PS will compute & send back a string we can verify.
    const jsx = `
      var docName = (app.documents.length > 0) ? app.activeDocument.name : "(no document)";
      "PS " + app.version + " | docs=" + app.documents.length + " | active=" + docName + " | os=" + $.os;
    `;
    const result = await client.executeScript(jsx, 8000);
    client.disconnect();
    res.json({
      success: true,
      data: {
        message: 'Photoshop verified ✓',
        info: result,
      },
    });
  } catch (err) {
    try { client.disconnect(); } catch {}
    res.json({ success: false, error: String(err) });
  }
});

// === Directory-based mockup endpoints ===

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']);
const RESIZE_MODES = new Set(['fit', 'fill', 'stretch', 'none']);

function normalizeResizeMode(value: unknown): 'fit' | 'fill' | 'stretch' | 'none' {
  return typeof value === 'string' && RESIZE_MODES.has(value)
    ? (value as 'fit' | 'fill' | 'stretch' | 'none')
    : 'fill';
}

function scanPsdFiles(templateDir: string): { name: string; dir: string; path: string; size: number }[] {
  const files: { name: string; dir: string; path: string; size: number }[] = [];
  const entries = fs.readdirSync(templateDir);

  for (const entry of entries) {
    const fullPath = path.join(templateDir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isFile() && path.extname(entry).toLowerCase() === '.psd') {
      files.push({ name: entry, dir: templateDir, path: fullPath, size: stat.size });
      continue;
    }

    if (stat.isDirectory()) {
      for (const sub of fs.readdirSync(fullPath)) {
        const subPath = path.join(fullPath, sub);
        const subStat = fs.statSync(subPath);
        if (subStat.isFile() && path.extname(sub).toLowerCase() === '.psd') {
          files.push({ name: sub, dir: fullPath, path: subPath, size: subStat.size });
        }
      }
    }
  }

  return files;
}

// POST /api/mockup/scan-dir - Scan directory for image files
mockupRouter.post('/scan-dir', (req, res) => {
  const { dirPath } = req.body;
  if (!dirPath) return res.json({ success: false, error: 'dirPath is required' });

  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return res.json({ success: false, error: '目录不存在' });
    }
    const entries = fs.readdirSync(dirPath);
    const files = entries
      .filter((f: string) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map((f: string) => {
        const fullPath = path.join(dirPath, f);
        const stat = fs.statSync(fullPath);
        return { path: fullPath, name: f, size: stat.size };
      });
    res.json({ success: true, data: { files, count: files.length } });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/mockup/scan-templates - Scan directory for PSD files
mockupRouter.post('/scan-templates', (req, res) => {
  const { dirPath } = req.body;
  if (!dirPath) return res.json({ success: false, error: 'dirPath is required' });

  try {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return res.json({ success: false, error: '目录不存在' });
    }
    const templates = scanPsdFiles(dirPath).map(({ path: filePath, name, size }) => ({
      path: filePath,
      name,
      size,
    }));
    res.json({ success: true, data: { templates, count: templates.length } });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/mockup/detect-layers - Auto-detect smart object layers in a PSD
mockupRouter.post('/detect-layers', async (req, res) => {
  const { psdPath } = req.body;
  if (!psdPath) return res.json({ success: false, error: 'psdPath is required' });

  const psHost = getSetting('ps_host') || '127.0.0.1';
  const psPort = parseInt(getSetting('ps_port') || '49494');
  const psPassword = getSetting('ps_password') || '';

  const client = new PhotoshopClient();
  try {
    await client.connect(psHost, psPort, psPassword);
    const smartObjectLayers = await client.getSmartObjectLayers(psdPath);
    client.disconnect();
    res.json({ success: true, data: { smartObjectLayers } });
  } catch (err) {
    try { client.disconnect(); } catch {}
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/mockup/batch-dir - Batch mockup from directory
// Each image × each template → separate folder with per-scene exports (1.jpg, 2.jpg...)
mockupRouter.post('/batch-dir', async (req, res) => {
  try {
    const { config } = req.body;
    if (!config) {
      return res.json({ success: false, error: '缺少 config 参数' });
    }
    const {
      imageDir,
      templateDir,
      outputDir,
      exportFormat = 'jpg',
      jpgQuality = 10,
    } = config;
    const resizeMode = normalizeResizeMode(config.resizeMode);

    // Validate
    if (!imageDir || !templateDir || !outputDir) {
      return res.json({ success: false, error: '缺少必要参数（图片目录、模板目录、输出目录）' });
    }

    console.log('[batch-dir] imageDir:', imageDir, 'templateDir:', templateDir, 'outputDir:', outputDir);

    // Scan images
    const imgEntries = fs.readdirSync(imageDir);
    const imageFiles = imgEntries.filter((f: string) => IMAGE_EXTS.has(path.extname(f).toLowerCase()));
    if (imageFiles.length === 0) {
      return res.json({ success: false, error: '图片目录中没有图片文件' });
    }

    const psdFiles = scanPsdFiles(templateDir);
    if (psdFiles.length === 0) {
      return res.json({ success: false, error: '模板目录中没有 PSD 文件' });
    }

    console.log('[batch-dir] Found', imageFiles.length, 'images,', psdFiles.length, 'PSD templates');

    // Ensure output dir exists
    fs.mkdirSync(outputDir, { recursive: true });

    const totalJobs = imageFiles.length * psdFiles.length;
    res.json({ success: true, data: { message: 'Batch mockup started', totalJobs } });

  // Background processing
  const psHost = getSetting('ps_host') || '127.0.0.1';
  const psPort = parseInt(getSetting('ps_port') || '49494');
  const psPassword = getSetting('ps_password') || '';

  let current = 0;

  try {
    const psClient = new PhotoshopClient();
    await psClient.connect(psHost, psPort, psPassword);

    for (const imageFile of imageFiles) {
      const imagePath = path.join(imageDir, imageFile);
      const imageName = path.basename(imageFile, path.extname(imageFile));

      for (const psdEntry of psdFiles) {
        current++;
        const psdPath = path.join(psdEntry.dir, psdEntry.name);
        const templateName = path.basename(psdEntry.name, '.psd');

        // Output: outputDir / templateName / imageName / 1.jpg, 2.jpg...
        const sceneOutputDir = path.join(outputDir, templateName, imageName);
        fs.mkdirSync(sceneOutputDir, { recursive: true });

        broadcastToWeb({
          type: 'mockup:progress',
          id: uuid(),
          timestamp: Date.now(),
          payload: {
            current,
            total: totalJobs,
            productTitle: imageFile,
            templateName,
            status: 'processing',
          },
        });

        try {
          const sceneCount = await psClient.replaceAndExportScenes(
            psdPath,
            imagePath,
            sceneOutputDir,
            exportFormat,
            jpgQuality,
            resizeMode
          );

          broadcastToWeb({
            type: 'mockup:progress',
            id: uuid(),
            timestamp: Date.now(),
            payload: {
              current,
              total: totalJobs,
              productTitle: imageFile,
              templateName,
              status: 'completed',
              sceneCount,
            },
          });
        } catch (err) {
          broadcastToWeb({
            type: 'mockup:progress',
            id: uuid(),
            timestamp: Date.now(),
            payload: {
              current,
              total: totalJobs,
              productTitle: imageFile,
              templateName,
              status: 'error',
              error: String(err),
            },
          });
        }
      }
    }

    psClient.disconnect();
  } catch (err) {
    console.error('Batch dir mockup error:', err);
  }
  } catch (outerErr) {
    console.error('[batch-dir] Handler error:', outerErr);
    if (!res.headersSent) {
      res.json({ success: false, error: String(outerErr) });
    }
  }
});
