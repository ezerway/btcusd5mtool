import { Page } from 'playwright';
import path from 'path';
import fs from 'fs';
import { CONFIG } from '../config.js';
import { BetOutcome, OrderResult } from '../types.js';
import { Logger } from '../utils/logger.js';
import { MarketResolverService } from '../services/marketResolver.js';

export class PolymarketPage {
  constructor(private page: Page) { }

  /**
   * Navigates to target Polymarket URL with in-session DOM navigation for "BTC Up or Down 5m".
   */
  public async navigateToHubOrMarket(
    url: string = MarketResolverService.CRYPTO_5M_HUB_URL,
    maxRetries: number = 5
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.page.isClosed()) return false;

        const current = this.page.url();

        if (current.includes('polymarket.com') && current !== 'about:blank') {
          const clickedTarget = await this.clickBTCUpOrDown5mLink();
          if (clickedTarget) {
            await this.page.waitForTimeout(2000);
            return true;
          }

          Logger.info(`Navigating to target via client-side location: ${url}`);
          await this.page.evaluate((target) => {
            window.location.href = target;
          }, url);
          await this.page.waitForTimeout(3000);
          return true;
        }

        Logger.info(`Opening Polymarket base domain (Attempt ${attempt}/${maxRetries})...`);
        await this.page.goto('https://polymarket.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.waitForTimeout(2500);

        const clickedTarget = await this.clickBTCUpOrDown5mLink();
        if (clickedTarget) {
          Logger.success('Clicked "BTC Up or Down 5m" card link directly on DOM!');
          await this.page.waitForTimeout(2000);
          return true;
        }

        Logger.info(`Redirecting in-session to ${url}...`);
        await this.page.evaluate((target) => {
          window.location.href = target;
        }, url);
        await this.page.waitForTimeout(3000);
        return true;
      } catch (err: any) {
        Logger.warn(`Navigation attempt ${attempt}/${maxRetries} failed: ${err.message || err}. Retrying in 2s...`);
        await this.page.waitForTimeout(2000);
      }
    }

    Logger.error(`All ${maxRetries} navigation attempts failed.`);
    return false;
  }

  /**
   * Searches the DOM for links titled or containing "BTC Up or Down 5m" and clicks them.
   */
  public async clickBTCUpOrDown5mLink(): Promise<boolean> {
    try {
      if (this.page.isClosed()) return false;
      return await this.page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        const target = anchors.find((a) => {
          const txt = (a.textContent || '').trim();
          const title = a.getAttribute('title') || '';
          const label = a.getAttribute('aria-label') || '';
          return (
            txt.includes('BTC Up or Down 5m') ||
            title.includes('BTC Up or Down 5m') ||
            label.includes('BTC Up or Down 5m') ||
            (txt.includes('BTC') && txt.includes('Up') && txt.includes('5m'))
          );
        });

        if (target) {
          (target as HTMLElement).click();
          return true;
        }
        return false;
      });
    } catch (e) {
      return false;
    }
  }

  /**
   * Reloads the page if content returns empty, page crashes, or buttons are missing/dash.
   */
  public async reloadPage(reason: string = 'Content empty'): Promise<boolean> {
    try {
      if (this.page.isClosed()) return false;
      Logger.warn(`Reloading page: ${reason}...`);
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 25000 });
      await this.page.waitForTimeout(2000);
      return true;
    } catch (err) {
      Logger.error('Failed to reload page', err);
      return false;
    }
  }

  /**
   * Pure DOM Sniper Evaluator - Runs the exact user JavaScript snippet inside page DOM.
   * Catches context destroyed / page crash errors to enable automatic page recovery.
   */
  public async evaluateDOMSniper(toBet: number = CONFIG.BET_AMOUNT_USDC, isDryRun: boolean = true): Promise<any> {
    try {

      if (this.page.isClosed()) {
        return { status: 'PAGE_CLOSED' };
      }

      const result = await this.page.evaluate(
        (opts) => {
          const { toBet, isDryRun, targetPrices } = opts;
          const targetList: number[] = Array.isArray(targetPrices) ? targetPrices : [Number(targetPrices)];

          // 1. Auto click live market button if available on page
          const contentEl = document.querySelectorAll('#content')[0];
          const liveBtn = contentEl ? contentEl.querySelector('[aria-label="Go to live market"]') : null;

          if (liveBtn) {
            (window as any).clickedBet = false;
            (liveBtn as HTMLElement).click();
            return { status: 'CLICKED_LIVE_MARKET', clickedBet: false };
          }

          // Extract Price To Beat & Current Price labels from DOM
          const bodyText = document.body ? document.body.textContent || '' : '';
          let priceToBeat = 0;
          let currentPrice = 0;

          const ptbMatch = bodyText.match(/Price\s+To\s+Beat[\s:]*\$?([0-9,]+(?:\.[0-9]+)?)/i);
          if (ptbMatch && ptbMatch[1]) {
            console.log(JSON.stringify(ptbMatch));
            priceToBeat = parseFloat(ptbMatch[1].replace(/,/g, ''));
          }

          const currentPriceDiv = document.querySelector('#price-chart-container .pk-animated-label__text');
          const cpMatch = currentPriceDiv ? ['', currentPriceDiv.textContent] : bodyText.match(/Current\s+Price[\s:]*\$?([0-9,]+(?:\.[0-9]+)?)/i);
          if (cpMatch && cpMatch[1]) {
            currentPrice = parseFloat(cpMatch[1].replace(/,/g, ''));
          }

          // Check for application crash / error boundary text
          if (bodyText.includes('Application error') || bodyText.includes('Something went wrong') || bodyText.includes('500 Internal Server Error')) {
            console.log(bodyText);
            // return { status: 'APPLICATION_CRASH', bodyText: bodyText.slice(0, 100) };
          }

          // 2. Select Up and Down buttons from .trading-button-text
          const allBtns = Array.from(document.querySelectorAll('.trading-button-text'));
          if (allBtns.length < 2) {
            const isEmpty = bodyText.trim().length < 50;
            return { status: 'WAITING_FOR_BUTTONS', isEmpty, priceToBeat, currentPrice };
          }

          const btns = [allBtns[allBtns.length - 1], allBtns[allBtns.length - 2]];
          const upBtn = btns.find((btn) => String(btn.textContent).split('9\n8')[0].includes('Up'));
          const downBtn = btns.find((btn) => String(btn.textContent).split('9\n8')[0]?.includes('Down'));

          if (!upBtn || !downBtn) {
            return { status: 'BUTTONS_NOT_MATCHED', priceToBeat, currentPrice };
          }

          const upPriceStr = String(upBtn.textContent).split('9\n8')[0].replace('Up', '').replace('¢', '').trim();
          const downPriceStr = String(downBtn.textContent).split('9\n8')[0].replace('Down', '').replace('¢', '').trim();

          const upPrice = parseInt(upPriceStr, 10);
          const downPrice = parseInt(downPriceStr, 10);

          // AND logic: Check if BOTH upPrice AND downPrice equal '--' / '-' / isNaN
          const isUpDash = upPriceStr.includes('--') || upPriceStr === '-' || isNaN(upPrice);
          const isDownDash = downPriceStr.includes('--') || downPriceStr === '-' || isNaN(downPrice);

          if (isUpDash && isDownDash) {
            return {
              status: 'PRICES_ARE_DASH',
              upPriceStr,
              downPriceStr,
              priceToBeat,
              currentPrice,
            };
          }

          if ((window as any).clickedBet) {
            return { status: 'ALREADY_BET', upPrice, downPrice, priceToBeat, currentPrice };
          }

          let canBet = false;
          let selectedOutcome: 'YES' | 'NO' | null = null;

          const isUpTarget = targetList.includes(upPrice);
          const isDownTarget = targetList.includes(downPrice);

          if (isUpTarget && isDownTarget) {
            if (upPrice >= downPrice) {
              (upBtn as HTMLElement).click();
              selectedOutcome = 'YES';
              canBet = true;
            } else {
              (downBtn as HTMLElement).click();
              selectedOutcome = 'NO';
              canBet = true;
            }
          } else if (isUpTarget) {
            (upBtn as HTMLElement).click();
            selectedOutcome = 'YES';
            canBet = true;
          } else if (isDownTarget) {
            (downBtn as HTMLElement).click();
            selectedOutcome = 'NO';
            canBet = true;
          } else {
            if (upPrice > downPrice) {
              (upBtn as HTMLElement).click();
              selectedOutcome = 'YES';
            } else if (downPrice > upPrice) {
              (downBtn as HTMLElement).click();
              selectedOutcome = 'NO';
            }
          }

          if (canBet && selectedOutcome) {
            const betBtns = Array.from(document.querySelectorAll('nav .border-pk-border'));
            const matchedBtn = betBtns.find((btn) => btn.tagName === 'BUTTON' && !btn?.disabled && String(btn.textContent).includes(`$${toBet}`));
            const betBtn = matchedBtn || (betBtns.length > 0 ? betBtns[betBtns.length - 1] : null);

            let toWin = 0;

            if (betBtn) {
              const btnText = String(betBtn.textContent);
              const parts = btnText.split(' ');
              if (parts.length > 1) {
                const rawWin = parts[1].split('$9\n8')[0].replace('$', '').replace(/,/g, '');
                toWin = parseFloat(rawWin);
              }
            }

            if (isNaN(toWin)) {
              toWin = 0;
            }

            // If toWin is 0 or invalid, the bet failed
            // if (toWin <= 0) {
            //   return {
            //     status: 'BET_FAILED',
            //     reason: !betBtn ? 'Bet button not found' : 'toWin is 0',
            //     outcome: selectedOutcome,
            //     upPrice,
            //     downPrice,
            //     toBet,
            //     toWin: 0,
            //     priceToBeat,
            //     currentPrice,
            //   };
            // }

            const isValid = toWin < toBet * 2;
            if (!isValid) {
              return {
                status: 'INVALID_WIN_RATIO',
                outcome: selectedOutcome,
                upPrice,
                downPrice,
                toBet,
                toWin,
                priceToBeat,
                currentPrice,
              };
            }

            if (betBtn) {
              if (!isDryRun) {
                (betBtn as HTMLElement).click();
              }
              (window as any).clickedBet = true;
            }

            return {
              status: 'BET_PLACED',
              outcome: selectedOutcome,
              upPrice,
              downPrice,
              toBet,
              toWin,
              isValid: true,
              priceToBeat,
              currentPrice,
            };
          }

          return {
            status: 'SCANNING_PRICES',
            upPrice,
            downPrice,
            targetPrices: targetList,
            priceToBeat,
            currentPrice,
          };
        },
        { toBet, isDryRun, targetPrices: CONFIG.TARGET_PRICE_CENTS }
      );

      return result;
    } catch (err: any) {
      const errMsg = err.message || '';
      if (
        errMsg.includes('Execution context was destroyed') ||
        errMsg.includes('Target closed') ||
        errMsg.includes('Navigation') ||
        errMsg.includes('net::')
      ) {
        return { status: 'PAGE_CRASHED', error: errMsg };
      }
      return { status: 'EVAL_ERROR', error: errMsg };
    }
  }

  public async takeScreenshot(filename: string): Promise<string> {
    const dir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, filename);
    await this.page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  }
}
