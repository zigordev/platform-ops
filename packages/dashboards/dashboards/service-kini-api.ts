import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, slowTraces } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'kini-api';

export const serviceKiniApi: DashboardSpec = {
  uid: 'service-kini-api',
  title: 'kini-api',
  description:
    'The kini API: the lottery feeds it scrapes and how each one fails, the weekly pool sync, invitation emails, the live pool socket, its routes, runtime and failures.',
  folder: SERVICES,
  tags: ['service', 'kini'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      componentsTable(JOB, 8),
      releaseStat(JOB),
      stat('Feed problems · 7 days', 'Everything the lottery feeds did wrong in the last week, counted together. The sync runs weekly, so this covers one run.', { w: 4, h: 5 }, [
        prom(`sum(increase(kini_pools_sync_problems_total{job="${JOB}"}[7d])) or vector(0)`, { legend: 'problems' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Socket clients', 'Browsers holding the pool socket open right now. Pool and match updates are pushed to these.', { w: 4, h: 5 }, [
        prom(`max(kini_websocket_clients{job="${JOB}"}) or vector(0)`, { legend: 'connected' }),
      ], { decimals: 0 }),
    ],
    [
      table('Upstream feeds and their problems', 'The single most useful table here. Each row is one lottery feed kini scrapes and one way it went wrong: failed is a fetch or a parse that threw, empty is a feed that answered with nothing in it, unmapped is a document that parsed but held no usable pool. kini creates every feed and problem pair at zero when it starts, so every one of them is listed whether or not it has ever been read: a zero says only that nothing went wrong in the range, never that the feed was read successfully. Scheduled syncs and the feed problem log below are what tell a healthy feed from one nobody asked for. The source all is the whole run failing rather than one feed.', { w: 10, h: 9 }, [
        prom(`sum by (source, problem) (increase(kini_pools_sync_problems_total{job="${JOB}"}[$__range]))`, { instant: true, table: true }),
      ], {
        decimals: 0,
        steps: under(1),
        hide: ['Time'],
        rename: { source: 'Feed', problem: 'Problem', Value: 'Count' },
        sortBy: 'Count',
      }),
      timeseries('Feed problems over time', 'The same counts as the table, spread over the range, so a feed that broke on one day stands apart from one that has been broken for weeks.', { w: 14, h: 9 }, [
        prom(`sum by (source, problem) (increase(kini_pools_sync_problems_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{source}} · {{problem}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Scheduled syncs', 'The weekly cron, Mondays at 08:00. One bar a week is the whole of the expected traffic. A gap longer than a week means the scheduler is not running, which is what PoolsSyncSchedulerDead watches for.', { w: 8, h: 7 }, [
        prom(`sum by (outcome) (increase(kini_pools_sync_runs_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Invitation emails', 'Team invitations kini handed to the broker for notifications to send. failed means the publish threw, so the invitation was never queued and the person who sent it saw an error.', { w: 8, h: 7 }, [
        prom(`sum by (template, outcome) (increase(kini_notifications_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{template}} · {{outcome}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Socket clients over time', 'Connected browsers. A drop to zero while the site is being used means the gateway restarted and every client has to reconnect.', { w: 8, h: 7 }, [
        prom(`max(kini_websocket_clients{job="${JOB}"})`, { legend: 'connected' }),
      ], { unit: 'short', min: 0 }),
    ],
    [
      timeseries('Requests by route', 'Every route, as the Express route pattern rather than the resolved path.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Responses that are not 2xx', 'By route and status. 401 on /auth routes is a visitor who is not signed in; 500 is the one to read.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}", status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95 by route', 'The routes that touch the lottery feeds are slower by design: /available-pools/jackpot syncs on demand when it has no jackpot to show. Hover a dot to open the trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      timeseries('Availability objective', 'Share of requests that did not return 5xx, over one hour and one day. The line is the 99.5% objective.', { w: 8, h: 8 }, [
        prom(`slo:availability:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:availability:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.995), lines: true }),
      timeseries('Latency objective', 'Share of requests answered within 500 ms, over one hour and one day. The line is the 95% objective.', { w: 8, h: 8 }, [
        prom(`slo:latency:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:latency:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Outbound calls', 'Calls kini makes, by span name: Postgres queries and the lottery pages and PDFs it fetches are client spans; the invitation it publishes is a producer span, so both kinds are read here.', { w: 8, h: 8 }, [
        prom(`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind=~"SPAN_KIND_CLIENT|SPAN_KIND_PRODUCER"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [
      logs('Feed problems', 'Every feed problem, newest first, with the URL that was fetched and the reason it did not work. This is where you find out that a page changed shape.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event=~"pools_sync.failed|pools_sync.empty|pools_sync.unmapped"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
