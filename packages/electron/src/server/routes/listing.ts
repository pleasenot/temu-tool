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

// GET /api/listing/login-status - cheap check; does NOT launch browser
// Only probes the live session when ?probe=true is passed.
listingRouter.get('/login-status', async (req, res) => {
  try {
    const username = getSetting('temu_username') || '';
    const hasPwd = hasSetting('temu_password');

    // Probe if explicitly requested OR if the browser is already running
    const auto = getAutomation();
    const shouldProbe = req.query.probe === 'true' || auto.isBrowserRunning;
    let loggedIn: boolean | null = null; // null = unknown (browser not launched yet)

    if (shouldProbe) {
      loggedIn = await auto.checkLoginStatus();
    }

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

// POST /api/listing/test-draft - Test draft flow using a product from our DB
// Body: { productId: string, catId?: number }
listingRouter.post('/test-draft', async (req, res) => {
  const { productId, catId = 33169, specValue = '35.83x35.83 英寸 / 91x91 厘米' } = req.body || {};

  try {
    const auto = getAutomation();

    // Load product from DB if productId provided
    let productName = `Test product ${Date.now()}`;
    let imageUrls: string[] = [];

    if (productId) {
      const product = dbGet('SELECT * FROM products WHERE id = ?', [productId]);
      if (!product) { res.json({ success: false, error: 'Product not found' }); return; }
      productName = product.title || productName;
      const images = dbAll('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [productId]);
      imageUrls = images.map((img: any) => img.original_url).filter((u: string) => u?.startsWith('http'));
    }

    if (imageUrls.length === 0) {
      imageUrls = ['https://img.kwcdn.com/product/fancy/e257d7be-487d-4932-af51-dbee2b872c0b.jpg'];
    }

    // Truncate title to 250 chars (Temu limit)
    if (productName.length > 250) {
      productName = productName.substring(0, 250);
    }

    // Step 1: Fetch reference product template from Temu
    // refProductId is the template product whose attributes we copy
    const refProductId = req.body?.refProductId || 6791275947;
    let refData: any = null;
    try {
      const refResp = await auto.callTemuApi('/visage-agent-seller/product/query', { productId: refProductId });
      if (refResp.success && refResp.result) refData = refResp.result;
    } catch (e) { /* use defaults */ }

    // Extract from reference product, or use defaults
    const cats = refData?.categories || {};
    const catIds: Record<string, number> = {};
    for (let i = 1; i <= 10; i++) {
      catIds[`cat${i}Id`] = cats[`cat${i}`]?.catId || 0;
    }
    // Override leaf catId if provided
    if (catId && !catIds.cat1Id) {
      catIds.cat1Id = 31148; catIds.cat2Id = 32875; catIds.cat3Id = 33069;
      catIds.cat4Id = 33109; catIds.cat5Id = 33148; catIds.cat6Id = 33165;
      catIds.cat7Id = catId; catIds.cat8Id = 0; catIds.cat9Id = 0; catIds.cat10Id = 0;
    }

    // Product properties from reference (材质, 成分, 护理说明, etc.)
    const refProps = (refData?.productPropertyList || []).map((p: any) => ({
      templatePid: p.templatePid, pid: p.pid, refPid: p.refPid,
      propName: p.propName, vid: p.vid, propValue: p.propValue,
      valueUnit: p.valueUnit || '', valueExtendInfo: p.valueExtendInfo || '',
      numberInputValue: p.numberInputValue || '',
    }));

    // Spec info from reference SKU
    const refSkc = refData?.productSkcList?.[0];
    const refSku = refSkc?.productSkuList?.[0];
    const refSkuSpec = refSku?.productSkuSpecList?.[0] || {};
    const parentSpecId = refSkuSpec.parentSpecId || 3001;
    const parentSpecName = refSkuSpec.parentSpecName || '\u5c3a\u7801';
    const specId = refSkuSpec.specId || 0;
    const specName = refSkuSpec.specName || specValue;

    // SKU dimensions/weight/price from reference
    const refWhAttr = refSku?.productSkuWhExtAttr || {};
    const refVolume = refWhAttr.productSkuVolume || { len: 100, width: 100, height: 10 };
    const refWeight = refWhAttr.productSkuWeight?.value || 65000;
    const supplierPrice = req.body?.price || refSku?.supplierPrice || 2500;

    // Step 2: Create draft
    const leafCatId = catIds.cat10Id || catIds.cat9Id || catIds.cat8Id || catIds.cat7Id ||
      catIds.cat6Id || catIds.cat5Id || catIds.cat4Id || catIds.cat3Id || 0;
    const draftResp = await auto.callTemuApi('/visage-agent-seller/product/draft/add', { catId: leafCatId });
    if (!draftResp.success || !draftResp.result?.productDraftId) {
      res.json({ success: false, step: 'draft/add', error: draftResp.errorMsg, raw: draftResp });
      return;
    }
    const draftId = draftResp.result.productDraftId;

    // Step 3: Build complete payload with template data
    const carouselImages = imageUrls.slice(0, 10);
    const firstImage = carouselImages[0];

    const payload: Record<string, any> = {
      productDraftId: draftId,
      ...catIds,
      productName,
      productI18nReqs: [{ productName: '', language: 'en' }],
      carouselImageUrls: carouselImages,
      carouselImageI18nReqs: [],
      materialImgUrl: firstImage,
      productWhExtAttrReq: {
        productOrigin: { countryShortName: 'CN', region2Id: 43000000000031 },
      },
      productOuterPackageReq: { packageShape: 0, packageType: 2 },
      // Product attributes from template (材质, 成分, 护理说明, 季节, etc.)
      productPropertyReqs: refProps,
      // Product-level spec list
      productSpecPropertyReqs: [{
        parentSpecId, parentSpecName, specId, specName,
        vid: 0, refPid: 0, pid: 0, templatePid: 0,
        propName: parentSpecName, propValue: specName,
        valueUnit: '', valueGroupId: 0, valueGroupName: '', valueExtendInfo: '',
      }],
      productSkcReqs: [{
        previewImgUrls: [firstImage],
        productSkcCarouselImageI18nReqs: [],
        mainProductSkuSpecReqs: [{ parentSpecId: 0, parentSpecName: '', specId: 0, specName: '' }],
        productSkuReqs: [{
          thumbUrl: firstImage,
          productSkuThumbUrlI18nReqs: [],
          supplierPrice,
          currencyType: 'CNY',
          productSkuSpecReqs: [{ parentSpecId, parentSpecName, specId, specName }],
          productSkuWhExtAttrReq: {
            productSkuVolumeReq: { len: refVolume.len, width: refVolume.width, height: refVolume.height },
            productSkuWeightReq: { value: refWeight },
            productSkuBarCodeReqs: [],
            productSkuSensitiveAttrReq: { isSensitive: 0, sensitiveList: [] },
          },
          productSkuMultiPackReq: { skuClassification: 1, numberOfPieces: 1 },
        }],
      }],
      sizeTemplateIds: refData?.sizeTemplateIds || [],
      showSizeTemplateIds: refData?.showSizeTemplateIds || [],
      // Detail page decoration — use product images as detail images
      goodsLayerDecorationReqs: carouselImages.map((imgUrl: string, idx: number) => ({
        floorId: Date.now() + idx * 32,
        lang: 'zh',
        key: 'DecImage',
        type: 'image',
        priority: idx,
        contentList: [{ imgUrl, height: 2000, width: 2000 }],
      })),
      goodsLayerDecorationCustomizeI18nReqs: [],
    };

    const saveResp = await auto.callTemuApi('/visage-agent-seller/product/draft/save', payload);
    res.json({
      success: saveResp.success,
      step: 'draft/save',
      draftId,
      productName,
      imageCount: carouselImages.length,
      saveResult: saveResp,
    });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/batch-publish - Batch publish products using a template
// Body: { productIds: string[], templateId: string }
listingRouter.post('/batch-publish', async (req, res) => {
  const { productIds, templateId } = req.body || {};
  if (!productIds?.length) { res.json({ success: false, error: 'productIds required' }); return; }
  if (!templateId) { res.json({ success: false, error: 'templateId required' }); return; }

  const template = dbGet('SELECT * FROM product_templates WHERE id = ?', [templateId]);
  if (!template) { res.json({ success: false, error: 'Template not found' }); return; }

  // Return immediately, process in background
  res.json({ success: true, data: { message: 'Batch publish started', total: productIds.length } });

  const auto = getAutomation();
  const refProductId = template.ref_product_id ? Number(template.ref_product_id) : 6791275947;

  // Fetch reference product data once
  let refData: any = null;
  try {
    const refResp = await auto.callTemuApi('/visage-agent-seller/product/query', { productId: refProductId });
    if (refResp.success && refResp.result) refData = refResp.result;
  } catch (e) { /* use template stored data */ }

  // Build catIds from reference or template
  const cats = refData?.categories || {};
  const catIds: Record<string, number> = {};
  for (let i = 1; i <= 10; i++) catIds[`cat${i}Id`] = cats[`cat${i}`]?.catId || 0;
  if (!catIds.cat1Id && template.cat_ids) {
    const stored = JSON.parse(template.cat_ids);
    Object.assign(catIds, stored);
  }

  // Extract property/spec/sku config from reference
  const refProps = (refData?.productPropertyList || []).map((p: any) => ({
    templatePid: p.templatePid, pid: p.pid, refPid: p.refPid,
    propName: p.propName, vid: p.vid, propValue: p.propValue,
    valueUnit: p.valueUnit || '', valueExtendInfo: p.valueExtendInfo || '',
    numberInputValue: p.numberInputValue || '',
  }));
  const refSkc = refData?.productSkcList?.[0];
  const refSku = refSkc?.productSkuList?.[0];
  const refSkuSpec = refSku?.productSkuSpecList?.[0] || {};
  const parentSpecId = refSkuSpec.parentSpecId || 3001;
  const parentSpecName = refSkuSpec.parentSpecName || '\u5c3a\u7801';
  const specId = refSkuSpec.specId || 0;
  const specName = refSkuSpec.specName || '\u5747\u7801';
  const refWhAttr = refSku?.productSkuWhExtAttr || {};
  const refVolume = refWhAttr.productSkuVolume || { len: 100, width: 100, height: 10 };
  const refWeight = refWhAttr.productSkuWeight?.value || 65000;
  const refPrice = refSku?.supplierPrice || 2500;

  // Template overrides: declared_price (元→分), weight_g (克→毫克), volume (cm→mm)
  const defaultPrice = template.declared_price ? Math.round(template.declared_price * 100) : refPrice;
  const defaultWeight = template.weight_g ? Math.round(template.weight_g * 1000) : refWeight;
  const defaultVolume = {
    len: template.volume_len_cm ? Math.round(template.volume_len_cm * 10) : refVolume.len,
    width: template.volume_width_cm ? Math.round(template.volume_width_cm * 10) : refVolume.width,
    height: template.volume_height_cm ? Math.round(template.volume_height_cm * 10) : refVolume.height,
  };

  const leafCatId = catIds.cat10Id || catIds.cat9Id || catIds.cat8Id || catIds.cat7Id ||
    catIds.cat6Id || catIds.cat5Id || catIds.cat4Id || catIds.cat3Id || 0;

  for (let i = 0; i < productIds.length; i++) {
    const pid = productIds[i];
    const product = dbGet('SELECT * FROM products WHERE id = ?', [pid]);
    if (!product) continue;

    const images = dbAll('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort_order', [pid]);
    const imageUrls = images.map((img: any) => img.original_url).filter((u: string) => u?.startsWith('http'));
    if (imageUrls.length === 0) continue;

    let productName = product.title || '';
    if (productName.length > 250) productName = productName.substring(0, 250);

    broadcastToWeb({ type: 'listing:progress', id: uuid(), timestamp: Date.now(),
      payload: { current: i + 1, total: productIds.length, productTitle: productName, status: 'publishing' } });

    try {
      // draft/add
      const draftResp = await auto.callTemuApi('/visage-agent-seller/product/draft/add', { catId: leafCatId });
      if (!draftResp.success || !draftResp.result?.productDraftId) {
        throw new Error(`draft/add failed: ${draftResp.errorMsg}`);
      }
      const draftId = draftResp.result.productDraftId;
      const carouselImages = imageUrls.slice(0, 10);
      const firstImage = carouselImages[0];

      // draft/save
      const payload: Record<string, any> = {
        productDraftId: draftId,
        ...catIds,
        productName,
        productI18nReqs: [{ productName: '', language: 'en' }],
        carouselImageUrls: carouselImages,
        carouselImageI18nReqs: [],
        materialImgUrl: firstImage,
        productWhExtAttrReq: { productOrigin: { countryShortName: 'CN', region2Id: 43000000000031 } },
        productOuterPackageReq: { packageShape: 0, packageType: 2 },
        productPropertyReqs: refProps,
        productSpecPropertyReqs: [{
          parentSpecId, parentSpecName, specId, specName,
          vid: 0, refPid: 0, pid: 0, templatePid: 0,
          propName: parentSpecName, propValue: specName,
          valueUnit: '', valueGroupId: 0, valueGroupName: '', valueExtendInfo: '',
        }],
        productSkcReqs: [{
          previewImgUrls: [firstImage],
          productSkcCarouselImageI18nReqs: [],
          mainProductSkuSpecReqs: [{ parentSpecId: 0, parentSpecName: '', specId: 0, specName: '' }],
          productSkuReqs: [{
            thumbUrl: firstImage, productSkuThumbUrlI18nReqs: [],
            supplierPrice: defaultPrice, currencyType: 'CNY',
            productSkuSpecReqs: [{ parentSpecId, parentSpecName, specId, specName }],
            productSkuWhExtAttrReq: {
              productSkuVolumeReq: { len: defaultVolume.len, width: defaultVolume.width, height: defaultVolume.height },
              productSkuWeightReq: { value: defaultWeight },
              productSkuBarCodeReqs: [],
              productSkuSensitiveAttrReq: { isSensitive: 0, sensitiveList: [] },
            },
            productSkuMultiPackReq: { skuClassification: 1, numberOfPieces: 1 },
          }],
        }],
        sizeTemplateIds: refData?.sizeTemplateIds || [],
        showSizeTemplateIds: refData?.showSizeTemplateIds || [],
        goodsLayerDecorationReqs: carouselImages.map((imgUrl: string, idx: number) => ({
          floorId: Date.now() + idx * 32, lang: 'zh', key: 'DecImage', type: 'image', priority: idx,
          contentList: [{ imgUrl, height: 2000, width: 2000 }],
        })),
        goodsLayerDecorationCustomizeI18nReqs: [],
      };

      const saveResp = await auto.callTemuApi('/visage-agent-seller/product/draft/save', payload);
      if (!saveResp.success) throw new Error(`draft/save failed: ${saveResp.errorMsg}`);

      dbRun('INSERT INTO listings (id, product_id, temu_listing_id, status, submitted_at) VALUES (?, ?, ?, ?, ?)',
        [uuid(), pid, String(draftId), 'draft_saved', new Date().toISOString()]);
      dbRun("UPDATE products SET status = 'listed' WHERE id = ?", [pid]);

      broadcastToWeb({ type: 'listing:progress', id: uuid(), timestamp: Date.now(),
        payload: { current: i + 1, total: productIds.length, productTitle: productName, status: 'draft_saved', draftId } });
    } catch (err) {
      broadcastToWeb({ type: 'listing:progress', id: uuid(), timestamp: Date.now(),
        payload: { current: i + 1, total: productIds.length, productTitle: productName, status: 'error', error: String(err) } });
    }
  }
});

// GET /api/listing/shop-products?page=1&pageSize=20 - List products from Temu shop
listingRouter.get('/shop-products', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const result = await getAutomation().listShopProducts(page, pageSize);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/temu-api - Generic proxy to call any Temu API endpoint
// Body: { endpoint: string, body: Record<string, any> }
listingRouter.post('/temu-api', async (req, res) => {
  const { endpoint, body } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    res.json({ success: false, error: 'endpoint is required' });
    return;
  }
  try {
    const result = await getAutomation().callTemuApi(endpoint, body || {});
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/upload-image - Upload local image to Temu CDN
// Body: { imageBase64: string, filename: string }
listingRouter.post('/upload-image', async (req, res) => {
  const { imageBase64, filename } = req.body || {};
  if (!imageBase64 || !filename) {
    res.json({ success: false, error: 'imageBase64 and filename are required' });
    return;
  }
  try {
    const buf = Buffer.from(imageBase64, 'base64');
    const result = await getAutomation().uploadImage(buf, filename);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/search-category - Search for product category
// Body: { keyword: string }
listingRouter.post('/search-category', async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword || typeof keyword !== 'string') {
    res.json({ success: false, error: 'keyword is required' });
    return;
  }
  try {
    const categories = await getAutomation().searchCategory(keyword);
    res.json({ success: true, data: categories });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/category-template - Get category attribute template
// Body: { catId: number }
listingRouter.post('/category-template', async (req, res) => {
  const { catId } = req.body || {};
  if (!catId) {
    res.json({ success: false, error: 'catId is required' });
    return;
  }
  try {
    const template = await getAutomation().getCategoryTemplate(catId);
    res.json({ success: true, data: template });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// POST /api/listing/submit-product - Submit product via Temu API
// Body: { productData: Record<string, any>, mode: 'add' | 'edit' }
listingRouter.post('/submit-product', async (req, res) => {
  const { productData, mode = 'add' } = req.body || {};
  if (!productData || typeof productData !== 'object') {
    res.json({ success: false, error: 'productData is required' });
    return;
  }
  try {
    const result = await getAutomation().submitProduct(productData, mode);
    res.json({ success: true, data: result });
  } catch (err) {
    res.json({ success: false, error: String(err) });
  }
});

// GET /api/listing/status — replaced legacy /batch route
// (legacy /batch was removed — use /batch-publish with templateId instead)

listingRouter.post('/batch', (_req, res) => {
  res.json({ success: false, error: 'Deprecated: use /batch-publish with templateId instead' });
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
