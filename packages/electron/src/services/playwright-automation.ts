import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { app } from 'electron';
import path from 'path';

interface ListingData {
  title: string;
  images: string[];
  pricing: Record<string, any> | null;
  autoSubmit: boolean;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface TemuApiResponse<T = any> {
  success: boolean;
  errorCode: number;
  errorMsg: string | null;
  result: T;
}

interface ImageUploadResult {
  url: string;
  width: number;
  height: number;
}

interface CategorySearchResult {
  cat1Id: number;
  cat2Id: number;
  cat3Id: number;
  cat4Id: number;
  cat5Id: number;
  cat6Id: number;
  cat7Id: number;
  cat8Id: number;
  cat9Id: number;
  cat10Id: number;
  leafCatName: string;
  fullPath: string;
}

interface ProductSubmitResult {
  productId: number;
  productSkcList: Array<{ productSkcId: number }>;
  productSkuList: Array<{
    productSkuId: number;
    productSkcId: number;
    extCode: string;
  }>;
}

// Target domain. Cookies/localStorage are persisted via launchPersistentContext
// so the next session usually skips both the form fill and the slider captcha.
const LOGIN_URL =
  'https://seller.kuajingmaihuo.com/login?redirectUrl=' +
  encodeURIComponent('https://seller.kuajingmaihuo.com/settle/site-main');
const HOME_URL = 'https://seller.kuajingmaihuo.com/main';
const PUBLISH_URL = 'https://seller.kuajingmaihuo.com/main/product/publish'; // TODO: confirm exact path on kuajingmaihuo
const LOGGED_IN_URL_FRAGMENT = '/main';

// Product API lives on agentseller.temu.com, NOT on seller.kuajingmaihuo.com.
// Login is on kuajingmaihuo but the actual product/category/image APIs use a
// different domain. We navigate to agentseller before calling APIs so that
// fetch() carries the right cookies and origin.
const AGENTSELLER_HOME = 'https://agentseller.temu.com/main/product';

export class TemuListingAutomation {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /** True if the browser has already been launched (avoids cold-starting just to check status) */
  get isBrowserRunning(): boolean {
    return this.page !== null && this.context !== null;
  }

  private get profileDir(): string {
    return path.join(app.getPath('userData'), 'temu-chrome-profile');
  }

  async init(): Promise<void> {
    // Re-initialise if context died (user closed the window, chrome crashed,
    // etc.) — Playwright doesn't expose a sync "is alive" flag, so we probe
    // by checking pages() and rely on a close listener to null out state.
    if (this.context) {
      try {
        this.context.pages();
        return;
      } catch {
        this.context = null;
        this.page = null;
      }
    }
    // Persistent context => cookies, localStorage, IndexedDB all survive
    // restarts. After the user solves the slider captcha once, subsequent
    // launches go straight to the dashboard.
    this.context = await chromium.launchPersistentContext(this.profileDir, {
      headless: false,
      channel: 'chrome',
      viewport: null,
      locale: 'zh-CN',
      args: ['--disable-blink-features=AutomationControlled'],
    });

    // If user closes the window we want the next call to init() to relaunch
    // rather than reuse the dead handle.
    this.context.on('close', () => {
      this.context = null;
      this.page = null;
    });

    // Reuse the first tab Playwright opens, otherwise create one.
    const pages = this.context.pages();
    this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

    // Hook XHR.setRequestHeader BEFORE the page's JS loads.
    // When the page's bundled code calls setRequestHeader('anti-content', value),
    // we capture the caller's scope to find the signing function.
    await this.context.addInitScript(() => {
      const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
      const origOpen = XMLHttpRequest.prototype.open;

      // Track per-XHR state
      XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: any[]) {
        (this as any).__temuUrl = url;
        (this as any).__temuMethod = method;
        return origOpen.apply(this, [method, url, ...rest] as any);
      };

      XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
        if (name.toLowerCase() === 'anti-content') {
          // Expose: the page's JS is calling setRequestHeader('anti-content', ...)
          // This means anti-content is generated BEFORE the XHR is sent.
          // We store the XHR instance mapping to examine the generation pattern.
          (window as any).__lastAntiContent = value;
          (window as any).__lastAntiUrl = (this as any).__temuUrl;
        }
        return origSetHeader.call(this, name, value);
      };
    });
  }

  /**
   * Quick passive check: navigate to the home URL and see whether we land on
   * the dashboard or get bounced to /login. Does not interact with any forms.
   */
  async checkLoginStatus(): Promise<boolean> {
    await this.init();
    if (!this.page) return false;
    try {
      // If we're already on a non-login kuajingmaihuo page, trust it — avoids
      // disturbing the user's current view.
      const currentUrl = this.page.url();
      if (
        currentUrl.includes('seller.kuajingmaihuo.com') &&
        !currentUrl.includes('/login')
      ) {
        return true;
      }
      // Otherwise probe by hitting the login URL: if the server already has
      // a valid session it will bounce us through to settle/site-main, so a
      // final URL that no longer contains /login means we're logged in.
      await this.page.goto(LOGIN_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      });
      await this.page.waitForTimeout(2000);
      return !this.page.url().includes('/login');
    } catch {
      return false;
    }
  }

  async login(
    username: string,
    password: string,
    onCaptchaNeeded: (message: string) => void
  ): Promise<LoginResult> {
    await this.init();
    if (!this.page) return { success: false, error: 'Browser init failed' };

    try {
      await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await this.page.waitForTimeout(1000);

      // Already logged in? Persistent context might have a fresh session.
      if (!this.page.url().includes('/login')) {
        return { success: true };
      }

      // Inject everything in one evaluate call so it runs against the live
      // React tree without selector race conditions. Uses the native value
      // setter trick because plain `.value =` doesn't fire React's
      // synthetic onChange handler.
      const filled = await this.page.evaluate(
        ({ phone, pwd }) => {
          function setReactInput(el: HTMLInputElement, value: string) {
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value'
            )?.set;
            setter?.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }

          // 1. Switch to "账号登录" tab if currently on QR tab.
          const accountTab = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
            (el) => el.textContent?.trim() === '账号登录' && el.children.length === 0
          );
          accountTab?.click();
          return new Promise<boolean>((resolve) => {
            setTimeout(() => {
              const phoneInput = document.querySelector<HTMLInputElement>(
                'input[placeholder="请输入手机号"]'
              );
              const pwdInput = document.querySelector<HTMLInputElement>(
                'input[placeholder="请输入密码"]'
              );
              if (!phoneInput || !pwdInput) {
                resolve(false);
                return;
              }
              setReactInput(phoneInput, phone);
              setReactInput(pwdInput, pwd);

              // Tick the agreement checkbox if not already checked.
              const checkbox = document.querySelector<HTMLInputElement>(
                'input[type="checkbox"]'
              );
              if (checkbox && !checkbox.checked) {
                checkbox.click();
              }

              // Click the 登录 button.
              const loginBtn = Array.from(
                document.querySelectorAll<HTMLButtonElement>('button')
              ).find((b) => b.textContent?.trim() === '登录');
              loginBtn?.click();
              resolve(true);
            }, 400);
          });
        },
        { phone: username, pwd: password }
      );

      if (!filled) {
        return { success: false, error: '未找到登录表单（页面结构可能已变）' };
      }

      // Notify UI immediately so user knows to look at the browser window —
      // there will almost certainly be a slider captcha on a fresh profile.
      onCaptchaNeeded('请在弹出的浏览器窗口中完成滑块验证（如出现）');

      // Wait until the URL leaves /login. No timeout: the user may take a
      // while to drag the slider, and we don't want to abort prematurely.
      try {
        await this.page.waitForURL(
          (url) => !url.toString().includes('/login'),
          { timeout: 5 * 60 * 1000 } // 5 min hard cap
        );
        return { success: true };
      } catch {
        return { success: false, error: '登录超时（5 分钟未完成）' };
      }
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * Drop the persisted profile (cookies, storage). Useful for "切换账号"
   * or when the saved session has expired in a way checkLoginStatus can't
   * detect. Caller is responsible for closing the context first.
   */
  async logout(): Promise<void> {
    await this.close();
    const fs = await import('fs');
    try {
      fs.rmSync(this.profileDir, { recursive: true, force: true });
    } catch {
      // Best effort — file may be locked if a stray Chrome process holds it.
    }
  }

  /**
   * Ensure the page is on the agentseller.temu.com domain so that
   * fetch calls from page.evaluate() carry the right cookies and origin.
   *
   * Login flow for agentseller:
   * 1. Navigate to agentseller.temu.com/main/product
   * 2. Redirects to /main/authentication page ("商家中心" region selector)
   * 3. Click "商家中心 >" for 中国地区
   * 4. Redirects to seller.kuajingmaihuo.com/settle/seller-login (SSO)
   * 5. If kuajingmaihuo already has session → auto-redirects back to agentseller
   * 6. If not → fill login form → user solves captcha → redirect back
   */
  private async ensureOnAgentseller(): Promise<void> {
    await this.init();
    if (!this.page) throw new Error('Browser not initialised');
    const url = this.page.url();
    // Already on agentseller dashboard (not login/auth page)
    if (
      url.includes('agentseller.temu.com') &&
      !url.includes('/authentication') &&
      !url.includes('/login')
    ) {
      return;
    }

    await this.page.goto(AGENTSELLER_HOME, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await this.page.waitForTimeout(2000);

    // The agentseller authentication page has a "商家中心 >" button.
    // Clicking it opens a POPUP window with the kuajingmaihuo login form.
    // After login in the popup, it closes and the main page redirects to the dashboard.
    if (this.page.url().includes('/authentication') || this.page.url().includes('/login')) {
      console.log('[ensureOnAgentseller] On authentication page, clicking 商家中心...');

      // Step 1: Click "商家中心" and wait for popup window
      const popupPromise = this.context!.waitForEvent('page', { timeout: 15000 }).catch(() => null);

      // Click using Playwright locator
      try {
        const link = this.page.locator('text=商家中心').last();
        await link.waitFor({ state: 'visible', timeout: 5000 });
        await link.click();
      } catch {
        // Fallback: evaluate click
        await this.page.evaluate(() => {
          const els = document.querySelectorAll('*');
          for (const el of els) {
            if (el.children.length === 0 && el.textContent?.trim() === '商家中心') {
              (el as HTMLElement).click();
              break;
            }
          }
        });
      }

      const popup = await popupPromise;

      if (popup) {
        // Step 2: Fill login form in the popup window IF needed.
        //
        // Important: if kuajingmaihuo already has a valid session, the popup
        // auto-SSO's and closes within a second — *before* we can fill the
        // form. In that case we must NOT error out; the auto-close means
        // login already succeeded. Only fill the form if the phone input
        // actually becomes visible.
        console.log('[ensureOnAgentseller] Popup opened:', popup.url());
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        await popup.waitForTimeout(1500);

        // Is the popup still open and actually showing a login form?
        const popupAlreadyClosed = popup.isClosed();
        if (popupAlreadyClosed) {
          console.log('[ensureOnAgentseller] Popup closed immediately — SSO auto-completed');
        } else {
          const { getSetting } = await import('./secure-settings');
          const username = getSetting('temu_username');
          const password = getSetting('temu_password');

          // Probe: is there actually a phone input to fill? If not, the popup
          // is either already redirecting or closing — treat as success.
          const phoneInput = popup.locator('input[placeholder*="手机号"]').first();
          const hasForm = await phoneInput
            .waitFor({ state: 'visible', timeout: 3000 })
            .then(() => true)
            .catch(() => false);

          if (!hasForm) {
            console.log('[ensureOnAgentseller] No form visible — popup is likely auto-SSOing');
          } else {
            if (!username || !password) {
              throw new Error('需要登录 agentseller，但无保存的凭据');
            }
            console.log('[ensureOnAgentseller] Filling login form for:', username);
            try {
              await phoneInput.fill(username);
              const pwdInput = popup.locator('input[placeholder*="密码"]').first();
              await pwdInput.fill(password);

              // Tick privacy/agreement checkbox — only click ONCE
              try {
                const checkbox = popup.locator('input[type="checkbox"]').first();
                if (await checkbox.isVisible({ timeout: 2000 }).catch(() => false)) {
                  const checked = await checkbox.isChecked().catch(() => false);
                  if (!checked) {
                    await checkbox.click();
                    console.log('[ensureOnAgentseller] Checkbox ticked via input');
                  }
                }
              } catch {
                console.log('[ensureOnAgentseller] Warning: could not tick checkbox');
              }

              // Click 授权登录
              const loginBtn = popup.locator('button:has-text("授权登录")').first();
              await loginBtn.click();
              console.log('[ensureOnAgentseller] Login form submitted in popup');
            } catch (err) {
              // If the popup closed mid-fill, that's also SSO success — don't fail.
              if (popup.isClosed() || /closed/i.test(String(err))) {
                console.log('[ensureOnAgentseller] Popup closed during fill — SSO likely succeeded');
              } else {
                console.log('[ensureOnAgentseller] Popup form fill error:', String(err));
                throw new Error('登录表单填充失败: ' + String(err));
              }
            }
          }
        }

        // Step 3: Wait for the popup to close and main page to redirect
        try {
          await popup.waitForEvent('close', { timeout: 60000 }).catch(() => {});
        } catch {}

        // Wait for main page to leave authentication
        await this.page.waitForTimeout(3000);
        try {
          await this.page.waitForURL(
            (u) => u.toString().includes('agentseller.temu.com') && !u.toString().includes('/authentication'),
            { timeout: 30000 }
          );
        } catch {
          // Reload and check
          await this.page.reload({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
          await this.page.waitForTimeout(2000);
        }

        console.log('[ensureOnAgentseller] After login, main page:', this.page.url());
      } else {
        // No popup — "商家中心" might have navigated in the same page
        console.log('[ensureOnAgentseller] No popup detected, checking current URL...');
        await this.page.waitForTimeout(5000);
        console.log('[ensureOnAgentseller] Current URL:', this.page.url());
      }
    }

    // Final check
    await this.page.waitForTimeout(1000);
    const finalUrl = this.page.url();
    if (!finalUrl.includes('agentseller.temu.com') || finalUrl.includes('/authentication') || finalUrl.includes('/login')) {
      throw new Error(`agentseller 登录失败，当前页面: ${finalUrl}`);
    }
  }

  /**
   * Generic Temu API caller. Runs fetch() inside the logged-in page context,
   * so cookies and the `anti-content` signature header are set by the page's
   * own JS runtime. Returns the parsed JSON body.
   */
  async callTemuApi<T = any>(
    endpoint: string,
    body: Record<string, any> = {}
  ): Promise<TemuApiResponse<T>> {
    await this.ensureOnAgentseller();

    // The page's JS patches XHR to add `anti-content` via setRequestHeader,
    // but only for XHRs created by its own bundled HTTP client (e.g. axios).
    // Our addInitScript hooks setRequestHeader to expose __lastAntiContent.
    //
    // Strategy: use page.route() to intercept our XHR request just before
    // it goes to the network. At that point, the page's XHR wrapper has
    // already added anti-content via setRequestHeader (if applicable).
    // If not, we fall back to a two-step approach:
    // 1. Trigger a page navigation to capture fresh anti-content headers
    // 2. Use page.request (Playwright's built-in HTTP client) with those headers

    const page = this.page!;

    // First, try to find the page's own HTTP request function.
    // Many SPA frameworks store their API client on the window or in a module cache.
    // The addInitScript hook stores __lastAntiContent whenever the page's code
    // calls setRequestHeader('anti-content', ...).

    // Trigger a page load to populate __lastAntiContent
    const currentUrl = page.url();
    if (!currentUrl.includes('agentseller.temu.com/goods')) {
      await page.goto('https://agentseller.temu.com/goods/list', {
        waitUntil: 'networkidle', timeout: 15000,
      }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    // Now make our API call. Intercept at the network level to add
    // anti-content from what the page's init captured.
    const routePattern = `**/agentseller.temu.com${endpoint}`;
    await page.route(routePattern, async (route: any) => {
      // Get the latest anti-content captured by our initScript hook
      const antiContent = await page.evaluate(() => (window as any).__lastAntiContent || '');
      const headers = route.request().headers();
      await route.continue({
        headers: {
          ...headers,
          'anti-content': antiContent,
          'mallid': '634418228630870',
        },
      });
    });

    const result = await page.evaluate(
      ({ ep, payload }) => {
        return new Promise<any>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', ep, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.withCredentials = true;
          xhr.onload = () => {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch { resolve({ success: false, errorCode: xhr.status, errorMsg: xhr.responseText?.substring(0, 300), result: null }); }
          };
          xhr.onerror = () => resolve({ success: false, errorCode: 0, errorMsg: 'network error', result: null });
          xhr.send(JSON.stringify(payload));
        });
      },
      { ep: endpoint, payload: body }
    );

    await page.unroute(routePattern);


    return result as TemuApiResponse<T>;
  }

  /**
   * Upload a local image file to Temu's CDN via the page context.
   * The image is read as base64, sent to the page, converted to a Blob,
   * and uploaded via the image upload endpoint.
   */
  async uploadImage(imageBuffer: Buffer, filename: string): Promise<ImageUploadResult> {
    await this.ensureOnAgentseller();

    const base64 = imageBuffer.toString('base64');
    const mimeType = filename.endsWith('.png') ? 'image/png'
      : filename.endsWith('.webp') ? 'image/webp'
      : 'image/jpeg';

    const result = await this.page!.evaluate(
      async ({ b64, mime, fname }) => {
        // Convert base64 to Blob
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });

        const formData = new FormData();
        formData.append('file', blob, fname);

        // Try the common Temu image upload endpoints
        const uploadUrls = [
          'https://agentseller.temu.com/hinge-agent-seller/file/upload/image',
          'https://agentseller.temu.com/visage-agent-seller/product/image/upload',
        ];

        for (const url of uploadUrls) {
          try {
            const resp = await fetch(url, {
              method: 'POST',
              credentials: 'include',
              body: formData,
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json.success && json.result) {
                return { success: true, data: json.result };
              }
            }
          } catch { /* try next */ }
        }
        return { success: false, data: null };
      },
      { b64: base64, mime: mimeType, fname: filename }
    );

    if (!result.success || !result.data) {
      throw new Error('图片上传失败 — 上传接口可能已变更，需要重新抓取');
    }
    return result.data as ImageUploadResult;
  }

  /**
   * Search for a product category by keyword. Returns matching category paths.
   */
  async searchCategory(keyword: string): Promise<CategorySearchResult[]> {
    const resp = await this.callTemuApi<any>(
      '/anniston-agent-seller/category/path/list',
      { keyword }
    );
    if (!resp.success || !resp.result) return [];

    // The API may return different shapes — normalize to our interface
    const items = Array.isArray(resp.result) ? resp.result : (resp.result.list || []);
    return items.map((item: any) => ({
      cat1Id: item.cat1Id || 0,
      cat2Id: item.cat2Id || 0,
      cat3Id: item.cat3Id || 0,
      cat4Id: item.cat4Id || 0,
      cat5Id: item.cat5Id || 0,
      cat6Id: item.cat6Id || 0,
      cat7Id: item.cat7Id || 0,
      cat8Id: item.cat8Id || 0,
      cat9Id: item.cat9Id || 0,
      cat10Id: item.cat10Id || 0,
      leafCatName: item.leafCatName || item.catName || '',
      fullPath: item.fullPath || item.catPathName || '',
    }));
  }

  /**
   * Submit a product via the Temu API (product/add or product/edit).
   */
  async submitProduct(
    productData: Record<string, any>,
    mode: 'add' | 'edit' = 'add'
  ): Promise<ProductSubmitResult> {
    const endpoint = mode === 'edit'
      ? '/visage-agent-seller/product/edit'
      : '/visage-agent-seller/product/add';

    const resp = await this.callTemuApi<ProductSubmitResult>(endpoint, productData);

    if (!resp.success || !resp.result) {
      throw new Error(
        `商品提交失败: ${resp.errorMsg || 'unknown error'} (code: ${resp.errorCode})`
      );
    }
    return resp.result;
  }

  /**
   * Get category attribute template — needed to know which properties
   * are required/optional for a given leaf category.
   */
  async getCategoryTemplate(leafCatId: number): Promise<any> {
    const resp = await this.callTemuApi(
      '/anniston-agent-seller/category/template/query',
      { catId: leafCatId }
    );
    if (!resp.success) {
      throw new Error(`获取类目模板失败: ${resp.errorMsg}`);
    }
    return resp.result;
  }

  /**
   * List shop products via the real agentseller API.
   *
   * Endpoint discovered 2026-04-11 via Chrome Network inspection on
   * https://agentseller.temu.com/goods/list — the page fires
   * POST /visage-agent-seller/product/skc/pageQuery after initial load.
   *
   * callTemuApi auto-injects anti-content so we can call it headlessly
   * without navigating to the actual goods list page.
   *
   * Returns { loggedIn: false } if the session is invalid.
   */
  async listShopProducts(pageNo = 1, pageSize = 20): Promise<any> {
    try {
      const resp = await this.callTemuApi<any>(
        '/visage-agent-seller/product/skc/pageQuery',
        {
          // Field name is `page` (not `pageNumber`) — server returns
          // `errorCode 1000002: Page number cannot be empty` otherwise.
          page: pageNo,
          pageSize,
        }
      );

      // Temu gateway returns two shapes:
      //  - success:   { success: true, errorCode: 1000000, result: {...} }       (camelCase)
      //  - auth-fail: { error_code: 40001, error_msg: "Invalid Login State" }    (snake_case)
      const errorCode = resp?.errorCode ?? (resp as any)?.error_code;
      const errorMsg = resp?.errorMsg ?? (resp as any)?.error_msg ?? '';

      if (!resp?.success) {
        // 40001 Invalid Login State / 401 / 403 — session expired
        if (
          errorCode === 40001 ||
          errorCode === 403 ||
          errorCode === 401 ||
          /invalid login|login state|unauthorized|not logged|auth/i.test(errorMsg)
        ) {
          return { loggedIn: false, total: 0, list: [] };
        }
        throw new Error(`shop list failed: ${errorMsg || 'unknown'} (code ${errorCode ?? 'n/a'})`);
      }

      const result = resp.result || {};
      const rawList: any[] =
        result.data ||
        result.list ||
        result.pageItems ||
        result.productList ||
        [];
      const total: number = result.total || result.totalItemNum || result.totalCount || rawList.length;

      const list = rawList.map((item: any) => ({
        productId: item.productId || item.productSkuId || item.goodsId || 0,
        productName: item.productName || item.productNameEn || item.goodsName || '',
        thumbUrl:
          item.thumbUrl ||
          item.mainImageUrl ||
          item.productImgUrl ||
          (item.productSkcImages && item.productSkcImages[0]?.imgUrl) ||
          '',
        catName:
          item.leafCat?.catName ||
          item.catName ||
          item.leafCatName ||
          (item.categories && item.categories[item.categories.length - 1]?.catName) ||
          '',
        status: item.skcStatus ?? item.status ?? item.removeStatus ?? '',
        spuId: item.spuId || item.productId || 0,
        categories: item.categories || null,
      }));

      return { loggedIn: true, total, list };
    } catch (e: any) {
      // If callTemuApi throws because ensureOnAgentseller failed -> treat as not logged in
      if (/登录失败|not logged|authentication/i.test(e?.message || '')) {
        return { loggedIn: false, total: 0, list: [] };
      }
      throw e;
    }
  }

  async createListing(data: ListingData): Promise<void> {
    await this.init();
    if (!this.page) throw new Error('Browser init failed');

    // TODO(kuajingmaihuo): the publish URL and selectors below were inherited
    // from the seller.temu.com implementation and have NOT been verified
    // against the kuajingmaihuo dashboard yet. Audit before relying on
    // batch listing.
    await this.page.goto(PUBLISH_URL, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await this.page.waitForTimeout(2000);

    // Fill title
    const titleInput = this.page
      .locator('input[placeholder*="标题"], input[placeholder*="title"], textarea[placeholder*="标题"]')
      .first();
    if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleInput.fill(data.title);
    }

    // Upload images
    if (data.images.length > 0) {
      const fileInput = this.page.locator('input[type="file"]').first();
      if ((await fileInput.count()) > 0) {
        await fileInput.setInputFiles(data.images.slice(0, 6));
      }
      await this.page.waitForTimeout(3000);
    }

    if (data.pricing) {
      await this.fillPricingFields(data.pricing);
    }

    if (data.autoSubmit) {
      const submitBtn = this.page
        .locator('button:has-text("提交"), button:has-text("Submit")')
        .first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await this.page.waitForTimeout(3000);
      }
    }
  }

  private async fillPricingFields(pricing: Record<string, any>): Promise<void> {
    if (!this.page) return;

    const fieldMappings: Array<{ key: string; label: string }> = [
      { key: 'productCode', label: '货号' },
      { key: 'packageLength', label: '包装体积长' },
      { key: 'packageWidth', label: '包装体积宽' },
      { key: 'packageHeight', label: '包装体积高' },
      { key: 'weight', label: '重量' },
      { key: 'declaredPrice', label: '申报价' },
      { key: 'suggestedRetailPrice', label: '建议零售价' },
    ];

    for (const { key, label } of fieldMappings) {
      if (pricing[key] !== undefined) {
        const input = this.page
          .locator(
            `input[placeholder*="${label}"], label:has-text("${label}") + input, label:has-text("${label}") ~ input`
          )
          .first();
        if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
          await input.fill(String(pricing[key]));
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore
      }
      this.context = null;
      this.page = null;
    }
  }
}
