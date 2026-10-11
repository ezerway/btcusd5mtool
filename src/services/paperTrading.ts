import fs from 'fs';
import path from 'path';
import { PaperPosition, TradeSignal, OrderResult } from '../types';
import { CONFIG } from '../config';
import { Logger } from '../utils/logger';

export class PaperTradingService {
  private balanceUsdc: number;
  private initialBalanceUsdc: number;
  private positions: PaperPosition[] = [];
  private filePath: string;

  constructor() {
    this.initialBalanceUsdc = CONFIG.INITIAL_PAPER_BALANCE;
    this.balanceUsdc = this.initialBalanceUsdc;
    this.filePath = path.join(process.cwd(), 'paper_trading_ledger.json');
    this.loadState();
  }

  private loadState(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        this.balanceUsdc = data.balanceUsdc ?? this.initialBalanceUsdc;
        this.initialBalanceUsdc = data.initialBalanceUsdc ?? this.initialBalanceUsdc;
        this.positions = data.positions || [];
      } catch (err) {
        Logger.warn('Could not parse paper trading ledger, using default state.');
      }
    }
  }

  private saveState(): void {
    try {
      const data = {
        balanceUsdc: this.balanceUsdc,
        initialBalanceUsdc: this.initialBalanceUsdc,
        updatedAt: new Date().toISOString(),
        positions: this.positions,
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      Logger.error('Failed to save paper trading ledger state', err);
    }
  }

  public getBalance(): number {
    return this.balanceUsdc;
  }

  public getInitialBalance(): number {
    return this.initialBalanceUsdc;
  }

  public getPositions(): PaperPosition[] {
    return this.positions;
  }

  public executePaperTrade(signal: TradeSignal, amountUsdc: number): OrderResult {
    if (this.balanceUsdc < amountUsdc) {
      return {
        success: false,
        mode: 'dry-run',
        marketSlug: signal.market.slug,
        outcome: signal.recommendedOutcome,
        amountUsdc,
        pricePerShare: 0,
        estimatedShares: 0,
        timestamp: Date.now(),
        error: `Insufficient paper balance ($${this.balanceUsdc.toFixed(2)} available, $${amountUsdc} needed)`,
      };
    }

    const pricePerShare = signal.recommendedOutcome === 'YES' ? signal.market.yesPrice : signal.market.noPrice;
    const shares = amountUsdc / pricePerShare;

    // Deduct cost from virtual balance
    this.balanceUsdc -= amountUsdc;

    const pos: PaperPosition = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      marketSlug: signal.market.slug,
      question: signal.market.question,
      outcome: signal.recommendedOutcome,
      amountUsdc,
      entryPrice: pricePerShare,
      strikePrice: signal.market.strikePrice,
      entryBtcPrice: signal.currentBtcPrice,
      shares,
      entryTime: Date.now(),
      endTime: signal.market.endTimestamp,
      resolved: false,
    };

    this.positions.push(pos);
    this.saveState();

    return {
      success: true,
      mode: 'dry-run',
      marketSlug: signal.market.slug,
      outcome: signal.recommendedOutcome,
      amountUsdc,
      pricePerShare,
      estimatedShares: shares,
      timestamp: Date.now(),
    };
  }

  /**
   * Resolves open paper positions before transitioning to next live market round.
   */
  public resolvePositions(currentBtcPrice?: number, strikePrice?: number): boolean {
    let updated = false;

    for (const pos of this.positions) {
      if (!pos.resolved) {
        const finalStrike = strikePrice && strikePrice > 0 ? strikePrice : pos.strikePrice;
        const finalCurrent = currentBtcPrice && currentBtcPrice > 0 ? currentBtcPrice : pos.entryBtcPrice;

        const isAbove = finalCurrent > finalStrike;
        const won = pos.outcome === 'YES' ? isAbove : !isAbove;

        pos.resolved = true;
        pos.won = won;

        if (won) {
          pos.payoutUsdc = pos.shares * 1.0;
          pos.pnlUsdc = pos.payoutUsdc - pos.amountUsdc;
          this.balanceUsdc += pos.payoutUsdc;
          Logger.success(`🏆 Paper Trade WON! Outcome: ${pos.outcome} (Final: $${finalCurrent.toFixed(2)} vs Beat: $${finalStrike.toFixed(2)}) | PnL: +$${pos.pnlUsdc.toFixed(2)}`);
        } else {
          pos.payoutUsdc = 0;
          pos.pnlUsdc = -pos.amountUsdc;
          Logger.warn(`❌ Paper Trade LOST. Outcome: ${pos.outcome} (Final: $${finalCurrent.toFixed(2)} vs Beat: $${finalStrike.toFixed(2)}) | Loss: -$${pos.amountUsdc.toFixed(2)}`);
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
