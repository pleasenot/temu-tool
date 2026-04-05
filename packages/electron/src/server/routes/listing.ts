import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../../services/database';
import { TemuListingAutomation } from '../../services/playwright-automation';
import { broadcastToWeb } from '../ws-server';

export const listingRouter = Router();

let automation: TemuListingAutomation | null = null;

// POST /api/listing/login - Test Temu login
listingRouter.post('/login', async (_req, res) => {
  const db = getDb();
  const username = (db.prepare("SELECT value FROM settings WHERE key = 'temu_username'").get() as any)?.value;
  const password = (db.prepare("SELECT value FROM settings WHERE key = 'temu_password'").get() as any)?.value;

  if (!username || !password) {
    res.json({ success: false, error: 'Temu credentials not configured' });
    return;
  }

  try {
    automation = new TemuListingAutomation();
    await automation.init();

    // Try loading saved cookies first
    const savedCookies = db.prepare("SELECT data FROM cookies WHERE domain = 'seller.temu.com'").get() as any;
    if (savedCookies?.data) {
      await automation.loadCookies(JSON.parse(savedCookies.data));
    }

    const result = await automation.login(username, password, (msg: string) => {
      // Notify web UI about CAPTCHA
      broadcastToWeb({
        type: 'listing:captcha',
        id: uuid(),
        timestamp: Date.now(),
        payload: { message: msg },
      });
    });

    if (result.success) {
      // Save cookies
      const cookies = await automation.saveCookies();
      db.prepare("INSERT OR REPLACE INTO cookies (domain, data) VALUES ('seller.temu.com', ?)")
        .run(JSON.stringify(cookies));
    }

    res.json({ success: result.success, error: result.error });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/batch - Start batch listing
listingRouter.post('/batch', async (req, res) => {
  const { productIds, autoSubmit = false } = req.body;

  res.json({ success: true, data: { message: 'Batch listing started' } });

  const db = getDb();
  const total = productIds.length;

  if (!automation) {
    automation = new TemuListingAutomation();
    await automation.init();
  }

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as any;
    if (!product) continue;

    const mockups = db.prepare('SELECT * FROM mockup_images WHERE product_id = ? ORDER BY sort_order').all(productId) as any[];
    const pricing = db.prepare(`
      SELECT pp.overrides, pt.default_values
      FROM product_pricing pp
      JOIN pricing_templates pt ON pt.id = pp.template_id
      WHERE pp.product_id = ?
    `).get(productId) as any;

    broadcastToWeb({
      type: 'listing:progress',
      id: uuid(),
      timestamp: Date.now(),
      payload: {
        current: i + 1,
        total,
        productTitle: product.title,
        status: 'filling',
      },
    });

    try {
      const pricingValues = pricing
        ? { ...JSON.parse(pricing.default_values), ...(pricing.overrides ? JSON.parse(pricing.overrides) : {}) }
        : null;

      await automation.createListing({
        title: product.title,
        images: mockups.map((m: any) => m.output_path),
        pricing: pricingValues,
        autoSubmit,
      });

      const status = autoSubmit ? 'submitted' : 'waiting_confirm';

      db.prepare('INSERT INTO listings (id, product_id, status, submitted_at) VALUES (?, ?, ?, ?)')
        .run(uuid(), productId, status, new Date().toISOString());

      db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(productId);

      broadcastToWeb({
        type: 'listing:progress',
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          current: i + 1,
          total,
          productTitle: product.title,
          status: autoSubmit ? 'submitted' : 'waiting_confirm',
        },
      });
    } catch (err) {
      broadcastToWeb({
        type: 'listing:progress',
        id: uuid(),
        timestamp: Date.now(),
        payload: {
          current: i + 1,
          total,
          productTitle: product.title,
          status: 'error',
          error: String(err),
        },
      });
    }
  }
});

// GET /api/listing/status
listingRouter.get('/status', (_req, res) => {
  const db = getDb();
  const listings = db.prepare(`
    SELECT l.*, p.title as product_title
    FROM listings l
    JOIN products p ON p.id = l.product_id
    ORDER BY l.submitted_at DESC
    LIMIT 50
  `).all();

  res.json({ success: true, data: listings });
});
