const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SCRAPER = path.resolve(__dirname, '../extension/src/content/scraper.js');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--disable-blink-features=AutomationControlled'] });
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
    viewport: { width: 1366, height: 800 },
    locale: 'en-US',
  });
  const page = await ctx.newPage();

  console.log('[1] Opening temu.com ...');
  await page.goto('https://www.temu.com/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(8000);
  console.log('  page url:', page.url(), 'title:', await page.title());
  const html = await page.content();
  console.log('  html length:', html.length);
  fs.writeFileSync('temu-home.html', html);

  let productUrl = await page.evaluate(() => {
    const a = document.querySelector('a[href*="goods_id="]');
    return a ? a.href : null;
  });
  console.log('[2] Product link from homepage:', productUrl);

  if (!productUrl) {
    console.log('No product link, trying search...');
    await page.goto('https://www.temu.com/search_result.html?search_key=phone+case', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(4000);
    productUrl = await page.evaluate(() => {
      const a = document.querySelector('a[href*="goods_id="]');
      return a ? a.href : null;
    });
    console.log('[2b] Product link from search:', productUrl);
  }

  if (!productUrl) {
    console.error('Could not find a product link on temu.com');
    await browser.close();
    process.exit(2);
  }

  console.log('[3] Navigating to product page ...');
  await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(5000);

  console.log('[4] Injecting scraper.js ...');
  const scraperSrc = fs.readFileSync(SCRAPER, 'utf8');
  const scraped = await page.evaluate((src) => {
    // eslint-disable-next-line no-eval
    eval(src);
    // scrapeProduct is now defined in this scope
    // eslint-disable-next-line no-undef
    return scrapeProduct();
  }, scraperSrc);

  console.log('[5] Scrape result:');
  console.log(JSON.stringify(scraped, null, 2));

  await browser.close();

  if (!scraped || !scraped.title) {
    console.error('Scraper returned no data');
    process.exit(3);
  }

  console.log('[6] Sending product:collect to backend WS ...');
  await new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:23789');
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', id: 'a', timestamp: Date.now(), payload: { source: 'extension' } }));
      ws.send(JSON.stringify({ type: 'product:collect', id: 'p', timestamp: Date.now(), payload: scraped }));
    });
    ws.on('message', (m) => {
      console.log('[7] ACK:', m.toString());
      ws.close();
      resolve();
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws timeout')), 8000);
  });

  console.log('[8] Done.');
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
