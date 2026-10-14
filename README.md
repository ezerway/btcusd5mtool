# Polymarket BTC 5M Pure DOM Automated Betting Bot (`btcusd5mtool`)

A high-performance automated betting bot for **Polymarket Bitcoin 5-Minute (BTC 5m)** prediction markets, powered by **100% Pure Playwright DOM Automation** with zero external API dependencies, an asynchronous SQLite database, and a real-time responsive web analytics dashboard.

---

## ⚡ Core Architecture & Features

- **🚫 0 External API Calls**: Operates completely through in-page DOM parsing and button interaction via Playwright — no reliance on Polymarket Gamma APIs or external price oracles.
- **⚡ 500ms Pure DOM Sniper Loop**: Evaluates `Price To Beat`, `Current Price`, `Delta`, `Up/Down` prices, and expiry countdown in real-time.
- **💸 Automated Stop-Loss / Cash Out (≥ 20% Price Drop)**:
  - After a bet is placed, continuously tracks the active position's outcome price (`Up` or `Down`) against its initial `entryPrice`.
  - If the outcome price drops by **20% or more** from entry (e.g., entered `Up` at 100¢ and price falls to ≤ 80¢, or entered at 80¢ and price falls to ≤ 64¢), the bot immediately triggers an emergency Cash Out.
  - **In-Page DOM Automation**: Automatically locates and clicks the `#content .trading-button` matching "Cash out", waits for the confirmation modal (`[role=dialog] [data-slot=modal-footer] .trading-button`), and confirms the exit.
  - **Live & Paper Support**: Executes actual on-chain/in-page cashouts in Live mode and calculates simulated market-price exits in Dry-Run mode to prevent catastrophic total losses.
- **🛑 Bot Bet Toggle & Balance Circuit Breaker**: Pause and resume automated betting at any time directly from the web UI (or via API) while keeping the scanner active. Automatically halts betting if account balance drops to or below `STOP_AT_BALANCE`.
- **🎯 Multiple Bets Per Window**: Configurable multi-bet execution (`MAX_BETS_PER_WINDOW`) with intelligent cooldown timing (`BET_COOLDOWN_MS`) between consecutive clicks in the same 5-minute round.
- **🛡️ Delta Risk Protection**: Enforces a minimum safety price delta (`MIN_PRICE_DELTA`, e.g. `$1.00`). If `|Delta| < threshold`, trades are skipped to avoid volatile flips near strike.
- **🎯 Flexible Target Price Ranges**: Supports single values, lists, and ranges in `TARGET_PRICE_CENTS` (e.g. `98`, `97,98`, or `95-98`).
- **📊 Continuous Scan Tracking & Post-Mortem Analysis**: Continues logging price ticks even after bets are placed until round conclusion. For **lost trades**, captures the entire 5-minute window scan trajectory to inspect in the web UI. Winning trades omit scan storage to keep SQLite storage lightweight.
- **💾 24/7 High-Performance SQLite Engine (`data/bot.db`)**: Built on `node:sqlite` with WAL mode, in-memory tick buffering, composite B-Tree indexes, and automated hourly maintenance (expired tick pruning, old window scans cleanup, WAL truncation, and query planner optimization).
- **📈 Modern Web Analytics Dashboard (`/web`)**:
  - Real-time dark-theme UI built with React 19, Tailwind CSS v4, and TradingView Lightweight Charts.
  - **Live Spot vs Strike Stream Chart**: High-precision diff spread baseline centered around `$0.00`, current round zoom, and realtime micro-spread HUD readout.
  - **Cumulative PnL Equity Curve**: Real-time visual tracking of profitability over time.
  - **Date Filters**: Filter historical stats, trades, and PnL curves by presets (**All**, **Today**, **Yesterday**, **7D**, **30D**) or **Custom** calendar ranges.
  - **Interactive Window Scan Replay**: Full post-mortem trajectory review for lost rounds.
  - **Database Management**: Interactive Reset DB modal with granular mode selection and tick purging.
- **📱 Responsive Desktop & Mobile Design**: Optimized layout across mobile phones, tablets, and wide monitors with compact touch targets and scrollable audit modals.
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
│   │   ├── components/          # Dashboard components (Charts, Stats, Table, Modals)
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
    │   └── database.ts          # Non-blocking SQLite service with auto-maintenance
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
pnpm -C web install
pnpm run web:build
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

> **Tip:** When running with `:web`, the terminal will display a clickable web dashboard link (`http://localhost:3100`).

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
| `CASHOUT_DROP_PERCENT` | `20.0` | Emergency stop-loss threshold: triggers in-page cash out if outcome drops by this percentage from entry. |
| `STOP_AT_BALANCE` | `0` | Automatically stops bot bets when account balance drops to or below this USDC threshold (0 to disable). |
| `TICKS_RETENTION_HOURS` | `24` | Hours of raw DOM price ticks to retain in SQLite before automated pruning. |
| `LOST_SCANS_RETENTION_DAYS` | `14` | Days of heavy window scan trajectories on lost trades before clearing JSON blobs. |
| `HEADLESS` | `false` | Run browser in headless mode (`false` recommended to monitor UI). |
| `USER_DATA_DIR` | `./user_data`| Path to directory preserving browser session cookies and auth. |
| `SLACK_WEBHOOK_URL`| `""` | Incoming webhook URL for hourly balance notifications. |
| `PORT` | `3100` | Port for the SQLite API & Web Dashboard server. |

---

## 🌐 Web Dashboard & API Endpoints

When running `pnpm run server` or with `--web`, the Express backend serves both the React application and JSON API endpoints:

- **`GET /api/status`**: Current bot running state, last price tick, win/loss stats, betting active state, and active config.
- **`GET /api/stream`**: Server-Sent Events (SSE) live updates every 1000ms.
- **`POST /api/bot/bet-control`**: Toggle automated betting on/off (`{ enabled: boolean, stopAtBalance?: number }`).
- **`GET /api/stats?mode=live|dry-run|all&startDate=...&endDate=...`**: Aggregate stats (total trades, win rate %, total wagered, net PnL) optionally filtered by date range.
- **`GET /api/positions?mode=live|dry-run&limit=100&offset=0&startDate=...&endDate=...`**: Paginated trade history with optional date filtering.
- **`GET /api/positions/:id`**: Fetch a single position record by ID.
- **`PUT /api/positions/:id`**: Update position details (outcome, amount, prices, WON/LOST/OPEN status, PnL, etc.).
- **`DELETE /api/positions/:id`**: Permanently remove a position record.
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
pnpm run inspect             # Inspect active Polymarket 5M market page DOM elements and prices
pnpm run history             # View CLI summary table of all live trades
pnpm run paper               # View CLI summary table of all paper trades
pnpm run slack:test          # Send a test balance report to Slack
```

---

## 🛡️ Risk Management & Automated Protection

1. **Stop-Loss / Cash Out (≥ 20% Outcome Drop)**:
   - When a trade is placed, the outcome price (`Up` / `Down`) is remembered as `entryPrice`.
   - If the price deteriorates by 20% or more (e.g. bought at 100¢ and drops to 80¢, or bought at 80¢ and drops to 64¢), the bot triggers a quick exit via in-page Cash Out to preserve capital.
2. **Delta Margin Enforcement (`MIN_PRICE_DELTA`)**:
   - The bot checks `|CurrentPrice - PriceToBeat|`. If the spread is narrower than the configured threshold (default `$1.00`), no bet is placed to avoid volatile last-second reversals.
3. **Stop-At-Balance Circuit Breaker (`STOP_AT_BALANCE`)**:
   - If the account balance falls to or below this threshold, all automated betting immediately halts while the scanner remains active for market tracking.
4. **Window Bet Throttling (`MAX_BETS_PER_WINDOW` & `BET_COOLDOWN_MS`)**:
   - Prevents duplicate clicks and limits maximum exposure per 5-minute round.

---

## 📜 License

ISC
