import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, timeseries, under, valueMap } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'trading-bot-execution';
const SEL = `{job="${JOB}"}`;
const LAG = 'kafka:consumer_group_lag:sum{redpanda_group="trading-bot-execution-market-data-v1"}';

const MODE = valueMap({ '0': ['live', 'red'], '1': ['paper', 'green'] });
const PROMOTION = valueMap({ '0': ['none', 'text'], '1': ['loaded', 'green'] });

export const serviceTradingBotExecution: DashboardSpec = {
  uid: 'service-trading-bot-execution',
  title: 'trading-bot-execution',
  description:
    'The Rust service that reads the live kline and trade stream, evaluates the promoted strategies and opens and closes positions. The one panel that matters is the mode: paper means every trade is simulated, live means the Binance account is being used for real. trading-bot is local only: no deploy, no production scrape job. Health, dependencies, release, the closed-trade breakdown and the trade log panel came with trading-bot#158, which is where a Rust log line first carried an event name at all; it is merged, so every panel reads whenever the local stack is up.',
  folder: SERVICES,
  tags: ['service', 'trading-bot'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      stat('Mode', 'paper simulates every fill locally. live places orders on the Binance account with real money. Leaving paper is a page.', { w: 4, h: 5 }, [
        prom(`max(trading_bot_execution_paper_mode_enabled${SEL})`, { legend: 'mode' }),
      ], { mappings: MODE, steps: atLeast(1) }),
      healthStat(JOB),
      upStat(JOB),
      releaseStat(JOB),
      stat('Promotion loaded', 'Whether a promoted execution configuration is actually loaded. Without one the service runs and trades nothing.', { w: 4, h: 5 }, [
        prom(`max(trading_bot_execution_active_promotion_loaded${SEL})`, { legend: 'promotion' }),
      ], { mappings: PROMOTION, steps: atLeast(1) }),
      stat('Market data lag', 'Klines and trades published and not yet read. The strategies see the market this far behind.', { w: 4, h: 5 }, [
        prom(`max(${LAG}) or vector(0)`, { legend: 'lag' }),
      ], { steps: under(500), decimals: 0 }),
    ],
    [
      componentsTable(JOB, 8),
      timeseries('Mode over time', 'One line, and it should never leave 1. A step down to 0 is the moment a live promotion took effect.', { w: 8, h: 7 }, [
        prom(`max(trading_bot_execution_paper_mode_enabled${SEL})`, { legend: 'paper' }),
      ], { unit: 'short', min: 0, max: 1, decimals: 0, steps: atLeast(1), lines: true }),
      timeseries('Consumer lag by topic', 'How far behind the kline and aggregate-trade topics the service is. Lag that only grows means the evaluation loop is slower than the market.', { w: 8, h: 7 }, [
        prom(LAG, { legend: '{{redpanda_topic}}' }),
      ], { unit: 'short', min: 0, steps: under(500), lines: true }),
    ],
    [
      timeseries('Paper trades closed', 'Positions the simulator closed, by the reason it closed them: a target, a stop or the end of the promotion. From the logs.', { w: 8, h: 8 }, [
        loki(`sum by (close_reason) (count_over_time({app="${JOB}"} | json | event="paper_trade.closed" [$__auto]))`, { legend: '{{close_reason}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Control-plane refreshes', 'How often the service re-reads its promotions and analysis settings. A flat zero means the refresh loop stopped and the configuration is frozen.', { w: 8, h: 8 }, [
        prom(`sum(rate(trading_bot_execution_refresh_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'refreshes' }),
      ], { unit: 'ops', min: 0 }),
      failingTraces(JOB, 8, 8),
    ],
    [
      logs('Trades and reconciliation', 'Every simulated trade closed, and every time reconciliation found no free balance to work with.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event=~"paper_trade.closed|reconciliation.no_free_balance"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
