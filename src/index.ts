import { Command } from 'commander';
import { BotEngine } from './engine/botEngine.js';
import { WalletHelper } from './automation/walletHelper.js';
import { MarketResolverService } from './services/marketResolver.js';
import { PaperTradingService } from './services/paperTrading.js';
import { Logger } from './utils/logger.js';
import { CONFIG } from './config.js';

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
  .action(async (options) => {
    const mode = (options.mode === 'live' ? 'live' : 'dry-run') as 'dry-run' | 'live';
    if (options.betAmount) {
      CONFIG.BET_AMOUNT_USDC = parseFloat(options.betAmount);
    }
    const engine = new BotEngine(mode);
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
      console.log(` Mobile Viewport:  ${CONFIG.IS_MOBILE}\n`);
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

program.parse(process.argv);
