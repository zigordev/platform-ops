import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, slowTraces } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'kini-web';
const SERVER = `service="${JOB}", span_kind="SPAN_KIND_SERVER"`;

export const serviceKiniWeb: DashboardSpec = {
  uid: 'service-kini-web',
  title: 'kini-web',
  description:
    'The kini site as a service: page renders from traces, the two beacon routes the browser posts to, the copy it reads at render time, runtime and failures. Health, traces, the beacon routes and the log panels all arrive with kini#150; only the RUM counters read today, and those have their own dashboard.',
  folder: SERVICES,
  tags: ['service', 'kini'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      componentsTable(JOB, 8),
      releaseStat(JOB),
      stat('Page views · 1 hour', 'Page views the browsers reported in the last hour. The server does not count them: most navigation in kini happens in the client.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{job="${JOB}", navigation_type="Page View"}[1h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('CSP violations · 24 hours', 'Scripts or resources the policy did not allow. The page’s own scripts carry a nonce, so any count here is worth reading.', { w: 4, h: 5 }, [
        prom(`sum(increase(csp_violations_total{job="${JOB}"}[24h])) or vector(0)`, { legend: 'violations' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('Page render time', 'The server side of a page view, from Tempo. Hover a dot to open that render trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{${SERVER}}[${RATE_INTERVAL}])))`, { legend: 'p95', exemplar: true }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(traces_spanmetrics_latency_bucket{${SERVER}}[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0 }),
      timeseries('Renders by route and outcome', 'Server spans by name and status. kini renders several routes rather than one page, so a slow release usually shows up on one of them first.', { w: 8, h: 8 }, [
        prom(`sum by (span_name, status_code) (rate(traces_spanmetrics_calls_total{${SERVER}}[${RATE_INTERVAL}]))`, { legend: '{{span_name}} · {{status_code}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Calls it makes while rendering', 'Outbound spans: the copy from Tolgee and anything the server fetches from kini-api before it can answer.', { w: 8, h: 8 }, [
        prom(`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind="SPAN_KIND_CLIENT"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    [
      timeseries('Beacon requests', 'The only two routes kini-web measures server side: the RUM beacon and the CSP report endpoint. The pages themselves are in the render panels above.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Beacon responses that are not 2xx', 'By route and status. 403 is a cross-origin post, 413 a body over the cap, 400 a body that is not JSON. The endpoint answers nothing useful on purpose, so this is the only place the refusals show.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}", status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Beacons rejected', 'Beacons dropped before they reached a metric, by reason. rate_limited is one client looping or someone probing the endpoint.', { w: 8, h: 8 }, [
        prom(`sum by (reason) (increase(rum_rejected_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{reason}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [
      logs('Translations fell back', 'Every render that could not read fresh copy from Tolgee, with the locale and whether it used the cached copy or the message files in the repo. Falling back is not an outage; falling back for hours means the copy on the site is stale.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event="i18n.fallback"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
