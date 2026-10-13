# Polymarket BTC 5M Pure DOM Automated Betting Bot (`btcusd5mtool`)

A high-performance automated betting bot for **Polymarket Bitcoin 5-Minute (BTC 5m)** prediction markets, powered by **100% Pure Playwright DOM Automation** with zero external API dependencies, an asynchronous SQLite database, and a real-time web analytics dashboard.

---

## ⚡ Core Architecture & Features

- **🚫 0 External API Calls**: Operates completely through in-page DOM parsing and button interaction via Playwright — no reliance on Polymarket Gamma APIs or external price oracles.
- **⚡ 500ms Pure DOM Sniper Loop**: Evaluates `Price To Beat`, `Current Price`, `Delta`, `Up/Down` prices, and expiry countdown in real-time.
- **🎯 Multiple Bets Per Window**: Configurable multi-bet execution (`MAX_BETS_PER_WINDOW`) with intelligent cooldown timing (`BET_COOLDOWN_MS`) between consecutive clicks in the same 5-minute round.
- **🛡️ Delta Risk Protection**: Enforces a minimum safety price delta (`MIN_PRICE_DELTA`, e.g. `$1.00`). If `|Delta| < threshold`, trades are skipped to avoid volatile flips near strike.
- **🎯 Flexible Target Price Ranges**: Supports single values, lists, and ranges in `TARGET_PRICE_CENTS` (e.g. `98`, `97,98`, or `95-98`).
- **📊 Continuous Scan Tracking & Post-Mortem Analysis**: Continues logging price ticks even after bets are placed until round conclusion. For **lost trades**, captures the entire 5-minute window scan trajectory to inspect in the web UI. Winning trades omit scan storage to keep SQLite storage lightweight.
- **💾 Non-Blocking SQLite Engine (`data/bot.db`)**: Built on `node:sqlite` with WAL mode, in-memory tick buffering, prepared statement reuse, and asynchronous transaction batching — guaranteeing 0ms latency impact on the bot loop.
- **📈 Modern Web Analytics Dashboard (`/web`)**: Real-time dark-theme UI built with React 19, Tailwind CSS v4, and TradingView Lightweight Charts for tracking live stream prices, PnL equity curve, trade history, and interactive window scan replay.
- **📱 Mobile 1-Tap Mode**: Emulates an iPhone viewport (`IS_MOBILE=true`) to leverage Polymarket's streamlined 1-tap betting interface.
- **🔒 Persistent Browser Session**: Keeps browser profile cached in `user_data/` so wallet authentication persists across restarts without profile locking.
- **🔔 Slack Balance Notifications**: Automatically reports current account balance every hour via incoming webhook.

---

## 📁 Project Structure

```
btcusd5mtool/
├── .env                         # Active bot configuration
├── .env.example                 # Configuration template
├── package.json                 # Dependencies & CLI scripts
├── tsconfig.json                # Node/TypeScript configuration
├── data/
│   └── bot.db                   # SQLite database (positions, price_ticks, bot_state)
├── user_data/                   # Persistent Chromium profile (wallet login & session)
├── web/                         # React + Vite + Tailwind CSS Web Dashboard
│   ├── src/
│   │   ├── components/          # Dashboard components (Chart, Stats, TradesTable, Modal)
│   │   ├── App.tsx              # Main dashboard view
│   │   └── types.ts             # Web UI types
│   └── package.json             # Web UI dependencies
└── src/
    ├── index.ts                 # CLI entry point (Commander)
    ├── config.ts                # Configuration parser & DOM selector constants
    ├── types.ts                 # Core TypeScript types & data contracts
    ├── automation/
    │   ├── browserManager.ts    # Persistent Playwright browser manager
    │   ├── polymarketPage.ts    # In-page DOM sniper evaluator & navigation
    │   └── walletHelper.ts      # Interactive login session helper
    ├── db/
    │   └── database.ts          # Non-blocking SQLite service with in-memory buffering
    ├── engine/
    │   └── botEngine.ts         # Main 500ms DOM sniper execution loop
    ├── server/
    │   └── apiServer.ts         # Express REST API & SSE live streaming server
    ├── services/
    │   ├── liveTrading.ts       # Live trade tracker & PnL resolution
    │   ├── marketResolver.ts    # Market hub & slug navigation resolver
    │   ├── paperTrading.ts      # Dry-run trade simulator
    │   └── slackService.ts      # Slack webhook reporter
    └── utils/
        └── logger.ts            # Formatted terminal tables & banner output
```

---

## 🚀 Quick Start

### 1. Installation

```bash
# Install root dependencies
pnpm install

# Install Playwright browser binary
pnpm exec playwright install chromium

# Install web dashboard dependencies & build frontend bundle
npm --prefix web install
npm run web:build
```

### 2. Wallet Login Setup (Required once for Live Mode)

```bash
pnpm run login
```

- Opens Chromium in Mobile 1-Tap mode.
- Log into Polymarket with your wallet.
- Once logged in, press **ENTER** in your terminal. Session cookies and wallet state will be saved to `./user_data`.

### 3. Running the Bot

#### Paper Trading (Dry-Run Mode)
```bash
# Terminal CLI only:
pnpm run bot:dry

# Concurrently run bot + Web Dashboard:
pnpm run bot:dry:web
```

#### Live Betting Mode ⚠️
```bash
# Terminal CLI only:
pnpm run bot:live

# Concurrently run bot + Web Dashboard:
pnpm run bot:live:web
```

### 4. Running the Web Dashboard Standalone

To inspect trades, analytics, and live ticks without starting the bot:
```bash
pnpm run server
```
Open **`http://localhost:3100`** in your browser.

---

## ⚙️ Configuration (`.env`)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MODE` | `dry-run` | Execution mode: `dry-run` (paper trading) or `live` (real USDC bets). |
| `BET_AMOUNT_USDC` | `50` | Size of each bet in USDC. |
| `MAX_BETS_PER_WINDOW` | `1` | Maximum number of bet clicks allowed per 5m round (e.g. `1`, `2`, `3`). |
| `BET_COOLDOWN_MS` | `2500` | Minimum delay (in ms) between consecutive bet clicks in the same round. |
| `TARGET_PRICE_CENTS` | `98,99` | Target outcome prices to snipe. Accepts single (`98`), comma-separated (`97,98`), or ranges (`95-98`). |
| `MIN_PRICE_DELTA` | `1.0` | Minimum `\|CurrentPrice - PriceToBeat\|` in USD. Skips trade if delta is smaller than this threshold. |
| `IS_MOBILE` | `true` | Emulates iPhone viewport to activate Polymarket's 1-Tap trading button layout. |
| `HEADLESS` | `false` | Run browser in headless mode (`false` recommended to monitor UI). |
| `USER_DATA_DIR` | `./user_data`| Path to directory preserving browser session cookies and auth. |
| `SLACK_WEBHOOK_URL`| `""` | Incoming webhook URL for hourly balance notifications. |
| `PORT` | `3100` | Port for the SQLite API & Web Dashboard server. |

---

## 🌐 Web Dashboard & API Endpoints

When running `pnpm run server` or with `--web`, the Express backend serves both the React application and JSON API endpoints:

- **`GET /api/status`**: Current bot running state, last price tick, win/loss stats, and active config.
- **`GET /api/stream`**: Server-Sent Events (SSE) live updates every 1000ms.
- **`GET /api/stats?mode=live|dry-run|all&startDate=...&endDate=...`**: Aggregate stats (total trades, win rate %, total wagered, net PnL) optionally filtered by date range.
- **`GET /api/positions?mode=live|dry-run&limit=100&offset=0&startDate=...&endDate=...`**: Paginated trade history with optional date filtering.
- **`GET /api/positions/:id/window-scans`**: Detailed price trajectory ticks captured during the window of a lost trade.
- **`GET /api/pnl-history?mode=live|dry-run&startDate=...&endDate=...`**: Chronological cumulative PnL series for TradingView charts.
- **`GET /api/ticks?limit=300`**: Recent price ticks recorded from the DOM.
- **`POST /api/reset-db`**: Purge SQLite database positions and price ticks (supports `mode: 'all' | 'live' | 'dry-run'` and `clearTicks: boolean`).
- **`GET /api/health`**: Healthcheck endpoint.

---

## 🛠️ CLI Commands Reference

```bash
# Launch trading bot
pnpm run bot:dry             # Paper trading (dry-run)
pnpm run bot:live            # Live real-money trading
pnpm run bot:dry:web         # Dry-run + Web Dashboard on port 3100
pnpm run bot:live:web        # Live + Web Dashboard on port 3100

# Web Dashboard
pnpm run server              # Start API & web UI on http://localhost:3100
pnpm run web:dev             # Vite dev server for web UI development
pnpm run web:build           # Build production web UI bundle to web/dist/

# Utilities
pnpm run login               # Save Polymarket wallet login session to user_data/
pnpm run history             # View CLI summary table of all live trades
pnpm run paper               # View CLI summary table of all paper trades
pnpm run slack:test          # Send a test balance report to Slack
```

---

## 📜 License

ISC
