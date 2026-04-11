import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';

export const templateRouter: RouterType = Router();

const EXTRA_FIELDS = [
  'size_info', 'image_index', 'product_code',
  'volume_len_cm', 'volume_width_cm', 'volume_height_cm',
  'weight_g', 'declared_price', 'retail_price',
] as const;

function parseTemplate(t: any) {
  return {
    ...t,
    cat_ids: t.cat_ids ? JSON.parse(t.cat_ids) : null,
    properties: t.properties ? JSON.parse(t.properties) : [],
    spec_config: t.spec_config ? JSON.parse(t.spec_config) : null,
    sku_config: t.sku_config ? JSON.parse(t.sku_config) : null,
  };
}

// GET /api/templates - List all templates
templateRouter.get('/', (_req, res) => {
  const templates = dbAll('SELECT * FROM product_templates ORDER BY updated_at DESC');
  res.json({ success: true, data: templates.map(parseTemplate) });
});

// GET /api/templates/:id - Get single template
templateRouter.get('/:id', (req, res) => {
  const t = dbGet('SELECT * FROM product_templates WHERE id = ?', [req.params.id]);
  if (!t) { res.json({ success: false, error: 'Template not found' }); return; }
  res.json({ success: true, data: parseTemplate(t) });
});

// POST /api/templates - Create template
templateRouter.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.name) { res.json({ success: false, error: 'name is required' }); return; }

  const id = uuid();
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO product_templates (
      id, name, ref_product_id, cat_id, cat_name, cat_ids, properties, spec_config, sku_config,
      size_info, image_index, product_code, volume_len_cm, volume_width_cm, volume_height_cm,
      weight_g, declared_price, retail_price, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, b.name, b.refProductId || null, b.catId || null, b.catName || null,
      b.catIds ? JSON.stringify(b.catIds) : null,
      b.properties ? JSON.stringify(b.properties) : null,
      b.specConfig ? JSON.stringify(b.specConfig) : null,
      b.skuConfig ? JSON.stringify(b.skuConfig) : null,
      b.sizeInfo || null, b.imageIndex ?? null, b.productCode || null,
      b.volumeLenCm ?? null, b.volumeWidthCm ?? null, b.volumeHeightCm ?? null,
      b.weightG ?? null, b.declaredPrice ?? null, b.retailPrice ?? null,
      now, now,
    ]
  );
  res.json({ success: true, data: { id } });
});

// PUT /api/templates/:id - Update template
templateRouter.put('/:id', (req, res) => {
  const existing = dbGet('SELECT * FROM product_templates WHERE id = ?', [req.params.id]);
  if (!existing) { res.json({ success: false, error: 'Template not found' }); return; }

  const b = req.body || {};
  dbRun(
    `UPDATE product_templates SET
      name=?, ref_product_id=?, cat_id=?, cat_name=?, cat_ids=?, properties=?, spec_config=?, sku_config=?,
      size_info=?, image_index=?, product_code=?,
      volume_len_cm=?, volume_width_cm=?, volume_height_cm=?,
      weight_g=?, declared_price=?, retail_price=?,
      updated_at=?
    WHERE id=?`,
    [
      b.name ?? existing.name,
      b.refProductId ?? existing.ref_product_id,
      b.catId ?? existing.cat_id,
      b.catName ?? existing.cat_name,
      b.catIds ? JSON.stringify(b.catIds) : existing.cat_ids,
      b.properties ? JSON.stringify(b.properties) : existing.properties,
      b.specConfig ? JSON.stringify(b.specConfig) : existing.spec_config,
      b.skuConfig ? JSON.stringify(b.skuConfig) : existing.sku_config,
      b.sizeInfo ?? existing.size_info,
      b.imageIndex ?? existing.image_index,
      b.productCode ?? existing.product_code,
      b.volumeLenCm ?? existing.volume_len_cm,
      b.volumeWidthCm ?? existing.volume_width_cm,
      b.volumeHeightCm ?? existing.volume_height_cm,
      b.weightG ?? existing.weight_g,
      b.declaredPrice ?? existing.declared_price,
      b.retailPrice ?? existing.retail_price,
      new Date().toISOString(),
      req.params.id,
    ]
  );
  res.json({ success: true });
});

// DELETE /api/templates/:id
templateRouter.delete('/:id', (req, res) => {
  dbRun('DELETE FROM product_templates WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// POST /api/templates/create-from-product - Create template by fetching reference product data from Temu
templateRouter.post('/create-from-product', async (req, res) => {
  const { name, refProductId } = req.body || {};
  if (!name || !refProductId) {
    res.json({ success: false, error: 'name and refProductId are required' });
    return;
  }

  const id = uuid();
  const now = new Date().toISOString();
  dbRun(
    `INSERT INTO product_templates (id, name, ref_product_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [id, name, String(refProductId), now, now]
  );
  res.json({ success: true, data: { id } });
});
