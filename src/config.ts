import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  MODE: (process.env.MODE || 'dry-run') as 'dry-run' | 'live',
  BET_AMOUNT_USDC: parseFloat(process.env.BET_AMOUNT_USDC || '100.0'),
  MAX_BET_USDC: parseFloat(process.env.MAX_BET_USDC || '200.0'),
  MAX_DAILY_LOSS_USDC: parseFloat(process.env.MAX_DAILY_LOSS_USDC || '500.0'),
  INITIAL_PAPER_BALANCE: parseFloat(process.env.INITIAL_PAPER_BALANCE || '1000.0'),

  HEADLESS: process.env.HEADLESS === 'true',
  IS_MOBILE: process.env.IS_MOBILE !== 'false', // Enabled by default for mobile 1-tap mode
  USER_DATA_DIR: process.env.USER_DATA_DIR || path.join(process.cwd(), 'user_data'),

  // Strategy parameters
  TARGET_PRICE_CENTS: parseInt(process.env.TARGET_PRICE_CENTS || '97', 10),
  MIN_SECONDS_BEFORE_EXPIRY: parseInt(process.env.MIN_SECONDS_BEFORE_EXPIRY || '25', 10),
  MAX_SECONDS_BEFORE_EXPIRY: parseInt(process.env.MAX_SECONDS_BEFORE_EXPIRY || '240', 10),
  PRICE_DELTA_THRESHOLD_USD: parseFloat(process.env.PRICE_DELTA_THRESHOLD_USD || '10.0'),
  MIN_CONFIDENCE: parseFloat(process.env.MIN_CONFIDENCE || '0.65'),

  POLYMARKET_BASE_URL: 'https://polymarket.com',
  POLYMARKET_GAMMA_API: 'https://gamma-api.polymarket.com',

  // Selectors matching mobile 1-tap & custom Polymarket 5m DOM layout
  SELECTORS: {
    LIVE_MARKET_BTN: '#content [aria-label="Go to live market"]',
    TRADING_BUTTON_TEXT: '.trading-button-text',
    BET_PRESET_BUTTONS: 'nav .border-pk-border',
    YES_BUTTON: 'button:has-text("Yes"), [data-testid="outcome-yes"], button:has-text("Up")',
    NO_BUTTON: 'button:has-text("No"), [data-testid="outcome-no"], button:has-text("Down")',
    AMOUNT_INPUT: 'input[placeholder="0"], input[type="number"], input[name="amount"]',
    BUY_BUTTON: 'button:has-text("Buy"), button:has-text("Place Order"), button:has-text("Submit Order")',
    CONFIRM_BUTTON: 'button:has-text("Confirm"), button:has-text("Approve")',
    CONNECT_WALLET: 'button:has-text("Connect Wallet"), button:has-text("Log In")',
    ORDER_SUCCESS_TOAST: '.toast-success, [data-testid="order-success"], :text("Order placed")',
  }
};
