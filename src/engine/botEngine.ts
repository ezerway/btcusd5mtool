import { CONFIG } from '../config.js';
import { BotMode, WindowPriceScanTick } from '../types.js';
import { PaperTradingService } from '../services/paperTrading.js';
import { LiveTradingService } from '../services/liveTrading.js';
import { SlackService } from '../services/slackService.js';
import { BrowserManager } from '../automation/browserManager.js';
import { PolymarketPage } from '../automation/polymarketPage.js';
import { MarketResolverService } from '../services/marketResolver.js';
import { Logger } from '../utils/logger.js';
import { DatabaseService } from '../db/database.js';

export class BotEngine {
  private mode: BotMode;
  private paperTrader: PaperTradingService;
  private liveTrader: LiveTradingService;
  private isRunning: boolean = false;
  private emptyPageCounter: number = 0;
  private lastBetUrl: string | null = null;
  private lastAccountBalance: string = '';
  private slackInterval: NodeJS.Timeout | null = null;
  private currentWindowTicks: WindowPriceScanTick[] = [];
  private currentWindowSlug: string | null = null;

  constructor(mode: BotMode = CONFIG.MODE) {
    this.mode = mode;
    this.paperTrader = new PaperTradingService();
    this.liveTrader = new LiveTradingService();
  }

  public async start(): Promise<void> {
    this.isRunning = true;
    DatabaseService.getInstance().setBotState('status', { running: true, mode: this.mode, startedAt: Date.now() });
    Logger.banner(this.mode);

    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    Logger.info(`Starting Pure DOM Polymarket BTC 5m Bot in ${this.mode.toUpperCase()} mode...`);
    Logger.info(`Bet Size: $${CONFIG.BET_AMOUNT_USDC} USDC | Target Price(s): ${CONFIG.TARGET_PRICE_CENTS.join(', ')}¢ | Pure DOM Loop`);

    const isDryRun = this.mode === 'dry-run';

    // Start hourly Slack current balance notification if webhook URL is configured
    if (CONFIG.SLACK_WEBHOOK_URL) {
      Logger.info('Slack hourly notifications enabled. Sending current balance every hour.');
      this.slackInterval = setInterval(async () => {
        try {
          let balance = await polyPage.getAccountBalance();
          if (!balance && this.lastAccountBalance) {
            balance = this.lastAccountBalance;
          }
          Logger.info(`Sending hourly balance (${balance || 'N/A'}) to Slack...`);
          await SlackService.sendBalance(balance);
        } catch (err) {
          Logger.error('Failed to send hourly Slack balance notification', err);
        }
      }, 60 * 60 * 1000);
    }

    // 1. Launch browser context
    let { page } = await BrowserManager.getPage(CONFIG.HEADLESS, CONFIG.IS_MOBILE);
    let polyPage = new PolymarketPage(page);

    await polyPage.navigateToHubOrMarket(MarketResolverService.CRYPTO_5M_HUB_URL);

    // 2. Continuous DOM sniper evaluation loop with Crash & Auto-Reload Recovery
    while (this.isRunning) {
      try {
        if (!page.isClosed()) {
          const currentUrl = page.url();
          if (
            currentUrl &&
            currentUrl.includes('polymarket.com') &&
            !currentUrl.endsWith('/crypto/5M') &&
            !currentUrl.endsWith('/crypto/5m') &&
            currentUrl !== 'about:blank'
          ) {
            this.lastBetUrl = currentUrl;
          }
        }

        const domResult = await polyPage.evaluateDOMSniper(
          CONFIG.BET_AMOUNT_USDC,
          isDryRun,
          CONFIG.MAX_BETS_PER_WINDOW,
          CONFIG.BET_COOLDOWN_MS
        );

        if (domResult.balance) {
          this.lastAccountBalance = domResult.balance;
        }

        // Track active window slug and reset window ticks when new market round starts
        if (domResult.marketSlug && domResult.marketSlug !== this.currentWindowSlug) {
          this.currentWindowSlug = domResult.marketSlug;
          this.currentWindowTicks = [];
        }

        // Collect continuous window price scan tick if prices are available
        if (domResult.upPrice && domResult.downPrice) {
          const deltaNum = typeof domResult.priceDelta === 'string' ? parseFloat(domResult.priceDelta) : (domResult.priceDelta || 0);
          this.currentWindowTicks.push({
            timestamp: Date.now(),
            upPrice: domResult.upPrice,
            downPrice: domResult.downPrice,
            priceToBeat: domResult.priceToBeat || 0,
            currentPrice: domResult.currentPrice || 0,
            priceDelta: isNaN(deltaNum) ? 0 : deltaNum,
            secondsRemaining: domResult.secondsRemaining ?? null,
            remainingTime: domResult.countdownStr ?? null,
          });
        }

        if (domResult.status === 'SCANNING_PRICES' || domResult.status === 'ALREADY_BET') {
          this.emptyPageCounter = 0;
          if (domResult.upPrice && domResult.downPrice) {
            DatabaseService.getInstance().recordPriceTick({
              upPrice: domResult.upPrice,
              downPrice: domResult.downPrice,
              priceToBeat: domResult.priceToBeat || 0,
              currentPrice: domResult.currentPrice || 0,
              priceDelta: domResult.priceDelta,
              secondsRemaining: domResult.secondsRemaining,
              remainingTime: domResult.countdownStr,
              balance: this.lastAccountBalance,
              marketSlug: domResult.marketSlug,
            });

            DatabaseService.getInstance().setBotState('last_tick', {
              upPrice: domResult.upPrice,
              downPrice: domResult.downPrice,
              priceToBeat: domResult.priceToBeat,
              currentPrice: domResult.currentPrice,
              priceDelta: domResult.priceDelta,
              countdownStr: domResult.countdownStr,
              secondsRemaining: domResult.secondsRemaining,
              balance: this.lastAccountBalance,
              marketSlug: domResult.marketSlug,
              timestamp: Date.now(),
            });

            Logger.displayDOMPricesTable({
              upPrice: domResult.upPrice,
              downPrice: domResult.downPrice,
              targetPrices: CONFIG.TARGET_PRICE_CENTS,
              priceToBeat: domResult.priceToBeat,
              currentPrice: domResult.currentPrice,
              priceDelta: domResult.priceDelta,
              countdownStr: domResult.countdownStr,
              secondsRemaining: domResult.secondsRemaining,
            });
          }
        } else if (domResult.status === 'PRICES_ARE_DASH') {
          Logger.warn(`Both upPrice and downPrice equal "--" (Up: ${domResult.upPriceStr}, Down: ${domResult.downPriceStr}). Reloading page to retry bet...`);
          await polyPage.reloadPage('Prices equal "--"');
          this.emptyPageCounter = 0;
        } else if (domResult.status === 'PAGE_CRASHED' || domResult.status === 'APPLICATION_CRASH' || domResult.status === 'PAGE_CLOSED') {
          Logger.warn(`Page crash or navigation error detected (${domResult.status}). Retrying bet page...`);

          const targetUrl = this.lastBetUrl || MarketResolverService.CRYPTO_5M_HUB_URL;

          if (domResult.status === 'PAGE_CLOSED' || page.isClosed()) {
            const newRes = await BrowserManager.getPage(CONFIG.HEADLESS, CONFIG.IS_MOBILE);
            page = newRes.page;
            polyPage = new PolymarketPage(page);
            Logger.info(`Restoring session to bet page: ${targetUrl}`);
            await polyPage.navigateToHubOrMarket(targetUrl);
          } else {
            // Page is still open - reload the current bet page directly
            const reloaded = await polyPage.reloadPage('Crash recovery - retrying bet page');
            if (!reloaded) {
              Logger.info(`Direct reload failed, navigating to bet page: ${targetUrl}`);
              await polyPage.navigateToHubOrMarket(targetUrl);
            }
          }
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
          const countInfo = domResult.maxBets && domResult.maxBets > 1
            ? ` [Bet ${domResult.betCount}/${domResult.maxBets} this round]`
            : '';
          Logger.success(`🎯 DOM Snipe BET PLACED!${countInfo} Outcome: ${domResult.outcome} | Bet: $${domResult.toBet} | Target Win: $${domResult.toWin}`);

          if (domResult.upPrice && domResult.downPrice) {
            DatabaseService.getInstance().recordPriceTick({
              upPrice: domResult.upPrice,
              downPrice: domResult.downPrice,
              priceToBeat: domResult.priceToBeat || 0,
              currentPrice: domResult.currentPrice || 0,
              priceDelta: domResult.priceDelta,
              secondsRemaining: domResult.secondsRemaining,
              remainingTime: domResult.countdownStr,
              balance: this.lastAccountBalance,
              marketSlug: domResult.marketSlug,
            });

            DatabaseService.getInstance().setBotState('last_tick', {
              upPrice: domResult.upPrice,
              downPrice: domResult.downPrice,
              priceToBeat: domResult.priceToBeat,
              currentPrice: domResult.currentPrice,
              priceDelta: domResult.priceDelta,
              countdownStr: domResult.countdownStr,
              secondsRemaining: domResult.secondsRemaining,
              balance: this.lastAccountBalance,
              marketSlug: domResult.marketSlug,
              timestamp: Date.now(),
            });
          }

          const remainingTimeStr = domResult.countdownStr
            ? `${domResult.countdownStr}${domResult.secondsRemaining !== null && domResult.secondsRemaining !== undefined ? ` (${domResult.secondsRemaining}s)` : ''}`
            : (domResult.secondsRemaining !== null && domResult.secondsRemaining !== undefined ? `${domResult.secondsRemaining}s` : 'N/A');

          if (isDryRun) {
            this.paperTrader.executePaperTrade(
              {
                market: {
                  id: `dom_${Date.now()}`,
                  slug: domResult.marketSlug || 'dom-btc-5m',
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
                secondsRemaining: domResult.secondsRemaining ?? 150,
                remainingTime: remainingTimeStr,
                reason: `Pure DOM ${domResult.outcome === 'YES' ? domResult.upPrice : domResult.downPrice}¢ Sniper Hit for ${domResult.outcome}`,
              },
              CONFIG.BET_AMOUNT_USDC
            );

            Logger.displayPaperSummary(
              this.paperTrader.getBalance(),
              this.paperTrader.getInitialBalance(),
              this.paperTrader.getPositions()
            );
          } else {
            this.liveTrader.recordLiveTrade(
              {
                market: {
                  id: `live_${Date.now()}`,
                  slug: domResult.marketSlug || 'live-btc-5m',
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
                secondsRemaining: domResult.secondsRemaining ?? 150,
                remainingTime: remainingTimeStr,
                reason: `Pure DOM ${domResult.outcome === 'YES' ? domResult.upPrice : domResult.downPrice}¢ Live Snipe Hit for ${domResult.outcome}`,
              },
              CONFIG.BET_AMOUNT_USDC
            );

            Logger.displayLiveSummary(this.liveTrader.getPositions());
          }
        } else if (domResult.status === 'BET_FAILED') {
          Logger.warn(`❌ DOM Snipe Bet Failed: ${domResult.reason || 'toWin is 0'} (Outcome: ${domResult.outcome}, toBet: $${domResult.toBet}, toWin: $${domResult.toWin || 0}). Retrying...`);
        } else if (domResult.status === 'DELTA_TOO_LOW') {
          this.emptyPageCounter = 0;
          Logger.warn(`⚠️ Snipe skipped (${domResult.outcome}): Delta too small & risky (|Delta|: $${domResult.absDelta || Math.abs(parseFloat(domResult.priceDelta)).toFixed(2)} < $${domResult.minPriceDelta}. Current: $${domResult.currentPrice} vs Beat: $${domResult.priceToBeat})`);
        } else if (domResult.status === 'INVALID_WIN_RATIO') {
          Logger.warn(`⚠️ DOM Snipe Bet Skipped: Invalid win ratio (toWin $${domResult.toWin} >= $${domResult.toBet * 2})`);
        } else if (domResult.status === 'CLICKED_LIVE_MARKET') {
          this.emptyPageCounter = 0;

          // Snapshot window scans collected during this round
          const windowScansSnapshot = [...this.currentWindowTicks];

          // Resolve open trades using final round prices right when round concludes
          if (isDryRun) {
            this.paperTrader.resolvePositions(domResult.currentPrice, domResult.priceToBeat, windowScansSnapshot);
          } else {
            this.liveTrader.resolvePositions(domResult.currentPrice, domResult.priceToBeat, windowScansSnapshot);
          }

          this.currentWindowTicks = [];

          Logger.clear();
          Logger.banner(this.mode);
          Logger.info('Clicked "Go to live market" button on page. Resetting sniper...');

          if (isDryRun) {
            Logger.displayPaperSummary(
              this.paperTrader.getBalance(),
              this.paperTrader.getInitialBalance(),
              this.paperTrader.getPositions()
            );
          } else {
            Logger.displayLiveSummary(this.liveTrader.getPositions());
          }
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
    DatabaseService.getInstance().setBotState('status', { running: false, mode: this.mode, stoppedAt: Date.now() });
    if (this.slackInterval) {
      clearInterval(this.slackInterval);
      this.slackInterval = null;
    }
    await BrowserManager.close();
    Logger.info('Bot engine stopped cleanly.');
  }
}
