import axios from 'axios';
import { CONFIG } from '../config.js';
import { LivePosition } from '../types.js';
import { Logger } from '../utils/logger.js';

export class SlackService {
  /**
   * Sends the current Polymarket account balance to Slack Webhook URL.
   */
  public static async sendBalance(
    balance: string,
    webhookUrl: string = CONFIG.SLACK_WEBHOOK_URL
  ): Promise<boolean> {
    if (!webhookUrl || webhookUrl.trim() === '') {
      Logger.warn('SLACK_WEBHOOK_URL is not set in .env. Skipping Slack notification.');
      return false;
    }

    try {
      const balanceText = balance && balance.trim() !== '' ? balance.trim() : 'N/A';
      const timeStr = new Date().toLocaleString();

      const payload = {
        text: `💰 *Polymarket Balance:* ${balanceText}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `💰 *Current Polymarket Balance:* \`${balanceText}\`\n🕒 _Reported at ${timeStr}_`,
            },
          },
        ],
      };

      const response = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      if (response.status === 200) {
        Logger.success(`Successfully sent balance (${balanceText}) to Slack!`);
        return true;
      } else {
        Logger.warn(`Slack responded with status ${response.status}`);
        return false;
      }
    } catch (err: any) {
      Logger.error('Failed to send Slack balance notification', err?.message || err);
      return false;
    }
  }

  /**
   * Formats and sends the Live Trading Performance Summary to a Slack Webhook URL.
   */
  public static async sendLiveSummary(
    positions: LivePosition[],
    webhookUrl: string = CONFIG.SLACK_WEBHOOK_URL
  ): Promise<boolean> {
    if (!webhookUrl || webhookUrl.trim() === '') {
      Logger.warn('SLACK_WEBHOOK_URL is not set in .env. Skipping Slack notification.');
      return false;
    }

    try {
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
      const pnlSign = netPnL >= 0 ? '+' : '';
      const pnlEmoji = netPnL >= 0 ? '🟢' : '🔴';
      const openText = openTrades > 0 ? ` / ${openTrades} Open` : '';

      let tableContent = 'No trades recorded yet.';
      if (positions.length > 0) {
        const recent = positions.slice(-10);
        const rows = recent.map((p) => {
          const time = new Date(p.entryTime).toLocaleTimeString();
          const outcome = p.outcome.padEnd(4, ' ');
          const bet = `$${p.amountUsdc.toFixed(2)}`.padEnd(8, ' ');
          const beat = p.strikePrice > 0 ? `$${p.strikePrice.toFixed(2)}` : '-';
          const curr = p.entryBtcPrice > 0 ? `$${p.entryBtcPrice.toFixed(2)}` : '-';
          const beatCol = beat.padEnd(11, ' ');
          const currCol = curr.padEnd(11, ' ');
          const result = p.resolved ? (p.won ? 'WON 🏆' : 'LOST ❌') : 'OPEN ⏳';
          const resultCol = result.padEnd(8, ' ');
          const pnlStr = p.resolved
            ? (p.pnlUsdc! >= 0 ? `+$${p.pnlUsdc!.toFixed(2)}` : `-$${Math.abs(p.pnlUsdc!).toFixed(2)}`)
            : '-';
          return `${time.padEnd(11, ' ')} ${outcome} ${bet} ${beatCol} ${currCol} ${resultCol} ${pnlStr}`;
        });

        tableContent = [
          'Time        Dir  Bet      Beat        Current     Result   PnL',
          '------------------------------------------------------------------',
          ...rows,
        ].join('\n');
      }

      const payload = {
        text: `🔥 *LIVE TRADING PERFORMANCE SUMMARY* | PnL: ${pnlSign}$${netPnL.toFixed(2)} USDC`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔥 LIVE TRADING PERFORMANCE SUMMARY',
              emoji: true,
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Total Trades:*\n${positions.length}`,
              },
              {
                type: 'mrkdwn',
                text: `*Wins / Losses:*\n${wonTrades} Won / ${lostTrades} Lost${openText} (${winRate.toFixed(1)}%)`,
              },
              {
                type: 'mrkdwn',
                text: `*Total Wagered:*\n$${totalWagered.toFixed(2)} USDC`,
              },
              {
                type: 'mrkdwn',
                text: `*Net Realized PnL:*\n${pnlEmoji} *${pnlSign}$${netPnL.toFixed(2)} USDC*`,
              },
            ],
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Recent Trades (Last ${Math.min(10, positions.length)}):*\n\`\`\`\n${tableContent}\n\`\`\``,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🕒 Hourly Report generated at ${new Date().toLocaleString()}`,
              },
            ],
          },
        ],
      };

      const response = await axios.post(webhookUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });

      if (response.status === 200) {
        Logger.success('Successfully sent LIVE TRADING PERFORMANCE SUMMARY to Slack!');
        return true;
      } else {
        Logger.warn(`Slack responded with status ${response.status}`);
        return false;
      }
    } catch (err: any) {
      Logger.error('Failed to send Slack summary', err?.message || err);
      return false;
    }
  }
}
