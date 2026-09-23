import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'trading-bot-research-backtesting';
const SEL = `{job="${JOB}"}`;
const LAG =
  'kafka:consumer_group_lag:sum{redpanda_group="trading-bot-research-backtesting-data-readiness-trigger-v1"}';

export const serviceTradingBotResearchBacktesting: DashboardSpec = {
  uid: 'service-trading-bot-research-backtesting',
  title: 'trading-bot-research-backtesting',
  description:
    'The Rust service that replays stored history through a strategy and reports what it would have done. Backtests start when market-data says a window is ready, so a stalled readiness topic shows up here as no runs at all rather than as an error. trading-bot is local only: no deploy, no production scrape job. Health, dependencies, release and the backtest log panel all come from trading-bot#158 — that branch is where a Rust log line first carries an event name at all — so they stay empty until it merges and the container is rebuilt. The run counters, the replay throughput and the readiness lag are live now.',
  folder: SERVICES,
  tags: ['service', 'trading-bot'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      upStat(JOB),
      releaseStat(JOB),
      stat('Backtests · 24 hours', 'Backtest requests that finished, whatever the result.', { w: 4, h: 5 }, [
        prom(`sum(increase(trading_bot_research_backtesting_runs_total${SEL}[24h])) or vector(0)`, { legend: 'runs' }),
      ], { decimals: 0 }),
      stat('Failed · 24 hours', 'Backtests that ended in an error. The reason is in the log panel below.', { w: 4, h: 5 }, [
        prom(`sum(increase(trading_bot_research_backtesting_runs_total{job="${JOB}", outcome="error"}[24h])) or vector(0)`, { legend: 'failed' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Readiness lag', 'Data-readiness snapshots market-data published and this service has not read. Lag here delays every scheduled backtest.', { w: 4, h: 5 }, [
        prom(`max(${LAG}) or vector(0)`, { legend: 'lag' }),
      ], { decimals: 0, steps: under(100) }),
    ],
    [
      componentsTable(JOB, 8),
      timeseries('Backtest runs by outcome', 'Completed runs over time. success and error are the only two outcomes the service reports.', { w: 8, h: 7 }, [
        prom(`sum by (outcome) (increase(trading_bot_research_backtesting_runs_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Readiness lag over time', 'The data-readiness topic this service is triggered by. A lag that never returns to zero means no backtest will be scheduled again.', { w: 8, h: 7 }, [
        prom(LAG, { legend: '{{redpanda_topic}}' }),
      ], { unit: 'short', min: 0, steps: under(100), lines: true }),
    ],
    [
      timeseries('Replay throughput', 'Historical klines pulled out of ClickHouse and pushed through the strategy. This is what makes a backtest take the time it takes.', { w: 6, h: 8 }, [
        prom(`sum(rate(trading_bot_research_backtesting_replayed_klines_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'klines per second' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Signals and simulated trades', 'What the replay produced: signals the strategy emitted, and the trades those signals opened and closed. Signals without trades means the risk rules rejected every one.', { w: 6, h: 8 }, [
        prom(`sum(rate(trading_bot_research_backtesting_emitted_signals_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'signals' }),
        prom(`sum(rate(trading_bot_research_backtesting_simulated_trades_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'simulated trades' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Requests per second', 'The backtest API the control-plane calls, by route.', { w: 6, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95', 'By route. A backtest runs inside the request that asked for it, so on the backtest route this is the length of a backtest, not the cost of an HTTP call.', { w: 6, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket${SEL}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [failingTraces(JOB, 8, 10), logs('Backtests', 'Scheduled scans, batches processed, coverage the history could not satisfy and runs that failed.', { w: 8, h: 10 }, [
      loki(`{app="${JOB}"} | json | event=~"backtest.*|backtest_scan.*|trade_cache.*"`),
    ]), errorLogs(JOB, 8)],
  ],
};
