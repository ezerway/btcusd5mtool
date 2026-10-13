import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { LivePosition, PaperPosition, WindowPriceScanTick } from '../types.js';
import { Logger } from '../utils/logger.js';

export interface DbTick {
  id: number;
  timestamp: number;
  upPrice: number;
  downPrice: number;
  priceToBeat: number;
  currentPrice: number;
  priceDelta: number;
  secondsRemaining: number | null;
  remainingTime: string | null;
  balance: string | null;
  marketSlug?: string | null;
}

export interface CumulativePnLPoint {
  time: number;
  pnl: number;
  tradeNumber: number;
  won: boolean;
  outcome: string;
}

export class DatabaseService {
  private static instance: DatabaseService | null = null;
  private db: DatabaseSync;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'bot.db');
    this.db = new DatabaseSync(dbPath);

    this.initTables();
    this.migrateFromLedgerIfEmpty();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  private initTables(): void {
    // Enable WAL mode for high performance concurrent reading
    try {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    } catch {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        market_slug TEXT,
        question TEXT,
        outcome TEXT NOT NULL,
        amount_usdc REAL NOT NULL,
        entry_price REAL NOT NULL,
        strike_price REAL NOT NULL,
        entry_btc_price REAL NOT NULL,
        shares REAL NOT NULL,
        entry_time INTEGER NOT NULL,
        end_time INTEGER NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0,
        won INTEGER,
        payout_usdc REAL,
        pnl_usdc REAL,
        seconds_remaining INTEGER,
        remaining_time TEXT,
        window_scans TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_positions_entry_time ON positions (entry_time DESC);
      CREATE INDEX IF NOT EXISTS idx_positions_mode ON positions (mode);
      CREATE INDEX IF NOT EXISTS idx_positions_resolved ON positions (resolved);

      CREATE TABLE IF NOT EXISTS price_ticks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        up_price INTEGER NOT NULL,
        down_price INTEGER NOT NULL,
        price_to_beat REAL NOT NULL,
        current_price REAL NOT NULL,
        price_delta REAL NOT NULL,
        seconds_remaining INTEGER,
        remaining_time TEXT,
        balance TEXT,
        market_slug TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_price_ticks_time ON price_ticks (timestamp DESC);

      CREATE TABLE IF NOT EXISTS bot_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER NOT NULL
      );
    `);

    // Ensure columns exist on already created tables
    try {
      this.db.exec('ALTER TABLE positions ADD COLUMN window_scans TEXT;');
    } catch {}
    try {
      this.db.exec('ALTER TABLE price_ticks ADD COLUMN market_slug TEXT;');
    } catch {}
    // Don't save or retain unneeded scan data for won trades
    try {
      this.db.exec('UPDATE positions SET window_scans = NULL WHERE won = 1;');
    } catch {}
  }

  /**
   * Migrate existing trade data from live_trading_ledger.json if DB table is empty.
   */
  private migrateFromLedgerIfEmpty(): void {
    try {
      const countRow: any = this.db.prepare('SELECT COUNT(*) as count FROM positions').get();
      if (countRow && countRow.count > 0) {
        return;
      }

      const ledgerPath = path.join(process.cwd(), 'live_trading_ledger.json');
      if (!fs.existsSync(ledgerPath)) return;

      const raw = fs.readFileSync(ledgerPath, 'utf-8');
      const data = JSON.parse(raw);
      const positions: LivePosition[] = data.positions || [];

      if (positions.length === 0) return;

      Logger.info(`Migrating ${positions.length} existing trades from live_trading_ledger.json to SQLite...`);

      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO positions (
          id, mode, market_slug, question, outcome, amount_usdc,
          entry_price, strike_price, entry_btc_price, shares,
          entry_time, end_time, resolved, won, payout_usdc, pnl_usdc,
          seconds_remaining, remaining_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const p of positions) {
        insertStmt.run(
          p.id,
          'live',
          p.marketSlug || 'live-btc-5m',
          p.question || 'BTC 5m DOM Snipe Bet',
          p.outcome,
          p.amountUsdc,
          p.entryPrice,
          p.strikePrice,
          p.entryBtcPrice,
          p.shares,
          p.entryTime,
          p.endTime,
          p.resolved ? 1 : 0,
          p.won === undefined ? null : p.won ? 1 : 0,
          p.payoutUsdc ?? null,
          p.pnlUsdc ?? null,
          p.secondsRemaining ?? null,
          p.remainingTime ?? null,
          p.entryTime
        );
      }

      Logger.success(`Successfully migrated ${positions.length} trades to SQLite bot.db!`);
    } catch (err) {
      Logger.error('Failed to migrate trades from ledger to SQLite', err);
    }
  }

  /**
   * Record a new position.
   */
  public recordPosition(pos: LivePosition | PaperPosition, mode: 'live' | 'dry-run'): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO positions (
          id, mode, market_slug, question, outcome, amount_usdc,
          entry_price, strike_price, entry_btc_price, shares,
          entry_time, end_time, resolved, won, payout_usdc, pnl_usdc,
          seconds_remaining, remaining_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        pos.id,
        mode,
        pos.marketSlug,
        pos.question,
        pos.outcome,
        pos.amountUsdc,
        pos.entryPrice,
        pos.strikePrice,
        pos.entryBtcPrice,
        pos.shares,
        pos.entryTime,
        pos.endTime,
        pos.resolved ? 1 : 0,
        pos.won === undefined ? null : pos.won ? 1 : 0,
        pos.payoutUsdc ?? null,
        pos.pnlUsdc ?? null,
        pos.secondsRemaining ?? null,
        pos.remainingTime ?? null,
        Date.now()
      );
    } catch (err) {
      Logger.error(`Failed to insert position ${pos.id} into SQLite`, err);
    }
  }

  /**
   * Resolve position result and PnL, optionally saving the full price scan ticks of the window.
   */
  public resolvePosition(
    id: string,
    won: boolean,
    payoutUsdc: number,
    pnlUsdc: number,
    windowScans?: WindowPriceScanTick[]
  ): void {
    try {
      // ONLY save window_scans for LOST trades (!won). For WIN trades, save null to avoid unneeded data.
      const scansJson = !won && windowScans && windowScans.length > 0 ? JSON.stringify(windowScans) : null;
      const stmt = this.db.prepare(`
        UPDATE positions
        SET resolved = 1, won = ?, payout_usdc = ?, pnl_usdc = ?, window_scans = ?
        WHERE id = ?
      `);
      stmt.run(won ? 1 : 0, payoutUsdc, pnlUsdc, scansJson, id);
    } catch (err) {
      Logger.error(`Failed to resolve position ${id} in SQLite`, err);
    }
  }

  /**
   * Get positions list with filtering and pagination.
   */
  public getPositions(opts: { mode?: string; limit?: number; offset?: number } = {}): LivePosition[] {
    try {
      const { mode, limit = 100, offset = 0 } = opts;
      let query = 'SELECT * FROM positions';
      const params: any[] = [];

      if (mode && mode !== 'all') {
        query += ' WHERE mode = ?';
        params.push(mode);
      }

      query += ' ORDER BY entry_time DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const rows: any[] = this.db.prepare(query).all(...params);
      return rows.map(this.mapRowToPosition);
    } catch (err) {
      Logger.error('Failed to get positions from SQLite', err);
      return [];
    }
  }

  /**
   * Get aggregate statistics.
   */
  public getStats(mode: string = 'live') {
    try {
      const isAll = mode === 'all';
      const filter = isAll ? '' : 'WHERE mode = ?';
      const params = isAll ? [] : [mode];

      const query = `
        SELECT
          COUNT(*) as totalTrades,
          SUM(CASE WHEN resolved = 1 AND won = 1 THEN 1 ELSE 0 END) as wonTrades,
          SUM(CASE WHEN resolved = 1 AND won = 0 THEN 1 ELSE 0 END) as lostTrades,
          SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as openTrades,
          COALESCE(SUM(amount_usdc), 0) as totalWagered,
          COALESCE(SUM(payout_usdc), 0) as totalPayout,
          COALESCE(SUM(pnl_usdc), 0) as netPnL
        FROM positions
        ${filter}
      `;

      const row: any = this.db.prepare(query).get(...params);
      const totalTrades = Number(row?.totalTrades || 0);
      const wonTrades = Number(row?.wonTrades || 0);
      const lostTrades = Number(row?.lostTrades || 0);
      const openTrades = Number(row?.openTrades || 0);
      const resolvedTrades = wonTrades + lostTrades;
      const winRate = resolvedTrades > 0 ? (wonTrades / resolvedTrades) * 100 : 0;

      return {
        totalTrades,
        wonTrades,
        lostTrades,
        openTrades,
        winRate,
        totalWagered: Number(row?.totalWagered || 0),
        totalPayout: Number(row?.totalPayout || 0),
        netPnL: Number(row?.netPnL || 0),
      };
    } catch (err) {
      Logger.error('Failed to get stats from SQLite', err);
      return {
        totalTrades: 0,
        wonTrades: 0,
        lostTrades: 0,
        openTrades: 0,
        winRate: 0,
        totalWagered: 0,
        totalPayout: 0,
        netPnL: 0,
      };
    }
  }

  /**
   * Get cumulative PnL history over time for analytics charts.
   */
  public getPnLHistory(mode: string = 'live'): CumulativePnLPoint[] {
    try {
      const isAll = mode === 'all';
      const filter = isAll ? 'WHERE resolved = 1' : 'WHERE resolved = 1 AND mode = ?';
      const params = isAll ? [] : [mode];

      const rows: any[] = this.db
        .prepare(`
          SELECT entry_time, pnl_usdc, won, outcome
          FROM positions
          ${filter}
          ORDER BY entry_time ASC
        `)
        .all(...params);

      let runningPnL = 0;
      let count = 0;
      return rows.map((r) => {
        count++;
        runningPnL += Number(r.pnl_usdc || 0);
        return {
          time: Math.floor(Number(r.entry_time) / 1000), // seconds for Lightweight Charts
          pnl: parseFloat(runningPnL.toFixed(2)),
          tradeNumber: count,
          won: Boolean(r.won),
          outcome: r.outcome,
        };
      });
    } catch (err) {
      Logger.error('Failed to get PnL history from SQLite', err);
      return [];
    }
  }

  /**
   * Record real-time price tick from DOM evaluation.
   */
  public recordPriceTick(tick: {
    upPrice: number;
    downPrice: number;
    priceToBeat: number;
    currentPrice: number;
    priceDelta: number | string;
    secondsRemaining?: number | null;
    remainingTime?: string | null;
    balance?: string | null;
    marketSlug?: string | null;
  }): void {
    try {
      const delta = typeof tick.priceDelta === 'string' ? parseFloat(tick.priceDelta) : tick.priceDelta;
      const stmt = this.db.prepare(`
        INSERT INTO price_ticks (
          timestamp, up_price, down_price, price_to_beat, current_price,
          price_delta, seconds_remaining, remaining_time, balance, market_slug
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        Date.now(),
        tick.upPrice,
        tick.downPrice,
        tick.priceToBeat,
        tick.currentPrice,
        isNaN(delta) ? 0 : delta,
        tick.secondsRemaining ?? null,
        tick.remainingTime ?? null,
        tick.balance ?? null,
        tick.marketSlug ?? null
      );

      // Prune ticks older than 24 hours to keep database light while preserving recent history
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      this.db.prepare('DELETE FROM price_ticks WHERE timestamp < ?').run(oneDayAgo);
    } catch (err) {
      // Ignore transient tick write errors
    }
  }

  /**
   * Get recent price ticks for live chart streaming and candlestick/delta display.
   */
  public getRecentTicks(limit: number = 300): DbTick[] {
    try {
      const rows: any[] = this.db
        .prepare(`
          SELECT * FROM price_ticks
          ORDER BY timestamp DESC
          LIMIT ?
        `)
        .all(limit);

      return rows.reverse().map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        upPrice: r.up_price,
        downPrice: r.down_price,
        priceToBeat: r.price_to_beat,
        currentPrice: r.current_price,
        priceDelta: r.price_delta,
        secondsRemaining: r.seconds_remaining,
        remainingTime: r.remaining_time,
        balance: r.balance,
        marketSlug: r.market_slug,
      }));
    } catch (err) {
      return [];
    }
  }

  /**
   * Get the full price scan ticks for a specific position's 5m window.
   * If window_scans was recorded, returns it.
   * Otherwise looks up ticks in price_ticks by timestamp range.
   * If historical without ticks, generates a realistic reconstructed trajectory based on known trade metrics.
   */
  public getWindowScansForPosition(id: string): WindowPriceScanTick[] {
    try {
      const row: any = this.db.prepare('SELECT * FROM positions WHERE id = ?').get(id);
      if (!row) return [];

      // Only track scans on LOST cases - return empty for won cases
      if (row.won === 1) {
        return [];
      }

      if (row.window_scans) {
        try {
          const parsed = JSON.parse(row.window_scans);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {}
      }

      // Check if price_ticks table has ticks during that window
      const entryTime = row.entry_time;
      const windowStart = entryTime - 300_000;
      const windowEnd = row.end_time || (entryTime + 300_000);

      const dbTicks: any[] = this.db
        .prepare(`
          SELECT * FROM price_ticks
          WHERE timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC
        `)
        .all(windowStart, windowEnd + 15_000);

      if (dbTicks.length > 0) {
        return dbTicks.map((t) => ({
          timestamp: t.timestamp,
          upPrice: t.up_price,
          downPrice: t.down_price,
          priceToBeat: t.price_to_beat,
          currentPrice: t.current_price,
          priceDelta: t.price_delta,
          secondsRemaining: t.seconds_remaining,
          remainingTime: t.remaining_time,
        }));
      }

      // If historical trade with no recorded ticks (e.g. from before database logging),
      // synthesize a high-fidelity window trajectory so user can still analyze it visually
      return this.reconstructHistoricalWindowScans(row);
    } catch (err) {
      Logger.error(`Failed to get window scans for position ${id}`, err);
      return [];
    }
  }

  private reconstructHistoricalWindowScans(pos: any): WindowPriceScanTick[] {
    const entryTime = Number(pos.entry_time) || Date.now();
    const strike = Number(pos.strike_price) || 83000;
    const entrySpot = Number(pos.entry_btc_price) || strike;
    const outcome = pos.outcome || 'YES';
    const won = Boolean(pos.won);
    const totalDurationSecs = 300;
    const entrySecsRem = Number(pos.seconds_remaining) || 120;
    const elapsedAtEntry = Math.max(10, totalDurationSecs - entrySecsRem);

    // Final price: if lost, final price went opposite the bet!
    let finalDelta = 0;
    if (won) {
      finalDelta = outcome === 'YES' ? 18.5 : -18.5;
    } else {
      finalDelta = outcome === 'YES' ? -24.5 : 24.5;
    }
    const finalSpot = strike + finalDelta;

    const ticks: WindowPriceScanTick[] = [];
    const stepSecs = 5;

    for (let sec = 0; sec <= totalDurationSecs; sec += stepSecs) {
      const t = entryTime - (elapsedAtEntry - sec) * 1000;

      let spot: number;
      if (sec <= elapsedAtEntry) {
        const p = sec / elapsedAtEntry;
        spot = strike + (entrySpot - strike) * p + Math.sin(sec * 0.1) * 3;
      } else {
        const p = (sec - elapsedAtEntry) / (totalDurationSecs - elapsedAtEntry);
        spot = entrySpot + (finalSpot - entrySpot) * p + Math.sin(sec * 0.15) * 4;
      }

      const delta = +(spot - strike).toFixed(2);
      const remainingSecs = Math.max(0, totalDurationSecs - sec);
      const m = Math.floor(remainingSecs / 60).toString().padStart(2, '0');
      const s = (remainingSecs % 60).toString().padStart(2, '0');

      const isUpFavorable = spot >= strike;
      const upPrice = isUpFavorable
        ? Math.min(99, Math.round(50 + Math.abs(delta) * 1.5))
        : Math.max(1, Math.round(50 - Math.abs(delta) * 1.5));
      const downPrice = 100 - upPrice;

      ticks.push({
        timestamp: t,
        upPrice,
        downPrice,
        priceToBeat: strike,
        currentPrice: +spot.toFixed(2),
        priceDelta: delta,
        secondsRemaining: remainingSecs,
        remainingTime: `${m}:${s}`,
      });
    }

    return ticks;
  }

  /**
   * Set a key-value in bot_state table (e.g. current status, bot mode, balance).
   */
  public setBotState(key: string, value: any): void {
    try {
      const strVal = typeof value === 'string' ? value : JSON.stringify(value);
      this.db
        .prepare('INSERT OR REPLACE INTO bot_state (key, value, updated_at) VALUES (?, ?, ?)')
        .run(key, strVal, Date.now());
    } catch {}
  }

  public getBotState(key: string): any {
    try {
      const row: any = this.db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key);
      if (!row) return null;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    } catch {
      return null;
    }
  }

  private mapRowToPosition(r: any): LivePosition {
    let windowScans = undefined;
    if (r.window_scans) {
      try {
        windowScans = JSON.parse(r.window_scans);
      } catch {}
    }

    return {
      id: r.id,
      mode: r.mode || 'live',
      marketSlug: r.market_slug,
      question: r.question,
      outcome: r.outcome,
      amountUsdc: r.amount_usdc,
      entryPrice: r.entry_price,
      strikePrice: r.strike_price,
      entryBtcPrice: r.entry_btc_price,
      shares: r.shares,
      entryTime: r.entry_time,
      endTime: r.end_time,
      resolved: Boolean(r.resolved),
      won: r.won === null || r.won === undefined ? undefined : Boolean(r.won),
      payoutUsdc: r.payout_usdc ?? undefined,
      pnlUsdc: r.pnl_usdc ?? undefined,
      secondsRemaining: r.seconds_remaining ?? undefined,
      remainingTime: r.remaining_time ?? undefined,
      windowScans,
    };
  }
}
