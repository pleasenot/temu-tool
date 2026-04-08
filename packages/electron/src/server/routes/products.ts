import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';
import type { ApiResponse, ProductListResponse, ProductDetailResponse } from '@temu-lister/shared';

export const productsRouter: RouterType = Router();

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
    return {
      ...mapProduct(p),
      thumbnail: thumb?.original_url || null,
      image_count: imgCount?.count || 0,
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
  dbRun('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
  res.json({ success: true });
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

  const response: ApiResponse<ProductDetailResponse> = {
    success: true,
    data: {
      product: mapProduct(product),
      images: images as any[],
      mockups: mockups as any[],
    },
  };
  res.json(response);
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
