import { chromium, type Browser, type BrowserContext, type Page, type Cookie } from 'playwright-core';

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

export class TemuListingAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async init(): Promise<void> {
    // Use system Chrome instead of bundled Chromium
    this.browser = await chromium.launch({
      headless: false,  // User needs to see for CAPTCHA
      channel: 'chrome', // Use system Chrome
      args: ['--disable-blink-features=AutomationControlled'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: 'zh-CN',
    });

    this.page = await this.context.newPage();
  }

  async loadCookies(cookies: Cookie[]): Promise<void> {
    if (!this.context) throw new Error('Not initialized');
    await this.context.addCookies(cookies);
  }

  async saveCookies(): Promise<Cookie[]> {
    if (!this.context) throw new Error('Not initialized');
    return await this.context.cookies();
  }

  async login(
    username: string,
    password: string,
    onCaptchaNeeded: (message: string) => void
  ): Promise<LoginResult> {
    if (!this.page) throw new Error('Not initialized');

    try {
      // Navigate to seller center
      await this.page.goto('https://seller.temu.com/', { waitUntil: 'networkidle' });

      // Check if already logged in (cookies worked)
      const isLoggedIn = await this.page.locator('.user-info, .dashboard, [class*="seller"]').first()
        .isVisible({ timeout: 3000 }).catch(() => false);

      if (isLoggedIn) {
        return { success: true };
      }

      // Click "账号登录" tab if present
      const accountTab = this.page.locator('text=账号登录');
      if (await accountTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await accountTab.click();
        await this.page.waitForTimeout(500);
      }

      // Fill phone number
      const phoneInput = this.page.locator('input[type="text"], input[type="tel"]').first();
      await phoneInput.clear();
      await phoneInput.pressSequentially(username, { delay: 50 });

      // Fill password
      const passwordInput = this.page.locator('input[type="password"]').first();
      await passwordInput.clear();
      await passwordInput.pressSequentially(password, { delay: 50 });

      // Check agreement checkbox if present
      const checkbox = this.page.locator('input[type="checkbox"]').first();
      if (await checkbox.isVisible({ timeout: 1000 }).catch(() => false)) {
        const isChecked = await checkbox.isChecked();
        if (!isChecked) {
          await checkbox.check();
        }
      }

      // Click login button
      const loginBtn = this.page.locator('button:has-text("登录"), button:has-text("Login")').first();
      await loginBtn.click();

      // Wait for either success or CAPTCHA
      await this.page.waitForTimeout(2000);

      // Check for CAPTCHA
      const captchaVisible = await this.page.locator(
        '[class*="captcha"], [class*="verify"], [class*="slider"], iframe[src*="captcha"]'
      ).first().isVisible({ timeout: 3000 }).catch(() => false);

      if (captchaVisible) {
        onCaptchaNeeded('验证码已出现，请在弹出的浏览器窗口中手动完成验证');

        // Wait for CAPTCHA to be resolved (poll every 2 seconds, max 120 seconds)
        for (let i = 0; i < 60; i++) {
          await this.page.waitForTimeout(2000);

          // Check if we've navigated away from login page (login success)
          const url = this.page.url();
          if (!url.includes('login') && !url.includes('signin')) {
            return { success: true };
          }

          // Check if CAPTCHA is still visible
          const stillVisible = await this.page.locator(
            '[class*="captcha"], [class*="verify"], [class*="slider"]'
          ).first().isVisible({ timeout: 500 }).catch(() => false);

          if (!stillVisible) {
            // CAPTCHA resolved, check if login succeeded
            await this.page.waitForTimeout(2000);
            const currentUrl = this.page.url();
            if (!currentUrl.includes('login') && !currentUrl.includes('signin')) {
              return { success: true };
            }
          }
        }

        return { success: false, error: 'CAPTCHA timeout (120s)' };
      }

      // Check if login succeeded
      await this.page.waitForTimeout(3000);
      const finalUrl = this.page.url();
      if (!finalUrl.includes('login') && !finalUrl.includes('signin')) {
        return { success: true };
      }

      // Check for error messages
      const errorMsg = await this.page.locator('[class*="error"], [class*="tip"]').first()
        .textContent({ timeout: 2000 }).catch(() => null);

      return {
        success: false,
        error: errorMsg || 'Login failed - unknown reason',
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  async createListing(data: ListingData): Promise<void> {
    if (!this.page) throw new Error('Not initialized');

    // Navigate to create listing page
    await this.page.goto('https://seller.temu.com/product/publish', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await this.page.waitForTimeout(2000);

    // Fill title
    const titleInput = this.page.locator('input[placeholder*="标题"], input[placeholder*="title"], textarea[placeholder*="标题"]').first();
    if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await titleInput.clear();
      await titleInput.pressSequentially(data.title, { delay: 30 });
    }

    // Upload images
    if (data.images.length > 0) {
      const fileInput = this.page.locator('input[type="file"]').first();
      if (await fileInput.count() > 0) {
        await fileInput.setInputFiles(data.images.slice(0, 6)); // Max 6 images for Temu
      }
      await this.page.waitForTimeout(3000); // Wait for upload
    }

    // Fill pricing fields if available
    if (data.pricing) {
      await this.fillPricingFields(data.pricing);
    }

    // Submit or wait for manual confirmation
    if (data.autoSubmit) {
      const submitBtn = this.page.locator('button:has-text("提交"), button:has-text("Submit")').first();
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        await this.page.waitForTimeout(3000);
      }
    }
    // If not autoSubmit, leave the form filled for manual review
  }

  private async fillPricingFields(pricing: Record<string, any>): Promise<void> {
    if (!this.page) return;

    // These selectors will need to be adjusted based on actual Temu seller page structure
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
        const input = this.page.locator(`input[placeholder*="${label}"], label:has-text("${label}") + input, label:has-text("${label}") ~ input`).first();
        if (await input.isVisible({ timeout: 1000 }).catch(() => false)) {
          await input.clear();
          await input.pressSequentially(String(pricing[key]), { delay: 30 });
        }
      }
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }
}
