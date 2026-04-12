import { Router, type Router as RouterType, raw } from 'express';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { dbAll, dbGet, dbRun } from '../../services/database';
import { getUploadsDir, getVideosDir } from '../../services/storage';
import { MiniMaxClient } from '../../services/minimax-client';
import { fetchTrendingKeywords } from '../../services/temu-keywords';
import { enqueueVideoGeneration } from '../../services/video-task-queue';
import { broadcastToWeb } from '../ws-server';
import type { ApiResponse, ProductListResponse, ProductDetailResponse } from '@temu-lister/shared';

const rawUpload = raw({ type: '*/*', limit: '25mb' });

function saveUploaded(buf: Buffer, filenameHint?: string): string {
  const ext = (() => {
    if (filenameHint) {
      const e = path.extname(filenameHint).toLowerCase();
      if (e && e.length <= 6) return e;
    }
    // sniff a couple of common types
    if (buf.length > 4) {
      if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
      if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
      if (buf[0] === 0x47 && buf[1] === 0x49) return '.gif';
      if (buf[0] === 0x52 && buf[1] === 0x49) return '.webp';
    }
    return '.bin';
  })();
  const name = uuid() + ext;
  fs.writeFileSync(path.join(getUploadsDir(), name), buf);
  return `/uploads/${name}`;
}

export const productsRouter: RouterType = Router();

// POST /api/products/bulk-add-image?productIds=id1,id2,id3
// Body: raw image bytes (same pattern as /:id/images/upload)
// Header: X-Filename for extension hint
// Saves the file once, then appends it to each selected product at sort_order = MAX+1.
productsRouter.post('/bulk-add-image', rawUpload, (req, res) => {
  const idsParam = String(req.query.productIds || '').trim();
  const productIds = idsParam.split(',').map(s => s.trim()).filter(Boolean);
  if (productIds.length === 0) {
    res.status(400).json({ success: false, error: 'productIds query param required' });
    return;
  }
  const buf = req.body as Buffer;
  if (!buf || !buf.length) {
    res.status(400).json({ success: false, error: 'empty body' });
    return;
  }
  const filename = (req.headers['x-filename'] as string) || '';
  const url = saveUploaded(buf, filename);

  const inserted: Array<{ productId: string; imageId: string }> = [];
  for (const pid of productIds) {
    const exists = dbGet('SELECT 1 FROM products WHERE id = ?', [pid]);
    if (!exists) continue;
    const max = dbGet(
      'SELECT MAX(sort_order) as max FROM product_images WHERE product_id = ?',
      [pid]
    );
    const nextOrder = (max?.max ?? -1) + 1;
    const imageId = uuid();
    dbRun(
      'INSERT INTO product_images (id, product_id, original_url, sort_order) VALUES (?, ?, ?, ?)',
      [imageId, pid, url, nextOrder]
    );
    inserted.push({ productId: pid, imageId });
  }

  res.json({ success: true, data: { url, inserted } });
});

// POST /api/products/bulk-title-replace
// Body: { productIds: string[], find: string, replace: string }
// Plain string replace (not regex); returns the before/after preview.
productsRouter.post('/bulk-title-replace', (req, res) => {
  const { productIds, find, replace } = req.body || {};
  if (!Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ success: false, error: 'productIds required' });
    return;
  }
  if (typeof find !== 'string' || find.length === 0) {
    res.status(400).json({ success: false, error: 'find required' });
    return;
  }
  const replaceStr = typeof replace === 'string' ? replace : '';

  const preview: Array<{ id: string; oldTitle: string; newTitle: string }> = [];
  for (const pid of productIds) {
    const row = dbGet('SELECT id, title FROM products WHERE id = ?', [pid]);
    if (!row) continue;
    const oldTitle = String(row.title || '');
    if (!oldTitle.includes(find)) continue;
    const newTitle = oldTitle.split(find).join(replaceStr);
    if (newTitle === oldTitle) continue;
    dbRun('UPDATE products SET title = ? WHERE id = ?', [newTitle, pid]);
    preview.push({ id: pid, oldTitle, newTitle });
  }

  res.json({ success: true, data: { updated: preview.length, preview } });
});

// POST /api/products/bulk-title-ai
// Body: { productIds: string[] }
// Serially rewrites each product title via MiniMax chatCompletion.
// Returns immediately; progress is pushed via WebSocket (title-ai:progress).
productsRouter.post('/bulk-title-ai', async (req, res) => {
  const { productIds } = req.body || {};
  if (!Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ success: false, error: 'productIds required' });
    return;
  }

  // Respond immediately so the client can start listening for WS progress.
  res.json({ success: true, data: { total: productIds.length } });

  // Fire-and-forget worker. Errors per product are reported via WS, not thrown.
  (async () => {
    let client: MiniMaxClient;
    try {
      client = new MiniMaxClient();
    } catch (err) {
      broadcastToWeb({
        type: 'title-ai:progress',
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          current: 0,
          total: productIds.length,
          productId: '',
          status: 'error',
          error: String(err),
        },
      });
      return;
    }

    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const row = dbGet('SELECT id, title, category FROM products WHERE id = ?', [pid]);
      if (!row) continue;
      const oldTitle = String(row.title || '').slice(0, 500);
      const category = String(row.category || '').slice(0, 100);

      let keywords: string[] = [];
      try {
        keywords = await fetchTrendingKeywords();
      } catch {
        keywords = [];
      }

      const prompt =
        `你是 Temu 跨境电商的标题优化专家。请为下面的商品生成一个更符合 Temu 英文搜索习惯的新标题：\n` +
        `- 原标题: ${oldTitle}\n` +
        (category ? `- 类目: ${category}\n` : '') +
        (keywords.length ? `- 可用流量词（优先融入）: ${keywords.join(', ')}\n` : '') +
        `要求：\n` +
        `1. 只输出最终标题本身，不要解释、不要引号、不要任何前后缀\n` +
        `2. 控制在 120 个英文字符以内\n` +
        `3. 保留原商品的关键卖点（材质/尺寸/用途等）`;

      try {
        const newTitle = (await client.chatCompletion([
          { role: 'user', content: prompt },
        ])).slice(0, 250);

        if (newTitle && newTitle !== oldTitle) {
          dbRun('UPDATE products SET title = ? WHERE id = ?', [newTitle, pid]);
        }

        broadcastToWeb({
          type: 'title-ai:progress',
          id: uuid(),
          timestamp: Date.now(),
          payload: {
            current: i + 1,
            total: productIds.length,
            productId: pid,
            oldTitle,
            newTitle,
            status: 'success',
          },
        });
      } catch (err) {
        broadcastToWeb({
          type: 'title-ai:progress',
          id: uuid(),
          timestamp: Date.now(),
          payload: {
            current: i + 1,
            total: productIds.length,
            productId: pid,
            oldTitle,
            status: 'error',
            error: String(err),
          },
        });
      }

      // Soft rate-limit between calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  })();
});

// POST /api/products/bulk-generate-video
// Body: { productIds: string[], promptTemplate?: string, duration?: 6|10, resolution?: '768P'|'1080P' }
// Submits one MiniMax image-to-video task per product using its first image
// as the first-frame. Queue worker polls + downloads + writes to uploads/videos.
productsRouter.post('/bulk-generate-video', async (req, res) => {
  const { productIds, promptTemplate, duration, resolution } = req.body || {};
  if (!Array.isArray(productIds) || productIds.length === 0) {
    res.status(400).json({ success: false, error: 'productIds required' });
    return;
  }

  let queued = 0;
  const errors: Array<{ productId: string; error: string }> = [];
  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i];
    const product = dbGet('SELECT id, title FROM products WHERE id = ?', [pid]);
    if (!product) { errors.push({ productId: pid, error: 'not found' }); continue; }
    const img = dbGet(
      'SELECT original_url FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1',
      [pid]
    );
    const imageUrl = img?.original_url;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      errors.push({ productId: pid, error: 'no usable first image' });
      continue;
    }

    const base = (promptTemplate && String(promptTemplate).trim()) ||
      '[Static shot] product on white background, professional lighting';
    const title = String(product.title || '').slice(0, 120);
    const prompt = title ? `${base}, ${title}` : base;

    try {
      await enqueueVideoGeneration({
        productId: pid,
        imageUrl,
        prompt,
        duration,
        resolution,
        index: i + 1,
        total: productIds.length,
      });
      queued += 1;
    } catch (err) {
      errors.push({ productId: pid, error: String(err) });
    }

    // Soft pacing between submit calls to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  res.json({ success: true, data: { queued, total: productIds.length, errors } });
});

// GET /api/products - List all products (each with thumbnail)
productsRouter.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const products = dbAll('SELECT * FROM products ORDER BY scraped_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  const row = dbGet('SELECT COUNT(*) as count FROM products');
  const total = row?.count || 0;

  const enriched = products.map((p: any) => {
    const thumb = dbGet(
      'SELECT original_url FROM product_images WHERE product_id = ? ORDER BY sort_order LIMIT 1',
      [p.id]
    );
    const imgCount = dbGet(
      'SELECT COUNT(*) as count FROM product_images WHERE product_id = ?',
      [p.id]
    );
    const videoCount = dbGet(
      "SELECT COUNT(*) as count FROM product_videos WHERE product_id = ? AND status = 'success'",
      [p.id]
    );
    return {
      ...mapProduct(p),
      thumbnail: thumb?.original_url || null,
      image_count: imgCount?.count || 0,
      video_count: videoCount?.count || 0,
    };
  });

  const response: ApiResponse<ProductListResponse> = {
    success: true,
    data: { products: enriched as any, total },
  };
  res.json(response);
});

// PUT /api/products/:id - Update product fields (title, price, category)
productsRouter.put('/:id', (req, res) => {
  const { title, price, category } = req.body || {};
  const existing = dbGet('SELECT id FROM products WHERE id = ?', [req.params.id]);
  if (!existing) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }
  const fields: string[] = [];
  const values: any[] = [];
  if (typeof title === 'string') { fields.push('title = ?'); values.push(title); }
  if (price !== undefined) { fields.push('price = ?'); values.push(price); }
  if (category !== undefined) { fields.push('category = ?'); values.push(category); }
  if (fields.length === 0) {
    res.json({ success: true });
    return;
  }
  values.push(req.params.id);
  dbRun(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
  res.json({ success: true });
});

// POST /api/products/:id/images - Add image
productsRouter.post('/:id/images', (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    res.status(400).json({ success: false, error: 'url required' });
    return;
  }
  const max = dbGet(
    'SELECT MAX(sort_order) as max FROM product_images WHERE product_id = ?',
    [req.params.id]
  );
  const nextOrder = (max?.max ?? -1) + 1;
  const imageId = uuid();
  dbRun(
    'INSERT INTO product_images (id, product_id, original_url, sort_order) VALUES (?, ?, ?, ?)',
    [imageId, req.params.id, url, nextOrder]
  );
  res.json({ success: true, data: { id: imageId, original_url: url, sort_order: nextOrder } });
});

// DELETE /api/products/:id/images/:imageId - Delete an image
productsRouter.delete('/:id/images/:imageId', (req, res) => {
  const row = dbGet(
    'SELECT original_url FROM product_images WHERE id = ? AND product_id = ?',
    [req.params.imageId, req.params.id]
  );
  // If it's a local upload, also remove the file
  if (row?.original_url && typeof row.original_url === 'string' && row.original_url.startsWith('/uploads/')) {
    const file = path.join(getUploadsDir(), path.basename(row.original_url));
    try { fs.unlinkSync(file); } catch {}
  }
  dbRun('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
  res.json({ success: true });
});

// POST /api/products/:id/images/upload - Upload a local image as new image
productsRouter.post('/:id/images/upload', rawUpload, (req, res) => {
  const buf = req.body as Buffer;
  if (!buf || !buf.length) {
    res.status(400).json({ success: false, error: 'empty body' });
    return;
  }
  const filename = (req.headers['x-filename'] as string) || '';
  const url = saveUploaded(buf, filename);
  const max = dbGet(
    'SELECT MAX(sort_order) as max FROM product_images WHERE product_id = ?',
    [req.params.id]
  );
  const nextOrder = (max?.max ?? -1) + 1;
  const imageId = uuid();
  dbRun(
    'INSERT INTO product_images (id, product_id, original_url, sort_order) VALUES (?, ?, ?, ?)',
    [imageId, req.params.id, url, nextOrder]
  );
  res.json({ success: true, data: { id: imageId, original_url: url, sort_order: nextOrder } });
});

// PUT /api/products/:id/images/:imageId/upload - Replace an existing image's file
productsRouter.put('/:id/images/:imageId/upload', rawUpload, (req, res) => {
  const buf = req.body as Buffer;
  if (!buf || !buf.length) {
    res.status(400).json({ success: false, error: 'empty body' });
    return;
  }
  const old = dbGet(
    'SELECT original_url FROM product_images WHERE id = ? AND product_id = ?',
    [req.params.imageId, req.params.id]
  );
  if (!old) {
    res.status(404).json({ success: false, error: 'image not found' });
    return;
  }
  // Clean up the previous local file (if any)
  if (typeof old.original_url === 'string' && old.original_url.startsWith('/uploads/')) {
    const oldFile = path.join(getUploadsDir(), path.basename(old.original_url));
    try { fs.unlinkSync(oldFile); } catch {}
  }
  const filename = (req.headers['x-filename'] as string) || '';
  const url = saveUploaded(buf, filename);
  dbRun(
    'UPDATE product_images SET original_url = ? WHERE id = ? AND product_id = ?',
    [url, req.params.imageId, req.params.id]
  );
  res.json({ success: true, data: { id: req.params.imageId, original_url: url } });
});

// GET /api/products/:id - Get product detail
productsRouter.get('/:id', (req, res) => {
  const product = dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  const images = dbAll('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [req.params.id]);
  const mockups = dbAll('SELECT * FROM mockup_images WHERE product_id = ? ORDER BY sort_order', [req.params.id]);
  const videos = dbAll(
    `SELECT id, file_path, status, duration, resolution, error_msg, created_at, file_size
     FROM product_videos WHERE product_id = ? ORDER BY created_at DESC`,
    [req.params.id]
  );

  const response: ApiResponse<ProductDetailResponse> = {
    success: true,
    data: {
      product: mapProduct(product),
      images: images as any[],
      mockups: mockups as any[],
      videos: videos as any[],
    },
  };
  res.json(response);
});

// DELETE /api/products/:id/videos/:videoId - Delete one generated video
productsRouter.delete('/:id/videos/:videoId', (req, res) => {
  const row = dbGet(
    'SELECT file_path FROM product_videos WHERE id = ? AND product_id = ?',
    [req.params.videoId, req.params.id]
  );
  if (!row) {
    res.status(404).json({ success: false, error: 'video not found' });
    return;
  }
  const filePath = row.file_path as string;
  if (typeof filePath === 'string' && filePath.startsWith('/uploads/videos/')) {
    try {
      fs.unlinkSync(path.join(getVideosDir(), path.basename(filePath)));
    } catch {}
  }
  dbRun('DELETE FROM product_videos WHERE id = ?', [req.params.videoId]);
  res.json({ success: true });
});

// DELETE /api/products/:id - Delete product
productsRouter.delete('/:id', (req, res) => {
  dbRun('DELETE FROM product_images WHERE product_id = ?', [req.params.id]);
  dbRun('DELETE FROM mockup_images WHERE product_id = ?', [req.params.id]);
  dbRun('DELETE FROM product_pricing WHERE product_id = ?', [req.params.id]);
  dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

function mapProduct(row: any) {
  return {
    ...row,
    specifications: row.specifications ? JSON.parse(row.specifications) : undefined,
    skuVariants: row.sku_variants ? JSON.parse(row.sku_variants) : undefined,
  };
}
