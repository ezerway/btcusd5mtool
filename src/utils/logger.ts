import chalk from 'chalk';
import Table from 'cli-table3';
import { PaperPosition, TradeSignal, OrderResult } from '../types.js';

export class Logger {
  public static info(msg: string): void {
    console.log(`${chalk.blue('[INFO]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  public static success(msg: string): void {
    console.log(`${chalk.green.bold('[SUCCESS]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  public static warn(msg: string): void {
    console.log(`${chalk.yellow.bold('[WARNING]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
  }

  public static error(msg: string, err?: any): void {
    console.error(`${chalk.red.bold('[ERROR]')} ${chalk.gray(new Date().toLocaleTimeString())} ${msg}`);
    if (err) {
      console.error(chalk.red(err?.stack || err?.message || JSON.stringify(err)));
    }
  }

  public static banner(mode: string, btcPrice?: number): void {
    console.clear();
    console.log(chalk.cyan.bold('==========================================================='));
    console.log(chalk.cyan.bold('   🚀 POLYMARKET BTC 5M AUTOMATED BETTING BOT (PLAYWRIGHT)  '));
    console.log(chalk.cyan.bold('==========================================================='));
    console.log(` Mode:           ${mode === 'live' ? chalk.red.bold('LIVE BETTING ⚠️') : chalk.green.bold('DRY-RUN / PAPER TRADING 🛡️')}`);
    if (btcPrice) {
      console.log(` Current Price:  ${chalk.yellow.bold('$' + btcPrice.toLocaleString(undefined, { minimumFractionDigits: 2 }))}`);
    }
    console.log(chalk.gray(` Time:           ${new Date().toLocaleString()}`));
    console.log(chalk.cyan.bold('-----------------------------------------------------------\n'));
  }

  public static displaySignal(signal: TradeSignal): void {
    const outcomeColor = signal.recommendedOutcome === 'YES' ? chalk.green.bold : chalk.red.bold;
    console.log('\n' + chalk.magenta.bold('🎯 TRADE SIGNAL DETECTED:'));
    console.log(` Market:        ${chalk.white(signal.market.question)}`);
    console.log(` Price To Beat: ${chalk.yellow('$' + signal.market.strikePrice.toLocaleString())}`);
    console.log(` Current Price: ${chalk.yellow('$' + signal.currentBtcPrice.toLocaleString())} (Diff: ${signal.priceDelta >= 0 ? '+' : ''}${signal.priceDelta.toFixed(2)})`);
    console.log(` Signal:        ${outcomeColor(signal.recommendedOutcome)} (Confidence: ${(signal.confidence * 100).toFixed(0)}%)`);
    console.log(` Expiry in:     ${chalk.cyan(signal.secondsRemaining + 's')}`);
    console.log(` Rationale:     ${chalk.gray(signal.reason)}\n`);
  }

  public static displayOrderResult(res: OrderResult): void {
    if (res.success) {
      console.log(chalk.green.bold(`\n✅ ORDER SUBMITTED (${res.mode.toUpperCase()})`));
      console.log(` Outcome:  ${res.outcome}`);
      console.log(` Amount:   $${res.amountUsdc} USDC`);
      console.log(` Shares:   ~${res.estimatedShares.toFixed(2)} @ $${res.pricePerShare.toFixed(3)}/share`);
      if (res.txHash) console.log(` TxHash:   ${res.txHash}`);
    } else {
      console.log(chalk.red.bold(`\n❌ ORDER FAILED (${res.mode.toUpperCase()})`));
      console.log(` Reason:   ${res.error || 'Unknown error'}`);
    }
  }

  public static displayPaperSummary(balance: number, initialBalance: number, positions: PaperPosition[]): void {
    const pnl = balance - initialBalance;
    const pnlPercent = (pnl / initialBalance) * 100;
    const pnlColor = pnl >= 0 ? chalk.green.bold : chalk.red.bold;

    console.log(chalk.yellow.bold('\n📊 PAPER TRADING SUMMARY'));
    console.log(` Initial Balance: $${initialBalance.toFixed(2)} USDC`);
    console.log(` Current Balance: $${balance.toFixed(2)} USDC`);
    console.log(` Total PnL:        ${pnlColor((pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' (' + pnlPercent.toFixed(2) + '%)')}`);
    console.log(` Total Trades:    ${positions.length}`);

    if (positions.length > 0) {
      const table = new Table({
        head: ['Outcome', 'Bet ($)', 'Price To Beat', 'Current Price', 'Result', 'PnL ($)'].map((h) => chalk.cyan(h)),
        colWidths: [10, 10, 15, 15, 10, 12],
      });

      positions.slice(-5).forEach((p) => {
        table.push([
          p.outcome === 'YES' ? chalk.green(p.outcome) : chalk.red(p.outcome),
          `$${p.amountUsdc.toFixed(2)}`,
          p.strikePrice > 0 ? `$${p.strikePrice.toFixed(2)}` : '-',
          p.entryBtcPrice > 0 ? `$${p.entryBtcPrice.toFixed(2)}` : '-',
          p.resolved ? (p.won ? chalk.green('WON 🏆') : chalk.red('LOST ❌')) : chalk.yellow('OPEN ⏳'),
          p.resolved ? (p.pnlUsdc! >= 0 ? chalk.green('+$' + p.pnlUsdc!.toFixed(2)) : chalk.red('-$' + Math.abs(p.pnlUsdc!).toFixed(2))) : '-',
        ]);
      });

      console.log(table.toString());
    }
  }
}
