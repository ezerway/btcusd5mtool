import fs from 'fs';
import path from 'path';
import { LivePosition, TradeSignal, WindowPriceScanTick } from '../types.js';
import { Logger } from '../utils/logger.js';
import { DatabaseService } from '../db/database.js';

export interface LiveStats {
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
  openTrades: number;
  winRate: number;
  totalWagered: number;
  totalPayout: number;
  netPnL: number;
}

export class LiveTradingService {
  private positions: LivePosition[] = [];
  private filePath: string;

  constructor() {
    this.filePath = path.join(process.cwd(), 'live_trading_ledger.json');
    this.loadState();
  }

  private loadState(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.positions = data.positions || [];
      } catch (err) {
        Logger.warn('Could not parse live trading ledger, using empty state.');
      }
    }
  }

  private saveState(): void {
    try {
      const stats = this.getStats();
      const data = {
        updatedAt: new Date().toISOString(),
        stats,
        positions: this.positions,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      Logger.error('Failed to save live trading ledger state', err);
    }
  }

  public getPositions(): LivePosition[] {
    return this.positions;
  }

  public getStats(): LiveStats {
    const totalTrades = this.positions.length;
    let wonTrades = 0;
    let lostTrades = 0;
    let openTrades = 0;
    let totalWagered = 0;
    let totalPayout = 0;
    let netPnL = 0;

    for (const pos of this.positions) {
      totalWagered += pos.amountUsdc;
      if (pos.resolved) {
        if (pos.won) {
          wonTrades++;
        } else {
          lostTrades++;
        }
        totalPayout += pos.payoutUsdc || 0;
        netPnL += pos.pnlUsdc || 0;
      } else {
        openTrades++;
      }
    }

    const resolvedTrades = wonTrades + lostTrades;
    const winRate = resolvedTrades > 0 ? (wonTrades / resolvedTrades) * 100 : 0;

    return {
      totalTrades,
      wonTrades,
      lostTrades,
      openTrades,
      winRate,
      totalWagered,
      totalPayout,
      netPnL,
    };
  }

  /**
   * Records a live trade executed via DOM click as open.
   */
  public recordLiveTrade(signal: TradeSignal, amountUsdc: number): LivePosition {
    const pricePerShare = signal.recommendedOutcome === 'YES' ? signal.market.yesPrice : signal.market.noPrice;
    const shares = amountUsdc / (pricePerShare > 0 ? pricePerShare : 1);

    const currentPrice = signal.currentBtcPrice;
    const priceToBeat = signal.market.strikePrice;

    const pos: LivePosition = {
      id: `live_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      marketSlug: signal.market.slug,
      question: signal.market.question,
      outcome: signal.recommendedOutcome,
      amountUsdc,
      entryPrice: pricePerShare,
      strikePrice: priceToBeat,
      entryBtcPrice: currentPrice,
      shares,
      entryTime: Date.now(),
      endTime: signal.market.endTimestamp,
      resolved: false,
      secondsRemaining: signal.secondsRemaining,
      remainingTime: signal.remainingTime,
    };

    this.positions.push(pos);
    this.saveState();
    DatabaseService.getInstance().recordPosition(pos, 'live');

    return pos;
  }

  /**
   * Cashes out any open live positions when stop-loss/cashout is triggered.
   */
  public cashOutPositions(exitPriceCents: number): boolean {
    let updated = false;
    const exitPriceRatio = (exitPriceCents || 0) / 100;

    for (const pos of this.positions) {
      if (!pos.resolved) {
        pos.resolved = true;
        pos.won = false;
        pos.cashedOut = true;
        pos.payoutUsdc = pos.shares * exitPriceRatio;
        pos.pnlUsdc = pos.payoutUsdc - pos.amountUsdc;
        DatabaseService.getInstance().resolvePosition(pos.id, false, pos.payoutUsdc, pos.pnlUsdc, undefined, true);
        Logger.warn(
          `💸 Live Trade CASHED OUT! Outcome: ${pos.outcome} | Entry: ${(pos.entryPrice * 100).toFixed(0)}¢ -> Exit: ${exitPriceCents}¢ | PnL: -$${Math.abs(pos.pnlUsdc).toFixed(2)}`
        );
        updated = true;
      }
    }

    if (updated) {
      this.saveState();
    }

    return updated;
  }

  /**
   * Resolves open live positions before transitioning to next live market round.
   */
  public resolvePositions(
    currentBtcPrice?: number,
    strikePrice?: number,
    windowScans?: WindowPriceScanTick[]
  ): boolean {
    let updated = false;

    for (const pos of this.positions) {
      if (!pos.resolved) {
        const finalStrike = strikePrice && strikePrice > 0 ? strikePrice : pos.strikePrice;
        const finalCurrent = currentBtcPrice && currentBtcPrice > 0 ? currentBtcPrice : pos.entryBtcPrice;

        const isAbove = finalCurrent > finalStrike;
        const won = pos.outcome === 'YES' ? isAbove : !isAbove;

        pos.resolved = true;
        pos.won = won;
        pos.payoutUsdc = won ? pos.shares * 1.0 : 0;
        pos.pnlUsdc = pos.payoutUsdc - pos.amountUsdc;

        if (won) {
          pos.windowScans = undefined;
          DatabaseService.getInstance().resolvePosition(pos.id, won, pos.payoutUsdc, pos.pnlUsdc, undefined);
          Logger.success(
            `🏆 Live Trade WON! Outcome: ${pos.outcome} (Final: $${finalCurrent.toFixed(2)} vs Beat: $${finalStrike.toFixed(2)}) | Net: +$${pos.pnlUsdc.toFixed(2)}`
          );
        } else {
          pos.windowScans = windowScans;
          DatabaseService.getInstance().resolvePosition(pos.id, won, pos.payoutUsdc, pos.pnlUsdc, windowScans);
          Logger.warn(
            `❌ Live Trade LOST. Outcome: ${pos.outcome} (Final: $${finalCurrent.toFixed(2)} vs Beat: $${finalStrike.toFixed(2)}) | Loss: -$${pos.amountUsdc.toFixed(2)} | Window scans captured: ${windowScans?.length || 0} ticks`
          );
        }

        updated = true;
      }
    }

    if (updated) {
      this.saveState();
    }

    return updated;
  }
}
