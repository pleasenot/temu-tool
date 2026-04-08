import { Router, type Router as RouterType } from 'express';
import { v4 as uuid } from 'uuid';
import { dbAll, dbGet, dbRun } from '../../services/database';
import { getSetting, setSetting, hasSetting } from '../../services/secure-settings';
import { TemuListingAutomation } from '../../services/playwright-automation';
import { broadcastToWeb } from '../ws-server';

export const listingRouter: RouterType = Router();

// Singleton automation: persistent context lives for the app's lifetime so
// repeated logins/listings reuse the same browser process.
let automation: TemuListingAutomation | null = null;

function getAutomation(): TemuListingAutomation {
  if (!automation) automation = new TemuListingAutomation();
  return automation;
}

// GET /api/listing/login-status - cheap check using persistent profile
listingRouter.get('/login-status', async (_req, res) => {
  try {
    const username = getSetting('temu_username') || '';
    const hasPwd = hasSetting('temu_password');
    const loggedIn = await getAutomation().checkLoginStatus();
    res.json({
      success: true,
      data: {
        loggedIn,
        username,
        hasPassword: hasPwd,
      },
    });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/credentials - save phone/password (encrypted via secure-settings)
listingRouter.post('/credentials', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !username.trim()) {
    res.json({ success: false, error: '手机号不能为空' });
    return;
  }
  setSetting('temu_username', username.trim());
  if (typeof password === 'string' && password.length > 0) {
    setSetting('temu_password', password);
  }
  res.json({ success: true });
});

// POST /api/listing/login - open headed Chrome and run the auto-fill flow
listingRouter.post('/login', async (_req, res) => {
  const username = getSetting('temu_username');
  const password = getSetting('temu_password');

  if (!username || !password) {
    res.json({ success: false, error: '请先在账号管理页填写手机号和密码' });
    return;
  }

  try {
    const result = await getAutomation().login(username, password, (msg: string) => {
      broadcastToWeb({
        type: 'listing:captcha',
        id: uuid(),
        timestamp: Date.now(),
        payload: { message: msg },
      });
    });

    res.json({ success: result.success, error: result.error });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/logout - drop the persisted Chrome profile
listingRouter.post('/logout', async (_req, res) => {
  try {
    if (automation) {
      await automation.logout();
      automation = null;
    }
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/batch - Start batch listing
listingRouter.post('/batch', async (req, res) => {
  const { productIds, autoSubmit = false } = req.body;

  res.json({ success: true, data: { message: 'Batch listing started' } });

  const total = productIds.length;
  const auto = getAutomation();

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

      await auto.createListing({
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
