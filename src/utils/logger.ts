import chalk from 'chalk';
import Table from 'cli-table3';
import { PaperPosition, LivePosition, TradeSignal, OrderResult } from '../types.js';

export class Logger {
  public static clear(): void {
    try {
      // Clear visible screen, scrollback buffer, and reset cursor position
      process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
    } catch {}
    console.clear();
  }

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
    Logger.clear();
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

  public static displayDOMPricesTable(data: {
    upPrice: number;
    downPrice: number;
    targetPrices: number[];
    priceToBeat: number;
    currentPrice: number;
    priceDelta: string | number;
    countdownStr?: string;
    secondsRemaining?: number | null;
  }): void {
    const table = new Table({
      head: ['Time', 'Up', 'Down', 'Target', 'Price To Beat', 'Current Price', 'Price Delta', 'Remaining Time'].map((h) => chalk.cyan(h)),
    });

    const deltaNum = typeof data.priceDelta === 'string' ? parseFloat(data.priceDelta) : data.priceDelta;
    const deltaFormatted = !isNaN(deltaNum) ? (deltaNum >= 0 ? `+$${deltaNum.toFixed(2)}` : `-$${Math.abs(deltaNum).toFixed(2)}`) : `${data.priceDelta}`;
    const deltaColor = !isNaN(deltaNum) ? (deltaNum >= 0 ? chalk.green(deltaFormatted) : chalk.red(deltaFormatted)) : deltaFormatted;

    const timeRemainingStr = data.countdownStr
      ? `${data.countdownStr}${data.secondsRemaining !== null && data.secondsRemaining !== undefined ? ` (${data.secondsRemaining}s)` : ''}`
      : (data.secondsRemaining !== null && data.secondsRemaining !== undefined ? `${data.secondsRemaining}s` : 'N/A');

    table.push([
      chalk.gray(new Date().toLocaleTimeString()),
      chalk.green(`${data.upPrice}¢`),
      chalk.red(`${data.downPrice}¢`),
      `${data.targetPrices.join(', ')}¢`,
      data.priceToBeat > 0 ? `$${data.priceToBeat.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-',
      data.currentPrice > 0 ? `$${data.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '-',
      deltaColor,
      chalk.yellow(timeRemainingStr),
    ]);

    console.log(table.toString());
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

    let wonTrades = 0;
    let lostTrades = 0;
    let openTrades = 0;

    for (const p of positions) {
      if (p.resolved) {
        if (p.won) {
          wonTrades++;
        } else {
          lostTrades++;
        }
      } else {
        openTrades++;
      }
    }

    const resolvedTrades = wonTrades + lostTrades;
    const winRate = resolvedTrades > 0 ? (wonTrades / resolvedTrades) * 100 : 0;
    const openText = openTrades > 0 ? ` / ${chalk.yellow(openTrades)} Open` : '';

    console.log(chalk.yellow.bold('\n📊 PAPER TRADING SUMMARY'));
    console.log(` Initial Balance: $${initialBalance.toFixed(2)} USDC`);
    console.log(` Current Balance: $${balance.toFixed(2)} USDC`);
    console.log(` Total PnL:        ${pnlColor((pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2) + ' (' + pnlPercent.toFixed(2) + '%)')}`);
    console.log(` Total Trades:    ${positions.length}`);
    console.log(` Wins / Losses:   ${chalk.green(wonTrades)} Won / ${chalk.red(lostTrades)} Lost${openText} (Win Rate: ${winRate.toFixed(1)}%)`);

    if (positions.length > 0) {
      const table = new Table({
        head: ['Time', 'Remaining', 'Outcome', 'Bet ($)', 'Price To Beat', 'Current Price', 'Result', 'PnL ($)'].map((h) => chalk.cyan(h)),
        colWidths: [14, 15, 10, 10, 15, 15, 12, 14],
      });

      positions.slice(-5).forEach((p) => {
        const timeStr = new Date(p.entryTime).toLocaleTimeString();
        const remStr = p.remainingTime
          ? p.remainingTime
          : (p.secondsRemaining !== undefined && p.secondsRemaining !== null
              ? `${Math.floor(p.secondsRemaining / 60).toString().padStart(2, '0')}:${(p.secondsRemaining % 60).toString().padStart(2, '0')} (${p.secondsRemaining}s)`
              : '-');

        table.push([
          chalk.gray(timeStr),
          chalk.yellow(remStr),
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

  public static displayLiveSummary(positions: LivePosition[]): void {
    let wonTrades = 0;
    let lostTrades = 0;
    let openTrades = 0;
    let totalWagered = 0;
    let totalPayout = 0;
    let netPnL = 0;

    for (const p of positions) {
      totalWagered += p.amountUsdc;
      if (p.resolved) {
        if (p.won) {
          wonTrades++;
        } else {
          lostTrades++;
        }
        totalPayout += p.payoutUsdc || 0;
        netPnL += p.pnlUsdc || 0;
      } else {
        openTrades++;
      }
    }

    const resolvedTrades = wonTrades + lostTrades;
    const winRate = resolvedTrades > 0 ? (wonTrades / resolvedTrades) * 100 : 0;
    const pnlColor = netPnL >= 0 ? chalk.green.bold : chalk.red.bold;
    const openText = openTrades > 0 ? ` / ${chalk.yellow(openTrades)} Open` : '';

    console.log(chalk.red.bold('\n🔥 LIVE TRADING PERFORMANCE SUMMARY'));
    console.log(` Total Trades:     ${positions.length}`);
    console.log(` Wins / Losses:    ${chalk.green(wonTrades)} Won / ${chalk.red(lostTrades)} Lost${openText} (Win Rate: ${winRate.toFixed(1)}%)`);
    console.log(` Total Wagered:    $${totalWagered.toFixed(2)} USDC`);
    console.log(` Total Payout:     $${totalPayout.toFixed(2)} USDC`);
    console.log(` Net Realized PnL: ${pnlColor((netPnL >= 0 ? '+' : '') + '$' + netPnL.toFixed(2))}`);

    if (positions.length > 0) {
      const table = new Table({
        head: ['Time', 'Remaining', 'Outcome', 'Bet ($)', 'Price To Beat', 'Current Price', 'Result', 'Net PnL ($)'].map((h) => chalk.cyan(h)),
        colWidths: [14, 15, 10, 10, 15, 15, 12, 14],
      });

      positions.slice(-10).forEach((p) => {
        const timeStr = new Date(p.entryTime).toLocaleTimeString();
        const remStr = p.remainingTime
          ? p.remainingTime
          : (p.secondsRemaining !== undefined && p.secondsRemaining !== null
              ? `${Math.floor(p.secondsRemaining / 60).toString().padStart(2, '0')}:${(p.secondsRemaining % 60).toString().padStart(2, '0')} (${p.secondsRemaining}s)`
              : '-');

        table.push([
          chalk.gray(timeStr),
          chalk.yellow(remStr),
          p.outcome === 'YES' ? chalk.green(p.outcome) : chalk.red(p.outcome),
          `$${p.amountUsdc.toFixed(2)}`,
          p.strikePrice > 0 ? `$${p.strikePrice.toFixed(2)}` : '-',
          p.entryBtcPrice > 0 ? `$${p.entryBtcPrice.toFixed(2)}` : '-',
          p.resolved ? (p.won ? chalk.green.bold('WON 🏆') : chalk.red.bold('LOST ❌')) : chalk.yellow('OPEN ⏳'),
          p.resolved ? (p.pnlUsdc! >= 0 ? chalk.green('+$' + p.pnlUsdc!.toFixed(2)) : chalk.red('-$' + Math.abs(p.pnlUsdc!).toFixed(2))) : '-',
        ]);
      });

      console.log(table.toString());
    }
  }
}
