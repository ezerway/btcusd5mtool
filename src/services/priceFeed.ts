import axios from 'axios';
import { BTCPriceTick } from '../types';
import { Logger } from '../utils/logger';

export class PriceFeedService {
  private static cachedPrice: BTCPriceTick | null = null;
  private static lastFetchTime: number = 0;

  public static async getBTCPrice(): Promise<BTCPriceTick> {
    const now = Date.now();
    // Cache for 2 seconds to avoid rate limits
    if (this.cachedPrice && now - this.lastFetchTime < 2000) {
      return this.cachedPrice;
    }

    try {
      // Primary: Binance API
      const res = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { timeout: 3000 });
      if (res.data && res.data.price) {
        const tick: BTCPriceTick = {
          price: parseFloat(res.data.price),
          timestamp: now,
          source: 'binance',
        };
        this.cachedPrice = tick;
        this.lastFetchTime = now;
        return tick;
      }
    } catch (binanceErr) {
      // Fallback: Coinbase API
      try {
        const res = await axios.get('https://api.coinbase.com/v2/prices/BTC-USD/spot', { timeout: 3000 });
        if (res.data && res.data.data && res.data.data.amount) {
          const tick: BTCPriceTick = {
            price: parseFloat(res.data.data.amount),
            timestamp: now,
            source: 'coinbase',
          };
          this.cachedPrice = tick;
          this.lastFetchTime = now;
          return tick;
        }
      } catch (cbErr) {
        Logger.error('Failed to fetch BTC price from both Binance and Coinbase', cbErr);
      }
    }

    if (this.cachedPrice) {
      return this.cachedPrice;
    }
    throw new Error('Unable to retrieve current BTC spot price');
  }
}
