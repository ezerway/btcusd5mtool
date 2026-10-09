import { CONFIG } from '../config.js';
import { BotMode } from '../types.js';
import { PaperTradingService } from '../services/paperTrading.js';
import { BrowserManager } from '../automation/browserManager.js';
import { PolymarketPage } from '../automation/polymarketPage.js';
import { MarketResolverService } from '../services/marketResolver.js';
import { Logger } from '../utils/logger.js';

export class BotEngine {
  private mode: BotMode;
  private paperTrader: PaperTradingService;
  private isRunning: boolean = false;
  private emptyPageCounter: number = 0;

  constructor(mode: BotMode = CONFIG.MODE) {
    this.mode = mode;
    this.paperTrader = new PaperTradingService();
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    Logger.banner(this.mode);

    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    Logger.info(`Starting Pure DOM Polymarket BTC 5m Bot in ${this.mode.toUpperCase()} mode...`);
    Logger.info(`Bet Size: $${CONFIG.BET_AMOUNT_USDC} USDC | Target Price(s): ${CONFIG.TARGET_PRICE_CENTS.join(', ')}¢ | Pure DOM Loop`);

    const isDryRun = this.mode === 'dry-run';

    // 1. Launch browser context
    let { page } = await BrowserManager.getPage(CONFIG.HEADLESS, CONFIG.IS_MOBILE);
    let polyPage = new PolymarketPage(page);

    await polyPage.navigateToHubOrMarket(MarketResolverService.CRYPTO_5M_HUB_URL);

    // 2. Continuous DOM sniper evaluation loop with Crash & Auto-Reload Recovery
    while (this.isRunning) {
      try {
        const domResult = await polyPage.evaluateDOMSniper(CONFIG.BET_AMOUNT_USDC, isDryRun);

        if (domResult.status === 'SCANNING_PRICES') {
          this.emptyPageCounter = 0;
          if (domResult.upPrice && domResult.downPrice) {
            // Logger.info(JSON.stringify(domResult));

            Logger.info(`DOM Prices -> Up: ${domResult.upPrice}¢ | Down: ${domResult.downPrice}¢ (Target: ${CONFIG.TARGET_PRICE_CENTS.join(', ')}¢)`);
          }
        } else if (domResult.status === 'PRICES_ARE_DASH') {
          Logger.warn(`Both upPrice and downPrice equal "--" (Up: ${domResult.upPriceStr}, Down: ${domResult.downPriceStr}). Reloading page to retry bet...`);
          await polyPage.reloadPage('Prices equal "--"');
          this.emptyPageCounter = 0;
        } else if (domResult.status === 'PAGE_CRASHED' || domResult.status === 'APPLICATION_CRASH' || domResult.status === 'PAGE_CLOSED') {
          Logger.warn(`Page crash or navigation error detected (${domResult.status}). Auto-reloading and restoring session...`);

          if (domResult.status === 'PAGE_CLOSED') {
            const newRes = await BrowserManager.getPage(CONFIG.HEADLESS, CONFIG.IS_MOBILE);
            page = newRes.page;
            polyPage = new PolymarketPage(page);
          }

          await polyPage.navigateToHubOrMarket(MarketResolverService.CRYPTO_5M_HUB_URL);
          await polyPage.reloadPage('Crash recovery reload');
          this.emptyPageCounter = 0;
        } else if (domResult.status === 'WAITING_FOR_BUTTONS') {
          if (domResult.isEmpty) {
            this.emptyPageCounter++;
            Logger.warn(`Page content empty or loading (Count: ${this.emptyPageCounter}/4)...`);
            if (this.emptyPageCounter >= 4) {
              await polyPage.reloadPage('Empty content detected 4 times in a row');
              this.emptyPageCounter = 0;
            }
          }
        } else if (domResult.status === 'BET_PLACED') {
          this.emptyPageCounter = 0;
          Logger.success(`🎯 DOM Snipe BET PLACED! Outcome: ${domResult.outcome} | Bet: $${domResult.toBet} | Target Win: $${domResult.toWin}`);
          // await polyPage.takeScreenshot(`dom_bet_${Date.now()}.png`);

          if (isDryRun) {
            this.paperTrader.executePaperTrade(
              {
                market: {
                  id: `dom_${Date.now()}`,
                  slug: 'dom-btc-5m',
                  question: 'BTC 5m DOM Snipe Bet',
                  url: page.url(),
                  strikePrice: domResult.priceToBeat || 0,
                  startTimestamp: Date.now(),
                  endTimestamp: Date.now() + 5 * 60 * 1000,
                  yesPrice: domResult.upPrice / 100,
                  noPrice: domResult.downPrice / 100,
                  active: true,
                  closed: false,
                },
                recommendedOutcome: domResult.outcome,
                confidence: 0.97,
                currentBtcPrice: domResult.currentPrice || 0,
                priceDelta: (domResult.currentPrice || 0) - (domResult.priceToBeat || 0),
                secondsRemaining: 150,
                reason: `Pure DOM ${domResult.outcome === 'YES' ? domResult.upPrice : domResult.downPrice}¢ Sniper Hit for ${domResult.outcome}`,
              },
              CONFIG.BET_AMOUNT_USDC
            );

            Logger.displayPaperSummary(
              this.paperTrader.getBalance(),
              this.paperTrader.getInitialBalance(),
              this.paperTrader.getPositions()
            );
          }
        } else if (domResult.status === 'BET_FAILED') {
          Logger.warn(`❌ DOM Snipe Bet Failed: ${domResult.reason || 'toWin is 0'} (Outcome: ${domResult.outcome}, toBet: $${domResult.toBet}, toWin: $${domResult.toWin || 0}). Retrying...`);
        } else if (domResult.status === 'INVALID_WIN_RATIO') {
          Logger.warn(`⚠️ DOM Snipe Bet Skipped: Invalid win ratio (toWin $${domResult.toWin} >= $${domResult.toBet * 2})`);
        } else if (domResult.status === 'CLICKED_LIVE_MARKET') {
          this.emptyPageCounter = 0;
          Logger.clear();
          Logger.banner(this.mode);
          Logger.info('Clicked "Go to live market" button on page. Resetting sniper...');
        }
      } catch (err) {
        Logger.error('Error in DOM sniper loop', err);
      }

      // 500ms loop
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    await BrowserManager.close();
    Logger.info('Bot engine stopped cleanly.');
  }
}
