import express, { Request, Response } from 'express';
import cors from 'cors';
import { DatabaseService } from '../db/database.js';
import { Logger } from '../utils/logger.js';
import { CONFIG } from '../config.js';
import path from 'path';
import fs from 'fs';

export class ApiServer {
  private app: express.Express;
  private port: number;
  private server: any = null;

  constructor(port: number = parseInt(process.env.PORT || '3100', 10)) {
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Serve static frontend build if it exists
    const webDistPath = path.join(process.cwd(), 'web', 'dist');
    if (fs.existsSync(webDistPath)) {
      this.app.use(express.static(webDistPath));
    }
  }

  private setupRoutes(): void {
    const db = DatabaseService.getInstance();

    // Health check
    this.app.get('/api/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Aggregate statistics
    this.app.get('/api/stats', (req: Request, res: Response) => {
      const mode = (req.query.mode as string) || 'live';
      const startDate = req.query.startDate ? parseInt(req.query.startDate as string, 10) : undefined;
      const endDate = req.query.endDate ? parseInt(req.query.endDate as string, 10) : undefined;
      const stats = db.getStats(mode, startDate, endDate);
      res.json(stats);
    });

    // Positions list
    this.app.get('/api/positions', (req: Request, res: Response) => {
      const mode = (req.query.mode as string) || 'live';
      const limit = parseInt(req.query.limit as string || '100', 10);
      const offset = parseInt(req.query.offset as string || '0', 10);
      const startDate = req.query.startDate ? parseInt(req.query.startDate as string, 10) : undefined;
      const endDate = req.query.endDate ? parseInt(req.query.endDate as string, 10) : undefined;
      const positions = db.getPositions({ mode, limit, offset, startDate, endDate });
      res.json(positions);
    });

    // Full price scan of window for a specific position (especially for post-mortem analysis of lost trades)
    this.app.get('/api/positions/:id/window-scans', (req: Request, res: Response) => {
      const id = req.params.id as string;
      const scans = db.getWindowScansForPosition(id);
      res.json(scans);
    });

    // Single position details
    this.app.get('/api/positions/:id', (req: Request, res: Response) => {
      const id = req.params.id as string;
      const position = db.getPositionById(id);
      if (!position) {
        res.status(404).json({ ok: false, error: 'Position not found' });
        return;
      }
      res.json(position);
    });

    // Update position
    this.app.put('/api/positions/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        const updates = req.body;
        const success = db.updatePosition(id, updates);
        if (!success) {
          res.status(404).json({ ok: false, error: 'Position not found or update failed' });
          return;
        }
        const updated = db.getPositionById(id);
        res.json({ ok: true, position: updated });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || 'Failed to update position' });
      }
    });

    // Delete position
    this.app.delete('/api/positions/:id', (req: Request, res: Response) => {
      try {
        const id = req.params.id as string;
        const success = db.deletePosition(id);
        if (!success) {
          res.status(404).json({ ok: false, error: 'Position not found or delete failed' });
          return;
        }
        res.json({ ok: true });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || 'Failed to delete position' });
      }
    });

    // PnL history for charts
    this.app.get('/api/pnl-history', (req: Request, res: Response) => {
      const mode = (req.query.mode as string) || 'live';
      const startDate = req.query.startDate ? parseInt(req.query.startDate as string, 10) : undefined;
      const endDate = req.query.endDate ? parseInt(req.query.endDate as string, 10) : undefined;
      const history = db.getPnLHistory(mode, startDate, endDate);
      res.json(history);
    });

    // Recent price ticks for charts
    this.app.get('/api/ticks', (req: Request, res: Response) => {
      const limit = parseInt(req.query.limit as string || '300', 10);
      const ticks = db.getRecentTicks(limit);
      res.json(ticks);
    });

    // Bot status & latest tick
    this.app.get('/api/status', (_req: Request, res: Response) => {
      const status = db.getBotState('status') || { running: false, mode: 'unknown' };
      const lastTick = db.getBotState('last_tick') || null;
      const stats = db.getStats('live');
      const bettingEnabled = db.getBotState('betting_enabled') ?? true;
      const stopAtBalance = db.getBotState('stop_at_balance') ?? CONFIG.STOP_AT_BALANCE;
      const stopReason = db.getBotState('stop_reason') || null;
      res.json({
        status: {
          ...status,
          bettingEnabled,
          stopAtBalance,
          stopReason,
        },
        lastTick,
        stats,
        config: {
          maxBetsPerWindow: CONFIG.MAX_BETS_PER_WINDOW,
          betCooldownMs: CONFIG.BET_COOLDOWN_MS,
          betAmountUsdc: CONFIG.BET_AMOUNT_USDC,
          targetPriceCents: CONFIG.TARGET_PRICE_CENTS,
          stopAtBalance,
        },
        serverTime: Date.now(),
      });
    });

    // Real-time Server-Sent Events (SSE) stream
    this.app.get('/api/stream', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const mode = (req.query.mode as string) || 'live';

      // Send updates every 1000ms
      const sendUpdate = () => {
        try {
          const status = db.getBotState('status') || { running: false };
          const lastTick = db.getBotState('last_tick') || null;
          const stats = db.getStats(mode);
          const bettingEnabled = db.getBotState('betting_enabled') ?? true;
          const stopAtBalance = db.getBotState('stop_at_balance') ?? CONFIG.STOP_AT_BALANCE;
          const stopReason = db.getBotState('stop_reason') || null;
          const data = JSON.stringify({
            status: { ...status, bettingEnabled, stopAtBalance, stopReason },
            lastTick,
            stats,
            timestamp: Date.now(),
          });
          res.write(`data: ${data}\n\n`);
        } catch {
          clearInterval(interval);
        }
      };

      sendUpdate();
      const interval = setInterval(sendUpdate, 1000);

      const cleanup = () => {
        clearInterval(interval);
      };

      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
    });

    // Bot betting control (Stop / Resume bet, update stop-at-balance)
    this.app.post('/api/bot/bet-control', (req: Request, res: Response) => {
      try {
        const { enabled, stopAtBalance } = req.body;
        if (typeof enabled === 'boolean') {
          db.setBotState('betting_enabled', enabled);
          if (enabled) {
            db.setBotState('stop_reason', null);
          } else {
            db.setBotState('stop_reason', 'Stopped by user via dashboard');
          }
        }
        if (typeof stopAtBalance === 'number') {
          db.setBotState('stop_at_balance', stopAtBalance);
        }
        const updatedEnabled = db.getBotState('betting_enabled') ?? true;
        const updatedStopBal = db.getBotState('stop_at_balance') ?? CONFIG.STOP_AT_BALANCE;
        const updatedReason = db.getBotState('stop_reason') || null;

        const curStatus = db.getBotState('status') || {};
        db.setBotState('status', {
          ...curStatus,
          bettingEnabled: updatedEnabled,
          stopAtBalance: updatedStopBal,
          stopReason: updatedReason,
        });

        res.json({
          ok: true,
          bettingEnabled: updatedEnabled,
          stopAtBalance: updatedStopBal,
          stopReason: updatedReason,
        });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || 'Failed to update betting control' });
      }
    });

    // Reset SQLite Database
    this.app.post('/api/reset-db', (req: Request, res: Response) => {
      try {
        const mode = (req.body?.mode as string) || (req.query?.mode as string) || 'all';
        const clearTicks = req.body?.clearTicks !== false;
        const result = db.resetDatabase({ mode: mode as any, clearTicks });
        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(500).json({ ok: false, error: err?.message || 'Failed to reset database' });
      }
    });

    // Fallback to index.html for SPA client-side routing
    this.app.use((_req: Request, res: Response) => {
      const webDistIndex = path.join(process.cwd(), 'web', 'dist', 'index.html');
      if (fs.existsSync(webDistIndex)) {
        res.sendFile(webDistIndex);
      } else {
        res.status(404).json({ error: 'Frontend not built yet. Run npm run web:build or npm run web:dev.' });
      }
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        Logger.info(`Web API & Dashboard server listening on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
