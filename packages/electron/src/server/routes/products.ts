import { Router } from 'express';
import { getDb } from '../../services/database';
import type { ApiResponse, ProductListResponse, ProductDetailResponse } from '@temu-lister/shared';

export const productsRouter = Router();

// GET /api/products - List all products
productsRouter.get('/', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const products = db.prepare('SELECT * FROM products ORDER BY scraped_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = (db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number }).count;

  const response: ApiResponse<ProductListResponse> = {
    success: true,
    data: {
      products: products.map(mapProduct),
      total,
    },
  };
  res.json(response);
});

// GET /api/products/:id - Get product detail
productsRouter.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

  if (!product) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return;
  }

  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order').all(req.params.id);
  const mockups = db.prepare('SELECT * FROM mockup_images WHERE product_id = ? ORDER BY sort_order').all(req.params.id);

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
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

function mapProduct(row: any) {
  return {
    ...row,
    specifications: row.specifications ? JSON.parse(row.specifications) : undefined,
    skuVariants: row.sku_variants ? JSON.parse(row.sku_variants) : undefined,
  };
}
