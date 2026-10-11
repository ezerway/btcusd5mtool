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

    // Check current price vs price to beat to evaluate if won upon bet placement
    const currentPrice = signal.currentBtcPrice;
    const priceToBeat = signal.market.strikePrice;
    const isAbove = currentPrice > priceToBeat;
    const won = signal.recommendedOutcome === 'YES' ? isAbove : !isAbove;

    const payoutUsdc = won ? shares * 1.0 : 0;
    const pnlUsdc = payoutUsdc - amountUsdc;

    if (won) {
      this.balanceUsdc += payoutUsdc;
      Logger.success(`🏆 Paper Trade WON! Outcome: ${signal.recommendedOutcome} (Current: $${currentPrice.toFixed(2)} vs Beat: $${priceToBeat.toFixed(2)}) | PnL: +$${pnlUsdc.toFixed(2)}`);
    } else {
      Logger.warn(`❌ Paper Trade LOST. Outcome: ${signal.recommendedOutcome} (Current: $${currentPrice.toFixed(2)} vs Beat: $${priceToBeat.toFixed(2)}) | Loss: -$${amountUsdc.toFixed(2)}`);
    }

    const pos: PaperPosition = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
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
   * Resolves open paper positions against current BTC price once market expiration time has passed.
   */
  public resolvePositions(currentBtcPrice: number): void {
    let updated = false;

    for (const pos of this.positions) {
      if (!pos.resolved) {
        const isAbove = currentBtcPrice > pos.strikePrice;
        const won = pos.outcome === 'YES' ? isAbove : !isAbove;

        pos.resolved = true;
        pos.won = won;

        if (won) {
          // Payout: $1.00 USD per winning share
          pos.payoutUsdc = pos.shares * 1.0;
          pos.pnlUsdc = pos.payoutUsdc - pos.amountUsdc;
          this.balanceUsdc += pos.payoutUsdc;
          Logger.success(`🏆 Paper Trade WON! Market: ${pos.marketSlug} | PnL: +$${pos.pnlUsdc.toFixed(2)}`);
        } else {
          pos.payoutUsdc = 0;
          pos.pnlUsdc = -pos.amountUsdc;
          Logger.warn(`❌ Paper Trade LOST. Market: ${pos.marketSlug} | Loss: -$${pos.amountUsdc.toFixed(2)}`);
        }

        updated = true;
      }
    }

    if (updated) {
      this.saveState();
    }
  }
}
