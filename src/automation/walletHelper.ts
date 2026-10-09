import { BrowserManager } from './browserManager.js';
import { CONFIG } from '../config.js';
import { Logger } from '../utils/logger.js';

export class WalletHelper {
  public static async interactiveLogin(): Promise<void> {
    Logger.info('Starting Interactive Polymarket Mobile 1-Tap Wallet Setup Session...');
    Logger.info('A Chromium browser window will open in Mobile 1-Tap layout. Log into Polymarket and connect your wallet.');
    Logger.info(`Session data will be stored persistently in: ${CONFIG.USER_DATA_DIR}`);

    const { page } = await BrowserManager.getPage(false, CONFIG.IS_MOBILE); // Forced headful mode

    await page.goto(CONFIG.POLYMARKET_BASE_URL, { waitUntil: 'domcontentloaded' });

    console.log('\n============================================================');
    console.log(' 👉  PLEASE LOG IN TO POLYMARKET & CONNECT YOUR WALLET');
    console.log(' 👉  WHEN YOU ARE DONE, PRESS ENTER IN THIS TERMINAL TO SAVE');
    console.log('============================================================\n');

    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });

    Logger.success('Wallet setup session complete. Session saved to user_data directory.');
    await BrowserManager.close();
  }
}
