import express, { Request, Response } from 'express';
import cors from 'cors';
import { DatabaseService } from '../db/database.js';
import { Logger } from '../utils/logger.js';
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
      const stats = db.getStats(mode);
      res.json(stats);
    });

    // Positions list
    this.app.get('/api/positions', (req: Request, res: Response) => {
      const mode = (req.query.mode as string) || 'live';
      const limit = parseInt(req.query.limit as string || '100', 10);
      const offset = parseInt(req.query.offset as string || '0', 10);
      const positions = db.getPositions({ mode, limit, offset });
      res.json(positions);
    });

    // Full price scan of window for a specific position (especially for post-mortem analysis of lost trades)
    this.app.get('/api/positions/:id/window-scans', (req: Request, res: Response) => {
      const id = req.params.id as string;
      const scans = db.getWindowScansForPosition(id);
      res.json(scans);
    });

    // PnL history for charts
    this.app.get('/api/pnl-history', (req: Request, res: Response) => {
      const mode = (req.query.mode as string) || 'live';
      const history = db.getPnLHistory(mode);
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
      res.json({
        status,
        lastTick,
        stats,
        serverTime: Date.now(),
      });
    });

    // Real-time Server-Sent Events (SSE) stream
    this.app.get('/api/stream', (req: Request, res: Response) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Send initial state immediately
      const sendUpdate = () => {
        try {
          const status = db.getBotState('status') || { running: false };
          const lastTick = db.getBotState('last_tick') || null;
          const stats = db.getStats('live');
          const data = JSON.stringify({ status, lastTick, stats, timestamp: Date.now() });
          res.write(`data: ${data}\n\n`);
        } catch {
          clearInterval(interval);
        }
      };

      sendUpdate();
      const interval = setInterval(sendUpdate, 1000);

      req.on('close', () => {
        clearInterval(interval);
      });
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
