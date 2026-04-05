import { Router, type Router as RouterType } from 'express';
import { dbAll, dbGet, dbRun } from '../../services/database';
import type { ApiResponse, ProductListResponse, ProductDetailResponse } from '@temu-lister/shared';

export const productsRouter: RouterType = Router();

// GET /api/products - List all products
productsRouter.get('/', (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = (page - 1) * limit;

  const products = dbAll('SELECT * FROM products ORDER BY scraped_at DESC LIMIT ? OFFSET ?', [limit, offset]);
  const row = dbGet('SELECT COUNT(*) as count FROM products');
  const total = row?.count || 0;

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
