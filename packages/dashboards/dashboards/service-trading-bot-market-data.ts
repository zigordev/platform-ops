import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { gauge, logs, stat, timeseries, under, type Step } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'trading-bot-market-data';
const SEL = `{job="${JOB}"}`;

const WEIGHT: Step[] = [
  { color: 'green', value: null },
  { color: 'orange', value: 0.9 },
  { color: 'red', value: 1 },
];

export const serviceTradingBotMarketData: DashboardSpec = {
  uid: 'service-trading-bot-market-data',
  title: 'trading-bot-market-data',
  description:
    'The Rust service that holds the Binance websocket open, publishes every kline and trade to Kafka, stores them in ClickHouse and backfills the gaps. Its budget against the Binance REQUEST_WEIGHT ceiling is the panel to read first. trading-bot is local only: no deploy, no production scrape job. Health, dependencies, release and the ingest log panel all come from trading-bot#158 — that branch is where a Rust log line first carries an event name at all — so they stay empty until it merges and the container is rebuilt. The metrics and the traces are live now.',
  folder: SERVICES,
  tags: ['service', 'trading-bot'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [healthStat(JOB), upStat(JOB), releaseStat(JOB), componentsTable(JOB, 12)],
    [
      stat('Klines published · 1 hour', 'Closed candles handed to Kafka. One per subscription per timeframe, so this should track the subscription count.', { w: 4, h: 5 }, [
        prom(`sum(increase(trading_bot_market_data_kline_publish_total${SEL}[1h])) or vector(0)`, { legend: 'klines' }),
      ], { decimals: 0 }),
      stat('Trades published · 1 hour', 'Aggregate trades handed to Kafka. This follows how busy the market is, not the configuration.', { w: 4, h: 5 }, [
        prom(`sum(increase(trading_bot_market_data_trade_publish_total${SEL}[1h])) or vector(0)`, { legend: 'trades' }),
      ], { decimals: 0 }),
      stat('Kline subscriptions', 'Pair and timeframe combinations the stream is subscribed to right now.', { w: 4, h: 5 }, [
        prom(`max(trading_bot_market_data_active_kline_subscriptions${SEL})`, { legend: 'subscriptions' }),
      ], { decimals: 0 }),
      stat('Pair subscriptions', 'Pairs subscribed at the pair level, for aggregate trades.', { w: 4, h: 5 }, [
        prom(`max(trading_bot_market_data_active_pair_subscriptions${SEL})`, { legend: 'pairs' }),
      ], { decimals: 0 }),
      gauge('Binance weight used', 'Share of the REQUEST_WEIGHT ceiling spent in the current minute. The local limiter aims at 90% of it; past the ceiling Binance answers 429 and then bans the address.', { w: 4, h: 5 }, [
        prom(`max(trading_bot_market_data_binance_rest_used_weight_1m${SEL}) / max(trading_bot_market_data_binance_rest_limit_weight_1m${SEL})`, { legend: 'used' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: WEIGHT }),
      stat('Store failures · 1 hour', 'Klines and trades that reached the service and could not be written to ClickHouse. Each one is a hole in the history a backtest will read.', { w: 4, h: 5 }, [
        prom(`sum(increase(trading_bot_market_data_kline_store_failures_total${SEL}[1h])) + sum(increase(trading_bot_market_data_trade_store_failures_total${SEL}[1h]))`, { legend: 'failures' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('Events published', 'Klines and trades leaving for Kafka. Trades stop first when the websocket drops, because klines only close once a minute.', { w: 8, h: 8 }, [
        prom(`sum(rate(trading_bot_market_data_kline_publish_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'klines' }),
        prom(`sum(rate(trading_bot_market_data_trade_publish_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'trades' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Binance REQUEST_WEIGHT', 'Weight spent in the current minute, against the target the limiter holds itself to and the ceiling Binance enforces.', { w: 8, h: 8 }, [
        prom(`max(trading_bot_market_data_binance_rest_used_weight_1m${SEL})`, { legend: 'used' }),
        prom(`max(trading_bot_market_data_binance_rest_target_weight_1m${SEL})`, { legend: 'target' }),
        prom(`max(trading_bot_market_data_binance_rest_limit_weight_1m${SEL})`, { legend: 'ceiling' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Binance REST requests', 'Calls to Binance by endpoint and outcome. Klines are the backfill; aggTrades is the trade gap repair.', { w: 8, h: 8 }, [
        prom(`sum by (path, outcome) (rate(trading_bot_market_data_binance_rest_requests_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{path}} · {{outcome}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    [
      timeseries('Rate-limit responses', 'The 429s and 418s Binance actually sent, by endpoint. Anything here means the local limiter was already too late.', { w: 6, h: 7 }, [
        prom(`sum by (path, status) (increase(trading_bot_market_data_binance_rest_rate_limit_responses_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{path}} · {{status}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Limiter delays', 'How often the local limiter held a request back rather than spend weight it had already budgeted away. Rising delays mean the budget is too small for the subscriptions.', { w: 6, h: 7 }, [
        prom(`sum(rate(trading_bot_market_data_binance_rest_limiter_waits_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'delays' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Mean limiter wait', 'How long a delayed call waited, on average. Read it next to the delay rate: a few long waits and many short ones are different problems.', { w: 6, h: 7 }, [
        prom(`sum(rate(trading_bot_market_data_binance_rest_limiter_wait_ms_total${SEL}[${RATE_INTERVAL}])) / sum(rate(trading_bot_market_data_binance_rest_limiter_waits_total${SEL}[${RATE_INTERVAL}])) / 1000`, { legend: 'mean wait' }),
      ], { unit: 's', min: 0 }),
      timeseries('Backfill and configuration', 'Backfill and gap-repair runs by outcome, and how the runtime configuration refresh went. A failed refresh leaves the stream subscribed to yesterday’s pairs.', { w: 6, h: 7 }, [
        prom(`sum by (outcome) (increase(trading_bot_market_data_backfill_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'backfill · {{outcome}}' }),
        prom(`sum by (outcome) (increase(trading_bot_market_data_config_refresh_total${SEL}[${RATE_INTERVAL}]))`, { legend: 'config · {{outcome}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Requests per second', 'The read API the other services call: recent klines and trades, replay and backtest readiness.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95', 'By route. Replay reads a window out of ClickHouse, so it is the slow one by design.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket${SEL}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
      failingTraces(JOB, 8, 8),
    ],
    [
      logs('Ingest and backfill', 'Backfill plans and completions, trade gap repairs, compactions, failed readiness snapshots and every time the limiter delayed a call.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event=~"kline_backfill.*|trade_backfill.*|trade_gap_repair.*|compaction.*|data_readiness.*|binance.limiter_delayed|subscriptions.refreshed"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
