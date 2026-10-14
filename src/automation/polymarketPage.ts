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
          if (url === MarketResolverService.CRYPTO_5M_HUB_URL) {
            const clickedTarget = await this.clickBTCUpOrDown5mLink();
            if (clickedTarget) {
              await this.page.waitForTimeout(2000);
              return true;
            }
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

        if (url === MarketResolverService.CRYPTO_5M_HUB_URL) {
          const clickedTarget = await this.clickBTCUpOrDown5mLink();
          if (clickedTarget) {
            Logger.success('Clicked "BTC Up or Down 5m" card link directly on DOM!');
            await this.page.waitForTimeout(2000);
            return true;
          }
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
   * Extracts current account balance from Polymarket navigation bar.
   * Element selector: Array.from(document.querySelectorAll('nav .text-pk-content-secondary')).at(-1).textContent
   */
  public async getAccountBalance(): Promise<string> {
    try {
      if (this.page.isClosed()) return '';
      return await this.page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('nav .text-pk-content-secondary'));
        const lastEl = els.at(-1);
        return lastEl ? (lastEl.textContent || '').trim() : '';
      });
    } catch (err) {
      return '';
    }
  }

  /**
   * Pure DOM Sniper Evaluator - Runs the exact user JavaScript snippet inside page DOM.
   * Catches context destroyed / page crash errors to enable automatic page recovery.
   */
  public async evaluateDOMSniper(
    toBet: number = CONFIG.BET_AMOUNT_USDC,
    isDryRun: boolean = true,
    maxBetsPerWindow: number = CONFIG.MAX_BETS_PER_WINDOW,
    betCooldownMs: number = CONFIG.BET_COOLDOWN_MS,
    allowBetting: boolean = true,
    cashoutDropPercent: number = CONFIG.CASHOUT_DROP_PERCENT || 20.0
  ): Promise<any> {
    try {

      if (this.page.isClosed()) {
        return { status: 'PAGE_CLOSED' };
      }

      const result = await this.page.evaluate(
        async (opts) => {
          const { toBet, isDryRun, targetPrices, minPriceDelta = 1.0, maxBetsPerWindow = 1, betCooldownMs = 2500, allowBetting = true, cashoutDropPercent = 20.0 } = opts;
          const targetList: number[] = Array.isArray(targetPrices) ? targetPrices : [Number(targetPrices)];
          const maxBets = Math.max(1, Number(maxBetsPerWindow || 1));

          // Extract current account balance from nav
          const balanceEls = Array.from(document.querySelectorAll('nav .text-pk-content-secondary'));
          const balance = balanceEls.at(-1)?.textContent?.trim() || '';

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
            currentPrice = parseFloat(cpMatch[1].replace(/,/g, '').replace(/\$/g, ''));
          }

          // Extract countdown remaining time from DOM
          let countdownStr = '';
          let secondsRemaining: number | null = null;

          try {
            const minsEl = Array.from(document.querySelectorAll('span, div, p')).find(
              (el) => el.children.length === 0 && /^mins?$/i.test(el.textContent?.trim() || '')
            );

            if (minsEl) {
              let cur: HTMLElement | null = minsEl.parentElement;
              while (cur && (!cur.textContent?.toLowerCase().includes('sec') || cur.querySelectorAll('.tabular-nums').length < 4)) {
                cur = cur.parentElement;
                if (cur && cur.tagName === 'BODY') {
                  cur = null;
                  break;
                }
              }

              if (cur) {
                const tabularCols = Array.from(cur.querySelectorAll('.tabular-nums'));
                if (tabularCols.length >= 4) {
                  const digits = tabularCols.map((col) => {
                    const spans = Array.from(col.querySelectorAll('span'));
                    const activeSpan = spans.find((s) => {
                      const style = s.getAttribute('style') || '';
                      return (
                        style.includes('transform: none') ||
                        style.includes('translateY(0px)') ||
                        (!style.includes('translateY(') && style.includes('opacity: 1'))
                      );
                    });
                    return activeSpan ? activeSpan.textContent?.trim() : '';
                  });

                  const minStr = (digits[0] || '0') + (digits[1] || '0');
                  const secStr = (digits[2] || '0') + (digits[3] || '0');
                  const mins = parseInt(minStr, 10);
                  const secs = parseInt(secStr, 10);
                  if (!isNaN(mins) && !isNaN(secs)) {
                    secondsRemaining = mins * 60 + secs;
                    countdownStr = `${minStr}:${secStr}`;
                  }
                }
              }
            }

            // Fallback: Calculate from URL slug timestamp (btc-updown-5m-<timestamp>)
            if (secondsRemaining === null || !countdownStr) {
              const urlMatch = window.location.href.match(/btc-updown-5m-(\d+)/);
              if (urlMatch) {
                const startUnix = parseInt(urlMatch[1], 10);
                const endUnix = startUnix + 300;
                const diffSecs = Math.max(0, Math.floor(endUnix - Date.now() / 1000));
                secondsRemaining = diffSecs;
                const m = Math.floor(diffSecs / 60).toString().padStart(2, '0');
                const s = (diffSecs % 60).toString().padStart(2, '0');
                countdownStr = `${m}:${s}`;
              }
            }
          } catch { }

          const urlSlugMatch = window.location.href.match(/(btc-updown-5m-\d+)/);
          const marketSlug = urlSlugMatch ? urlSlugMatch[1] : 'btc-updown-5m';

          // Detect new market slug / round transition
          if ((window as any).currentMarketSlug && (window as any).currentMarketSlug !== marketSlug) {
            (window as any).betCount = 0;
            (window as any).lastBetTimestamp = 0;
            (window as any).clickedBet = false;
            (window as any).lastUpPrice = null;
            (window as any).lastDownPrice = null;
            (window as any).betOutcome = null;
            (window as any).betEntryPrice = null;
            (window as any).hasCashedOut = false;
            (window as any).isCashingOut = false;
          }
          (window as any).currentMarketSlug = marketSlug;

          // 1. Auto click live market button if available on page (market ended)
          const contentEl = document.querySelectorAll('#content')[0];
          const liveBtn = contentEl ? contentEl.querySelector('[aria-label="Go to live market"]') : null;

          if (liveBtn) {
            (window as any).betCount = 0;
            (window as any).lastBetTimestamp = 0;
            (window as any).clickedBet = false;
            (window as any).lastUpPrice = null;
            (window as any).lastDownPrice = null;
            (window as any).betOutcome = null;
            (window as any).betEntryPrice = null;
            (window as any).hasCashedOut = false;
            (window as any).isCashingOut = false;
            (liveBtn as HTMLElement).click();
            return {
              status: 'CLICKED_LIVE_MARKET',
              clickedBet: false,
              betCount: 0,
              maxBets,
              priceToBeat,
              currentPrice,
              balance,
              marketSlug,
            };
          }

          // Check for application crash / error boundary text
          if (bodyText.includes('Application error') || bodyText.includes('Something went wrong') || bodyText.includes('500 Internal Server Error')) {
            console.log(bodyText);
            // return { status: 'APPLICATION_CRASH', bodyText: bodyText.slice(0, 100) };
          }

          const currentBetCount = Number((window as any).betCount || 0);

          const helpers = {
            async executeCashOut(
              outcome: 'YES' | 'NO',
              entryPrice: number,
              currentOutcomePrice: number,
              dropPercent: number
            ) {
              // Find cash out button by selector: first #content .trading-button has text "Cash out"
              const contentTradingBtns = Array.from(document.querySelectorAll('#content .trading-button'));
              let cashOutBtn = contentTradingBtns.find((b) => (b.textContent || '').trim().includes('Cash out')) as HTMLElement | undefined;

              if (!cashOutBtn) {
                cashOutBtn = Array.from(document.querySelectorAll('.trading-button')).find(
                  (b) => (b.textContent || '').trim().includes('Cash out')
                ) as HTMLElement | undefined;
              }

              if (!cashOutBtn) {
                if (isDryRun) {
                  (window as any).hasCashedOut = true;
                  return {
                    status: 'CASHOUT_EXECUTED',
                    isDryRun: true,
                    outcome,
                    entryPrice,
                    currentOutcomePrice,
                    dropPercent: dropPercent.toFixed(2),
                    clickedCashOutBtn: false,
                    clickedModalBtn: false,
                  };
                }
                return {
                  status: 'CASHOUT_PENDING_BUTTON',
                  outcome,
                  entryPrice,
                  currentOutcomePrice,
                  dropPercent: dropPercent.toFixed(2),
                };
              }

              (window as any).isCashingOut = true;

              // 1. Click cashout button
              cashOutBtn.click();

              // 2. Wait modal open, click document.querySelectorAll('[role=dialog] [data-slot=modal-footer] .trading-button')
              let modalClicked = false;
              const startTime = Date.now();
              const timeoutMs = 1000;

              while (Date.now() - startTime < timeoutMs) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                const modalBtns = Array.from(
                  document.querySelectorAll('[role=dialog] [data-slot=modal-footer] .trading-button')
                ) as HTMLElement[];

                if (modalBtns.length > 0) {
                  const target = modalBtns.find((b) => !b.textContent?.toLowerCase().includes('cancel')) || modalBtns[0];
                  if (target) {
                    target.click();
                    modalClicked = true;
                    break;
                  }
                }
              }

              (window as any).isCashingOut = false;
              (window as any).hasCashedOut = true;

              return {
                status: 'CASHOUT_EXECUTED',
                isDryRun,
                outcome,
                entryPrice,
                currentOutcomePrice,
                dropPercent: dropPercent.toFixed(2),
                clickedCashOutBtn: true,
                clickedModalBtn: modalClicked,
              };
            },

            async checkCashOutCondition(up: number, down: number) {
              const betCount = Number((window as any).betCount || 0);
              const betOutcome = (window as any).betOutcome as ('YES' | 'NO' | null);
              const entryPrice = Number((window as any).betEntryPrice || 0);
              const hasCashedOut = Boolean((window as any).hasCashedOut);
              const isCashingOut = Boolean((window as any).isCashingOut);

              if (betCount <= 0 || !betOutcome || entryPrice <= 0 || hasCashedOut || isCashingOut) {
                return null;
              }

              const currentOutcomePrice = betOutcome === 'YES' ? up : down;
              if (!currentOutcomePrice || isNaN(currentOutcomePrice) || currentOutcomePrice <= 0) {
                return null;
              }

              // Check if price decreased >= cashoutDropPercent (default 20%)
              const priceDrop = entryPrice - currentOutcomePrice;
              const dropPercent = (priceDrop / entryPrice) * 100;

              if (dropPercent >= cashoutDropPercent) {
                return await this.executeCashOut(betOutcome, entryPrice, currentOutcomePrice, dropPercent);
              }

              return null;
            },

            parseButtonPrice(text: string, label: 'Up' | 'Down'): number {
              const clean = text.split('9\n8')[0].replace(label, '').replace('¢', '').replace('$', '').trim();
              const num = parseFloat(clean);
              if (isNaN(num)) return NaN;
              if (num > 0 && num <= 1.0 && clean.includes('.')) {
                return Math.round(num * 100);
              }
              return Math.round(num);
            }
          };

          // If max bets for this round has already been reached, keep continuous price recording active!
          if (currentBetCount >= maxBets) {
            let upPrice = (window as any).lastUpPrice || 50;
            let downPrice = (window as any).lastDownPrice || 50;

            const allBtns = Array.from(document.querySelectorAll('.trading-button-text'));
            if (allBtns.length >= 2) {
              const btns = [allBtns[allBtns.length - 1], allBtns[allBtns.length - 2]];
              const upBtn = btns.find((btn) => String(btn.textContent).split('9\n8')[0].includes('Up'));
              const downBtn = btns.find((btn) => String(btn.textContent).split('9\n8')[0]?.includes('Down'));
              if (upBtn && downBtn) {
                const u = helpers.parseButtonPrice(String(upBtn.textContent), 'Up');
                const d = helpers.parseButtonPrice(String(downBtn.textContent), 'Down');
                if (!isNaN(u) && !isNaN(d)) {
                  upPrice = u;
                  downPrice = d;
                  (window as any).lastUpPrice = u;
                  (window as any).lastDownPrice = d;
                }
              }
            }

            // Check cashout condition: if price decrease >= 20%
            const cashOutRes = await helpers.checkCashOutCondition(upPrice, downPrice);
            if (cashOutRes) {
              const rawDelta = currentPrice - priceToBeat;
              return {
                ...cashOutRes,
                upPrice,
                downPrice,
                priceToBeat,
                currentPrice,
                priceDelta: rawDelta.toFixed(2),
                secondsRemaining,
                countdownStr,
                marketSlug,
                balance,
              };
            }

            const rawDelta = currentPrice - priceToBeat;
            return {
              status: 'ALREADY_BET',
              betCount: currentBetCount,
              maxBets,
              upPrice,
              downPrice,
              priceToBeat,
              currentPrice,
              priceDelta: rawDelta.toFixed(2),
              secondsRemaining,
              countdownStr,
              marketSlug,
              balance,
            };
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

          const upPriceStr = String(upBtn.textContent).split('9\n8')[0].replace('Up', '').replace('¢', '').replace('$', '').trim();
          const downPriceStr = String(downBtn.textContent).split('9\n8')[0].replace('Down', '').replace('¢', '').replace('$', '').trim();

          const upPrice = helpers.parseButtonPrice(String(upBtn.textContent), 'Up');
          const downPrice = helpers.parseButtonPrice(String(downBtn.textContent), 'Down');

          if (!isNaN(upPrice) && !isNaN(downPrice)) {
            (window as any).lastUpPrice = upPrice;
            (window as any).lastDownPrice = downPrice;
          }

          // If a bet was already placed in this window, check if price decreased >= 20%
          if (currentBetCount > 0) {
            const cashOutRes = await helpers.checkCashOutCondition(upPrice, downPrice);
            if (cashOutRes) {
              const rawDelta = currentPrice - priceToBeat;
              return {
                ...cashOutRes,
                upPrice,
                downPrice,
                priceToBeat,
                currentPrice,
                priceDelta: rawDelta.toFixed(2),
                secondsRemaining,
                countdownStr,
                marketSlug,
                balance,
              };
            }
          }

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

          if (!allowBetting) {
            const rawDelta = currentPrice - priceToBeat;
            return {
              status: 'BETTING_STOPPED',
              upPrice,
              downPrice,
              priceToBeat,
              currentPrice,
              priceDelta: rawDelta.toFixed(2),
              secondsRemaining,
              countdownStr,
              marketSlug,
              balance,
            };
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
            const rawDelta = currentPrice - priceToBeat;
            const absDelta = Math.abs(rawDelta);
            const outcomeDelta = selectedOutcome === 'YES' ? rawDelta : -rawDelta;

            // Enforce minimum price delta: do not bet if abs(Delta) < minPriceDelta (very risky)
            if (priceToBeat <= 0 || currentPrice <= 0 || absDelta < minPriceDelta) {
              return {
                status: 'DELTA_TOO_LOW',
                outcome: selectedOutcome,
                upPrice,
                downPrice,
                priceToBeat,
                currentPrice,
                priceDelta: rawDelta.toFixed(2),
                absDelta: absDelta.toFixed(2),
                outcomeDelta: outcomeDelta.toFixed(2),
                minPriceDelta,
                countdownStr,
                secondsRemaining,
                marketSlug,
                balance,
              };
            }

            const betBtns = Array.from(document.querySelectorAll('nav .border-pk-border'));
            let betBtn = betBtns.at(-1);

            if (!betBtn || betBtn.tagName !== 'BUTTON' || (betBtn as HTMLButtonElement).disabled || !String(betBtn.textContent).includes(`$${toBet}`)) {
              const matchedBtn = betBtns.find((btn) => btn.tagName === 'BUTTON' && !(btn as HTMLButtonElement).disabled && String(btn.textContent).includes(`$${toBet}`));
              betBtn = matchedBtn || betBtns.at(-2);
            }

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
                marketSlug,
                countdownStr,
                secondsRemaining,
              };
            }

            if (betBtn) {
              const now = Date.now();
              const lastBetTime = Number((window as any).lastBetTimestamp || 0);
              const elapsed = now - lastBetTime;

              // Enforce cooldown between consecutive bet clicks in the same window
              if (currentBetCount > 0 && elapsed < betCooldownMs) {
                return {
                  status: 'SCANNING_PRICES',
                  upPrice,
                  downPrice,
                  priceToBeat,
                  currentPrice,
                  priceDelta: rawDelta.toFixed(2),
                  secondsRemaining,
                  countdownStr,
                  marketSlug,
                  balance,
                  inCooldown: true,
                  betCount: currentBetCount,
                  maxBets,
                };
              }

              if (!isDryRun) {
                (betBtn as HTMLElement).click();
              }
              const newBetCount = currentBetCount + 1;
              (window as any).betCount = newBetCount;
              (window as any).lastBetTimestamp = now;
              (window as any).clickedBet = newBetCount >= maxBets;
              (window as any).betOutcome = selectedOutcome;
              const entryPrice = selectedOutcome === 'YES' ? upPrice : downPrice;
              if (!(window as any).betEntryPrice) {
                (window as any).betEntryPrice = entryPrice;
              }
              (window as any).hasCashedOut = false;
              (window as any).isCashingOut = false;

              return {
                status: 'BET_PLACED',
                betCount: newBetCount,
                maxBets,
                outcome: selectedOutcome,
                upPrice,
                downPrice,
                toBet,
                toWin,
                isValid: true,
                priceToBeat,
                currentPrice,
                priceDelta: rawDelta.toFixed(2),
                absDelta: absDelta.toFixed(2),
                outcomeDelta: outcomeDelta.toFixed(2),
                balance,
                countdownStr,
                secondsRemaining,
                marketSlug,
              };
            }
          }

          const priceDelta = (currentPrice - priceToBeat).toFixed(2);

          return {
            status: 'SCANNING_PRICES',
            betCount: currentBetCount,
            maxBets,
            upPrice,
            downPrice,
            targetPrices: targetList,
            priceToBeat,
            currentPrice,
            priceDelta,
            balance,
            countdownStr,
            secondsRemaining,
            marketSlug,
          };
        },
        {
          toBet,
          isDryRun,
          targetPrices: CONFIG.TARGET_PRICE_CENTS,
          minPriceDelta: CONFIG.MIN_PRICE_DELTA || 1.0,
          maxBetsPerWindow,
          betCooldownMs,
          allowBetting,
          cashoutDropPercent,
        }
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

  /**
   * Clicks cash out button in #content and confirms in modal dialog.
   * Selector: first #content .trading-button has text "Cash out"
   * Modal: [role=dialog] [data-slot=modal-footer] .trading-button
   */
  public async cashOut(): Promise<{ success: boolean; modalClicked: boolean; error?: string }> {
    try {
      if (this.page.isClosed()) return { success: false, modalClicked: false, error: 'Page closed' };

      const clickedCashOut = await this.page.evaluate(() => {
        const contentTradingBtns = Array.from(document.querySelectorAll('#content .trading-button'));
        let cashOutBtn = contentTradingBtns.find((b) => (b.textContent || '').trim().includes('Cash out')) as HTMLElement | undefined;
        if (!cashOutBtn) {
          cashOutBtn = Array.from(document.querySelectorAll('.trading-button')).find(
            (b) => (b.textContent || '').trim().includes('Cash out')
          ) as HTMLElement | undefined;
        }
        if (cashOutBtn) {
          cashOutBtn.click();
          return true;
        }
        return false;
      });

      if (!clickedCashOut) {
        return { success: false, modalClicked: false, error: 'Cash out button not found' };
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
      const modalClicked = await this.page.evaluate(() => {
        const modalBtns = Array.from(
          document.querySelectorAll('[role=dialog] [data-slot=modal-footer] .trading-button')
        ) as HTMLElement[];
        if (modalBtns.length > 0) {
          const target = modalBtns.find((b) => (b.textContent || '').trim().includes('Cash out')) || modalBtns[0];
          if (target) {
            target.click();
            return true;
          }
        }
        return false;
      });

      return { success: true, modalClicked };
    } catch (err: any) {
      return { success: false, modalClicked: false, error: err.message || String(err) };
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
