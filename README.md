# Polymarket BTC 5M Pure DOM Automated Betting Bot (`btcusd5mtool`)

A high-performance automated betting bot for **Polymarket Bitcoin 5-Minute (BTC 5m)** prediction markets, powered by **100% Pure Playwright DOM Automation** with zero external API calls.

---

## ⚡ Pure DOM Architecture Features

- **🚫 0 External API Calls**: Does not rely on Gamma API endpoints or external price tick requests.
- **⚡ In-Page DOM Sniper Engine**: Runs the exact JavaScript snippet inside the browser page DOM every 500ms (`page.evaluate`).
- **🎯 Live Market Switcher**: Automatically detects and clicks `#content [aria-label="Go to live market"]` to track live 5m markets.
- **📱 Mobile 1-Tap Mode**: Emulates iPhone touch viewport (`IS_MOBILE=true`) for 1-tap Polymarket layout navigation.
- **🛡️ Dry-Run / Paper Trading Mode**: Test strategies and track virtual PnL with $1,000 USDC paper balance.
- **🔒 Persistent Browser Session**: Keeps a single browser session open to avoid profile locking (`user_data/`).

---

## 📁 Project Structure

```
btcusd5mtool/
├── .env                    # Active configuration file
├── .env.example            # Environment template
├── package.json            # Dependencies & pnpm scripts
├── tsconfig.json           # TypeScript configuration
├── paper_trading_ledger.json # Persisted paper trading history & PnL ledger
├── user_data/              # Persistent Chromium browser context (cookies & wallet auth)
└── src/
    ├── index.ts            # CLI command entry point
    ├── config.ts           # Central configuration settings & selectors
    ├── types.ts            # TypeScript interfaces & types
    ├── automation/
    │   ├── browserManager.ts # Persistent Playwright browser manager
    │   ├── polymarketPage.ts # Pure DOM snippet evaluator & page navigation
    │   └── walletHelper.ts   # Interactive browser setup session for wallet login
    ├── engine/
    │   └── botEngine.ts      # 500ms pure DOM loop orchestrator
    ├── services/
    │   ├── marketResolver.ts # Target page URL provider
    │   └── paperTrading.ts   # Paper trading simulator & PnL tracker
    └── utils/
        └── logger.ts         # Terminal logger & dashboard display formatter
```

---

## 🚀 Quick Start

### 1. Installation

```bash
pnpm install
pnpm exec playwright install chromium
```

### 2. Wallet Setup (One-time setup for Live Mode)

```bash
pnpm run login
```

- Opens browser window in Mobile 1-Tap mode.
- Log into Polymarket and press **ENTER** in your terminal when done. Session saved to `./user_data`.

### 3. Run Paper Trading (Dry-Run Mode)

```bash
pnpm run bot:dry
```

### 4. Check Paper Trading Performance & History

```bash
pnpm run paper
```

### 5. Run Live Betting Mode ⚠️

```bash
pnpm run bot:live
```

---

## ⚙️ Configuration (`.env`)

```env
# Trading Mode: 'dry-run' or 'live'
MODE=dry-run

# Bet size in USDC per trade
BET_AMOUNT_USDC=100.0

# Mobile 1-Tap mode layout
IS_MOBILE=true

# Sniper target price in cents (e.g. 97 = 97¢)
TARGET_PRICE_CENTS=97

# Playwright Browser Options
HEADLESS=false
USER_DATA_DIR=./user_data
```

---

## 📜 License

ISC
