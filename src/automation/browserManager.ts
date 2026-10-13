import { chromium, BrowserContext, Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';

export class BrowserManager {
  private static context: BrowserContext | null = null;
  private static page: Page | null = null;

  public static async getPage(
    headless: boolean = CONFIG.HEADLESS
  ): Promise<{ context: BrowserContext; page: Page }> {
    if (this.context && this.page && !this.page.isClosed()) {
      return { context: this.context, page: this.page };
    }

    const userDataDir = path.resolve(CONFIG.USER_DATA_DIR);
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    Logger.info(`Launching persistent Playwright Browser (Headless: ${headless}, Mobile View: 1-Tap)...`);

    try {
      this.context = await chromium.launchPersistentContext(userDataDir, {
        headless,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          // '--ignore-certificate-errors',
        ],
      });

      const pages = this.context.pages();
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
      this.page.setDefaultTimeout(20000);

      return { context: this.context, page: this.page };
    } catch (err: any) {
      if (err.message?.includes('Opening in existing browser session')) {
        Logger.warn('Profile directory locked by existing session. Re-attempting connection...');
        const browser = await chromium.launch({ headless });
        this.context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: true,
          hasTouch: true,
          userAgent:
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1',
        });
        this.page = await this.context.newPage();
        return { context: this.context, page: this.page };
      }
      throw err;
    }
  }

  public static async close(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch (e) { }
      this.context = null;
      this.page = null;
      Logger.info('Browser closed.');
    }
  }
}
