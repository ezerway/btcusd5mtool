import { Command } from 'commander';
import { BotEngine } from './engine/botEngine.js';
import { WalletHelper } from './automation/walletHelper.js';
import { MarketResolverService } from './services/marketResolver.js';
import { PaperTradingService } from './services/paperTrading.js';
import { LiveTradingService } from './services/liveTrading.js';
import { SlackService } from './services/slackService.js';
import { Logger } from './utils/logger.js';
import { CONFIG } from './config.js';

import { ApiServer } from './server/apiServer.js';

const program = new Command();

program
  .name('btcusd5mtool')
  .description('Polymarket BTC 5-Minute Pure DOM Automated Betting Bot powered by Playwright')
  .version('1.0.0');

program
  .command('bot')
  .description('Start the automated pure DOM betting bot')
  .option('-m, --mode <mode>', 'Trading mode: "dry-run" (paper trading) or "live"', CONFIG.MODE)
  .option('-b, --bet-amount <amount>', 'Bet amount in USDC', CONFIG.BET_AMOUNT_USDC.toString())
  .option('-w, --web', 'Start web dashboard and API server concurrently', false)
  .option('-p, --port <port>', 'Web server port', process.env.PORT || '3100')
  .action(async (options) => {
    const mode = (options.mode === 'live' ? 'live' : 'dry-run') as 'dry-run' | 'live';
    if (options.betAmount) {
      CONFIG.BET_AMOUNT_USDC = parseFloat(options.betAmount);
    }
    let webUrl: string | undefined = undefined;
    if (options.web) {
      const port = parseInt(options.port || process.env.PORT || '3100', 10);
      const server = new ApiServer(port);
      await server.start();
      webUrl = `http://localhost:${port}`;
    }
    const engine = new BotEngine(mode, webUrl);
    await engine.start();
  });

program
  .command('login')
  .description('Launch interactive browser window to log in to Polymarket and save wallet profile')
  .action(async () => {
    await WalletHelper.interactiveLogin();
  });

program
  .command('inspect')
  .description('Inspect current Polymarket Crypto 5M target page')
  .action(async () => {
    try {
      Logger.banner('INSPECT');
      console.log(` Target Hub URL:   ${MarketResolverService.getTargetHubUrl()}`);
      console.log(` Target Price(s):  ${CONFIG.TARGET_PRICE_CENTS.join(', ')}¢`);
      console.log(' Viewport:         Mobile 1-Tap (iPhone)\n');
    } catch (err) {
      Logger.error('Inspection failed', err);
    }
  });

program
  .command('paper')
  .description('View paper trading ledger summary and historical performance')
  .action(() => {
    const paper = new PaperTradingService();
    Logger.displayPaperSummary(paper.getBalance(), paper.getInitialBalance(), paper.getPositions());
  });

program
  .command('history')
  .alias('live:history')
  .description('View live trading ledger summary and historical performance')
  .action(() => {
    const live = new LiveTradingService();
    Logger.displayLiveSummary(live.getPositions());
  });

program
  .command('slack:test [balance]')
  .description('Send a test current balance notification to Slack webhook')
  .action(async (balance) => {
    const testBalance = balance || '$100.00';
    await SlackService.sendBalance(testBalance);
  });

program
  .command('server')
  .description('Start SQLite API & Web Dashboard server')
  .option('-p, --port <port>', 'Server port', '3100')
  .action(async (options) => {
    const server = new ApiServer(parseInt(options.port, 10));
    await server.start();

    process.on('SIGINT', async () => {
      await server.stop();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await server.stop();
      process.exit(0);
    });
  });

program.parse(process.argv);
