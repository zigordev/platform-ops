import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, slowTraces, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'trading-bot-control-plane';
const PROJECTIONS = 'kafka:consumer_group_lag:sum{redpanda_group=~"trading-bot-control-plane-.*"}';

export const serviceTradingBotControlPlane: DashboardSpec = {
  uid: 'service-trading-bot-control-plane',
  title: 'trading-bot-control-plane',
  description:
    'The Fastify API the console and the three Rust services read their configuration from: its routes, the Postgres it owns, and the projections it builds from Kafka. trading-bot is local only — it has no deploy and no production scrape job, so this dashboard is empty against prod by design. Everything here reads locally today except the starts and stops panel, which needs the lifecycle events trading-bot#158 adds.',
  folder: SERVICES,
  tags: ['service', 'trading-bot'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      upStat(JOB),
      releaseStat(JOB),
      stat('Restarts · 1 hour', 'Process starts in the last hour. A deploy counts once; more than that is a crash loop.', { w: 4, h: 5 }, [
        prom(`sum(changes(process_start_time_seconds{job="${JOB}"}[1h]))`, { legend: 'restarts' }),
      ], { steps: under(2), decimals: 0 }),
      componentsTable(JOB, 8),
    ],
    [
      timeseries('Requests per second', 'By route. The Rust services poll runtime-config and the console polls the ops routes, so a flat line here is normal and a gap is not.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Responses that are not 2xx', 'By route and status. A 4xx here is usually the console asking for something that was deleted; a 5xx is the control-plane itself.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}", status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95', 'By route. The dots are exemplars: hover one and open its trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(0.5), lines: true }),
    ],
    [
      timeseries('Database calls', 'Queries and connections, by span name, from Tempo. This is the only view of what the control-plane asks Postgres for.', { w: 8, h: 8 }, [
        prom(`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind="SPAN_KIND_CLIENT"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Database call time p95', 'How long a query takes. A pool that has run out of connections shows up here before it shows up in the route latency.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, span_name) (rate(traces_spanmetrics_latency_bucket{service="${JOB}", span_kind="SPAN_KIND_CLIENT"}[${RATE_INTERVAL}])))`, { legend: '{{span_name}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
      timeseries('Projection lag', 'Messages the control-plane has not yet folded into its read models: backtest results, backtest progress and data readiness. Lag that never returns to zero means a projection consumer stopped.', { w: 8, h: 8 }, [
        prom(PROJECTIONS, { legend: '{{redpanda_group}}' }),
      ], { unit: 'short', min: 0, steps: under(1000), lines: true }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [
      errorLogs(JOB, 12),
      timeseries('Starts and stops', 'Every time the process announced that it had started or was shutting down. From the logs.', { w: 12, h: 10 }, [
        loki(`sum(count_over_time({app="${JOB}"} | json | event="service.started" [$__auto]))`, { legend: 'started' }),
        loki(`sum(count_over_time({app="${JOB}"} | json | event="service.stopping" [$__auto]))`, { legend: 'stopping' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
  ],
};
