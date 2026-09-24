import { componentsTable, errorLogs, failingTraces, healthStat, pageLatencyObjective, pageRenderTime, releaseStat, runtimeRow, slowTraces } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'gpool-web';

export const serviceGpoolWeb: DashboardSpec = {
  uid: 'service-gpool-web',
  title: 'gpool-web',
  description: 'The pool site as a service: page renders from traces, the beacon routes visitors post to, the copy it reads at render time, runtime and failures. The runtime row, the release, the page-view count and the two rejection panels read today; health, the dependency table, the render panels, the beacon routes and everything from traces or logs arrive with gpool#283, and until it merges they are empty rather than wrong.',
  folder: SERVICES,
  tags: ['service', 'gpool'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      releaseStat(JOB),
      componentsTable(JOB, 8),
      stat('Page views · 1 hour', 'Page views the browsers reported in the last hour. The browsers already post these, so this tile does not wait on gpool#283.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{job="${JOB}", navigation_type="Page View"}[1h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('Beacons rejected · 24 hours', 'Browser reports thrown away before they became a metric: rate limited, malformed, an event type or name the allow-list does not have, or a batch over the size cap.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_rejected_total{job="${JOB}"}[24h])) or vector(0)`, { legend: 'rejected' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      pageRenderTime(JOB),
      pageLatencyObjective(JOB),
      timeseries('Renders by outcome', 'Server spans by route and status. A route that starts answering not-found or erroring shows up here first.', { w: 8, h: 8 }, [
        prom(`sum by (span_name, status_code) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind="SPAN_KIND_SERVER"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}} · {{status_code}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    [
      timeseries('Beacon routes', 'The two routes gpool-web measures: the RUM ingest and the policy-violation report endpoint. Both are public and unauthenticated by necessity.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Beacon route latency p95', 'How long ingest takes. It runs on the render path of nothing, but a slow ingest means beacons are dropped on unload. Hover a dot to open the trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
      timeseries('Beacons rejected by reason', 'The one RUM counter whose labels the server controls. rate_limited is a client looping or someone probing; malformed, unknown_type, bad_name and unrecordable are a beacon the ingest refused to turn into a label; batch_too_large is a client sending more events than one batch may carry.', { w: 8, h: 8 }, [
        prom(`sum by (reason) (increase(rum_rejected_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{reason}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Copy that did not come from Tolgee', 'Renders that fell back, by what they fell back to: cached is the last good export, local is the copy committed in the repo. A run of these means Tolgee is unreachable.', { w: 24, h: 8 }, [
        loki(`sum by (source) (count_over_time({app="${JOB}"} | json | event="i18n.fallback" [$__auto]))`, { legend: '{{source}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [errorLogs(JOB, 24)],
  ],
};
