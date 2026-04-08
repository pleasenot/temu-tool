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

// Target domain. Cookies/localStorage are persisted via launchPersistentContext
// so the next session usually skips both the form fill and the slider captcha.
const LOGIN_URL =
  'https://seller.kuajingmaihuo.com/login?redirectUrl=' +
  encodeURIComponent('https://seller.kuajingmaihuo.com/settle/site-main');
const HOME_URL = 'https://seller.kuajingmaihuo.com/main';
const PUBLISH_URL = 'https://seller.kuajingmaihuo.com/main/product/publish'; // TODO: confirm exact path on kuajingmaihuo
const LOGGED_IN_URL_FRAGMENT = '/main';

export class TemuListingAutomation {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

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
