import fs from 'fs';
import path from 'path';
import { LivePosition, TradeSignal } from '../types.js';
import { Logger } from '../utils/logger.js';

export interface LiveStats {
  totalTrades: number;
  wonTrades: number;
  lostTrades: number;
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
      }
    }

    const winRate = totalTrades > 0 ? (wonTrades / totalTrades) * 100 : 0;

    return {
      totalTrades,
      wonTrades,
      lostTrades,
      winRate,
      totalWagered,
      totalPayout,
      netPnL,
    };
  }

  /**
   * Records a live trade executed via DOM click and evaluates result against price to beat.
   */
  public recordLiveTrade(signal: TradeSignal, amountUsdc: number): LivePosition {
    const pricePerShare = signal.recommendedOutcome === 'YES' ? signal.market.yesPrice : signal.market.noPrice;
    const shares = amountUsdc / (pricePerShare > 0 ? pricePerShare : 1);

    const currentPrice = signal.currentBtcPrice;
    const priceToBeat = signal.market.strikePrice;
    const isAbove = currentPrice > priceToBeat;
    const won = signal.recommendedOutcome === 'YES' ? isAbove : !isAbove;

    const payoutUsdc = won ? shares * 1.0 : 0;
    const pnlUsdc = payoutUsdc - amountUsdc;

    if (won) {
      Logger.success(`🏆 Live Trade WON! Outcome: ${signal.recommendedOutcome} (Current: $${currentPrice.toFixed(2)} vs Beat: $${priceToBeat.toFixed(2)}) | Net: +$${pnlUsdc.toFixed(2)}`);
    } else {
      Logger.warn(`❌ Live Trade LOST. Outcome: ${signal.recommendedOutcome} (Current: $${currentPrice.toFixed(2)} vs Beat: $${priceToBeat.toFixed(2)}) | Loss: -$${amountUsdc.toFixed(2)}`);
    }

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
      resolved: true,
      won,
      payoutUsdc,
      pnlUsdc,
    };

    this.positions.push(pos);
    this.saveState();

    return pos;
  }
}
