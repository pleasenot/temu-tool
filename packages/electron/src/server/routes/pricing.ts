import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';
import type { ApiResponse, PricingTemplateListResponse } from '@temu-lister/shared';

export const pricingRouter: RouterType = Router();

// GET /api/pricing/templates
pricingRouter.get('/templates', (_req, res) => {
  const templates = dbAll('SELECT * FROM pricing_templates ORDER BY updated_at DESC');
  const response: ApiResponse<PricingTemplateListResponse> = {
    success: true,
    data: {
      templates: templates.map((t: any) => ({
        ...t,
        defaultValues: JSON.parse(t.default_values),
      })),
    },
  };
  res.json(response);
});

// POST /api/pricing/templates
pricingRouter.post('/templates', (req, res) => {
  const { name, defaultValues } = req.body;
  const id = uuid();
  const now = new Date().toISOString();

  dbRun(
    'INSERT INTO pricing_templates (id, name, default_values, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, JSON.stringify(defaultValues), now, now]
  );

  res.json({ success: true, data: { id } });
});

// PUT /api/pricing/templates/:id
pricingRouter.put('/templates/:id', (req, res) => {
  const { name, defaultValues } = req.body;
  const now = new Date().toISOString();

  dbRun(
    'UPDATE pricing_templates SET name = ?, default_values = ?, updated_at = ? WHERE id = ?',
    [name, JSON.stringify(defaultValues), now, req.params.id]
  );

  res.json({ success: true });
});

// DELETE /api/pricing/templates/:id
pricingRouter.delete('/templates/:id', (req, res) => {
  dbRun('DELETE FROM pricing_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// POST /api/pricing/apply - Apply template to products
pricingRouter.post('/apply', (req, res) => {
  const { templateId, productIds, overrides } = req.body;

  for (const productId of productIds) {
    const productOverrides = overrides?.[productId] ? JSON.stringify(overrides[productId]) : null;

    // Check if exists
    const existing = dbGet(
      'SELECT 1 FROM product_pricing WHERE product_id = ? AND template_id = ?',
      [productId, templateId]
    );

    if (existing) {
      dbRun(
        'UPDATE product_pricing SET overrides = ? WHERE product_id = ? AND template_id = ?',
        [productOverrides, productId, templateId]
      );
    } else {
      dbRun(
        'INSERT INTO product_pricing (product_id, template_id, overrides) VALUES (?, ?, ?)',
        [productId, templateId, productOverrides]
      );
    }
  }

  // Update product status
  for (const productId of productIds) {
    const product = dbGet('SELECT status FROM products WHERE id = ?', [productId]);
    if (product?.status === 'mockup_ready') {
      dbRun("UPDATE products SET status = 'priced' WHERE id = ?", [productId]);
    }
  }

  res.json({ success: true });
});

// GET /api/pricing/products/:productId
pricingRouter.get('/products/:productId', (req, res) => {
  const pricing = dbAll(`
    SELECT pp.*, pt.name as template_name, pt.default_values
    FROM product_pricing pp
    JOIN pricing_templates pt ON pt.id = pp.template_id
    WHERE pp.product_id = ?
  `, [req.params.productId]);

  res.json({
    success: true,
    data: pricing.map((p: any) => ({
      ...p,
      overrides: p.overrides ? JSON.parse(p.overrides) : null,
      defaultValues: JSON.parse(p.default_values),
    })),
  });
});
