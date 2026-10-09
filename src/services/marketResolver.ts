import { Polymarket5mMarket } from '../types.js';
import { CONFIG } from '../config.js';

export class MarketResolverService {
  public static CRYPTO_5M_HUB_URL = 'https://polymarket.com/crypto/5M';

  /**
   * Pure DOM Resolver - Returns active market target base URL.
   * No external Gamma API calls used.
   */
  public static getTargetHubUrl(): string {
    return this.CRYPTO_5M_HUB_URL;
  }

  /**
   * Helper to parse strike price from DOM text strings if needed.
   */
  public static extractStrikePrice(text: string): number | null {
    if (!text) return null;
    const match =
      text.match(/above\s+\$?([0-9,]+(?:\.[0-9]+)?)/i) ||
      text.match(/higher\s+than\s+\$?([0-9,]+(?:\.[0-9]+)?)/i) ||
      text.match(/\$?([0-9]{2,3},[0-9]{3}(?:\.[0-9]+)?)/);

    if (match && match[1]) {
      const cleanStr = match[1].replace(/,/g, '');
      const price = parseFloat(cleanStr);
      if (!isNaN(price) && price > 1000) {
        return price;
      }
    }
    return null;
  }
}
