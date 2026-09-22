import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, slowTraces } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'gpool-api';

export const serviceGpoolApi: DashboardSpec = {
  uid: 'service-gpool-api',
  title: 'gpool-api',
  description: 'The pool API: its routes, the objectives they are held to, what people do with pools and predictions, the emails it asks for, runtime and failures.',
  folder: SERVICES,
  tags: ['service', 'gpool'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      releaseStat(JOB),
      componentsTable(JOB, 8),
      stat('Pools created · 24 hours', 'New pools in the last day. Zero is normal on a quiet day; it is only worth reading next to the invitations below.', { w: 4, h: 5 }, [
        prom(`sum(increase(gpool_pool_actions_total{job="${JOB}", action="created"}[24h])) or vector(0)`, { legend: 'created' }),
      ], { decimals: 0 }),
      stat('Predictions · 24 hours', 'Predictions submitted in the last day. This is the one thing the product exists to collect.', { w: 4, h: 5 }, [
        prom(`sum(increase(gpool_predictions_total{job="${JOB}", action="submitted"}[24h])) or vector(0)`, { legend: 'submitted' }),
      ], { decimals: 0 }),
    ],
    [
      timeseries('Requests per second', 'By route. The route is the Express pattern, so every pool shares one series.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Responses that were not 2xx', 'By route and status. 401 and 403 on the pool routes are someone without access; 5xx is ours.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}", status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95 by route', 'From the request histogram, not from traces: every server span gpool-api emits is named after the method alone, so traces cannot tell the routes apart.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}' }),
      ], { unit: 's', min: 0, steps: under(0.5), lines: true }),
    ],
    [
      timeseries('Availability', 'Share of requests not answered 5xx over one hour and one day. The line is the 99.5% objective.', { w: 8, h: 7 }, [
        prom(`slo:availability:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:availability:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.995), lines: true }),
      timeseries('Latency objective', 'Share of requests answered within 500 ms over one hour and one day. The line is the 95% objective.', { w: 8, h: 7 }, [
        prom(`slo:latency:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:latency:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Time in Postgres and the broker', 'p95 of the calls gpool-api makes, by span name. A slow route is usually one slow query underneath it.', { w: 8, h: 7 }, [
        prom(`histogram_quantile(0.95, sum by (le, span_name) (rate(traces_spanmetrics_latency_bucket{service="${JOB}", span_kind="SPAN_KIND_CLIENT"}[${RATE_INTERVAL}])))`, { legend: '{{span_name}}' }),
      ], { unit: 's', min: 0 }),
    ],
    [
      timeseries('Pool lifecycle', 'Every action on a pool: created, joined, invited, accepted, access asked for and granted, configured, deleted.', { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(gpool_pool_actions_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Predictions', 'Predictions submitted and cleared. Clearing is a player changing their mind, not a failure.', { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(gpool_predictions_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Emails gpool asked for', 'By template and outcome. queued reached the broker, skipped was deliberate, failed never left gpool.', { w: 8, h: 8 }, [
        prom(`sum by (template, outcome) (increase(gpool_notifications_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{template}} · {{outcome}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [
      logs('Pools and emails', 'What happened to pools and to the emails they trigger, newest first. Pool and user ids are here; addresses never are.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event=~"pool.*|notification.*"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
