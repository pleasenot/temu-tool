import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';
import { TemuListingAutomation } from '../../services/playwright-automation';
import { broadcastToWeb } from '../ws-server';

export const listingRouter: RouterType = Router();

let automation: TemuListingAutomation | null = null;

// POST /api/listing/login - Test Temu login
listingRouter.post('/login', async (_req, res) => {
  const username = dbGet("SELECT value FROM settings WHERE key = 'temu_username'")?.value;
  const password = dbGet("SELECT value FROM settings WHERE key = 'temu_password'")?.value;

  if (!username || !password) {
    res.json({ success: false, error: 'Temu credentials not configured' });
    return;
  }

  try {
    automation = new TemuListingAutomation();
    await automation.init();

    // Try loading saved cookies first
    const savedCookies = dbGet("SELECT data FROM cookies WHERE domain = 'seller.temu.com'");
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
      const existing = dbGet("SELECT 1 FROM cookies WHERE domain = 'seller.temu.com'");
      if (existing) {
        dbRun("UPDATE cookies SET data = ? WHERE domain = 'seller.temu.com'", [JSON.stringify(cookies)]);
      } else {
        dbRun("INSERT INTO cookies (domain, data) VALUES ('seller.temu.com', ?)", [JSON.stringify(cookies)]);
      }
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

  const total = productIds.length;

  if (!automation) {
    automation = new TemuListingAutomation();
    await automation.init();
  }

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const product = dbGet('SELECT * FROM products WHERE id = ?', [productId]);
    if (!product) continue;

    const mockups = dbAll('SELECT * FROM mockup_images WHERE product_id = ? ORDER BY sort_order', [productId]);
    const pricing = dbGet(`
      SELECT pp.overrides, pt.default_values
      FROM product_pricing pp
      JOIN pricing_templates pt ON pt.id = pp.template_id
      WHERE pp.product_id = ?
    `, [productId]);

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

      dbRun(
        'INSERT INTO listings (id, product_id, status, submitted_at) VALUES (?, ?, ?, ?)',
        [uuid(), productId, status, new Date().toISOString()]
      );

      dbRun("UPDATE products SET status = 'listed' WHERE id = ?", [productId]);

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
  const listings = dbAll(`
    SELECT l.*, p.title as product_title
    FROM listings l
    JOIN products p ON p.id = l.product_id
    ORDER BY l.submitted_at DESC
    LIMIT 50
  `);

  res.json({ success: true, data: listings });
});
