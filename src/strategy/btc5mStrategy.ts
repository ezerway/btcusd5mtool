import { Polymarket5mMarket, TradeSignal, BetOutcome } from '../types';
import { CONFIG } from '../config';

export class BTC5mStrategyEngine {
  /**
   * Evaluates current spot price against 5m market strike price.
   */
  public static evaluateMarket(market: Polymarket5mMarket, currentBtcPrice: number): TradeSignal | null {
    if (!market || !market.strikePrice || market.closed) {
      return null;
    }

    const now = Date.now();
    const secondsRemaining = Math.floor((market.endTimestamp - now) / 1000);

    // Check time window
    if (secondsRemaining < CONFIG.MIN_SECONDS_BEFORE_EXPIRY || secondsRemaining > CONFIG.MAX_SECONDS_BEFORE_EXPIRY) {
      return null;
    }

    const priceDelta = currentBtcPrice - market.strikePrice;
    const absDelta = Math.abs(priceDelta);

    if (absDelta < CONFIG.PRICE_DELTA_THRESHOLD_USD) {
      return null; // Not enough price separation to enter trade safely
    }

    const recommendedOutcome: BetOutcome = priceDelta > 0 ? 'YES' : 'NO';

    // Calculate confidence factor:
    // 1. Larger delta = higher confidence
    // 2. Closer to expiry = higher confidence (less time for reversal)
    const deltaFactor = Math.min(absDelta / (CONFIG.PRICE_DELTA_THRESHOLD_USD * 3), 1.0);
    const timeFactor = Math.min((CONFIG.MAX_SECONDS_BEFORE_EXPIRY - secondsRemaining) / CONFIG.MAX_SECONDS_BEFORE_EXPIRY, 1.0);
    const confidence = Math.min(0.55 + deltaFactor * 0.25 + timeFactor * 0.2, 0.95);

    if (confidence < CONFIG.MIN_CONFIDENCE) {
      return null;
    }

    const reason = `BTC Spot ($${currentBtcPrice.toFixed(2)}) is ${priceDelta >= 0 ? 'ABOVE' : 'BELOW'} strike ($${market.strikePrice.toFixed(2)}) by $${absDelta.toFixed(2)} with ${secondsRemaining}s to expiry.`;

    return {
      market,
      recommendedOutcome,
      confidence,
      currentBtcPrice,
      priceDelta,
      secondsRemaining,
      reason,
    };
  }
}
