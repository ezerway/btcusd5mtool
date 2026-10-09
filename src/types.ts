export type BotMode = 'dry-run' | 'live';
export type BetOutcome = 'YES' | 'NO';

export interface BTCPriceTick {
  price: number;
  timestamp: number;
  source: 'binance' | 'coinbase';
}

export interface Polymarket5mMarket {
  id: string;
  conditionId?: string;
  slug: string;
  question: string;
  url: string;
  strikePrice: number;
  startTimestamp: number;
  endTimestamp: number;
  yesPrice: number;
  noPrice: number;
  active: boolean;
  closed: boolean;
  yesTokenId?: string;
  noTokenId?: string;
}

export interface TradeSignal {
  market: Polymarket5mMarket;
  recommendedOutcome: BetOutcome;
  confidence: number; // 0.0 - 1.0
  currentBtcPrice: number;
  priceDelta: number; // difference from strike price
  secondsRemaining: number;
  reason: string;
}

export interface OrderResult {
  success: boolean;
  mode: BotMode;
  marketSlug: string;
  outcome: BetOutcome;
  amountUsdc: number;
  pricePerShare: number;
  estimatedShares: number;
  timestamp: number;
  txHash?: string;
  error?: string;
}

export interface PaperPosition {
  id: string;
  marketSlug: string;
  question: string;
  outcome: BetOutcome;
  amountUsdc: number;
  entryPrice: number;
  strikePrice: number;
  entryBtcPrice: number;
  shares: number;
  entryTime: number;
  endTime: number;
  resolved: boolean;
  won?: boolean;
  payoutUsdc?: number;
  pnlUsdc?: number;
}
