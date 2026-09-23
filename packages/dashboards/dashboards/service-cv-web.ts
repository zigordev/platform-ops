import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, slowTraces } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, table, timeseries, under, valueMap } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const JOB = 'cv-web';
const PAGE = `service="${JOB}", span_name="GET /", span_kind="SPAN_KIND_SERVER"`;

export const serviceCvWeb: DashboardSpec = {
  uid: 'service-cv-web',
  title: 'cv-web',
  description: 'The cv site as a service: page renders from traces, the API routes, the dependencies it reads at render time, runtime and failures.',
  folder: SERVICES,
  tags: ['service', 'cv'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      stat('Page views · 1 hour', 'Page renders traced in the last hour.', { w: 4, h: 5 }, [
        prom(`sum(increase(traces_spanmetrics_calls_total{${PAGE}}[1h]))`, { legend: 'renders' }),
      ], { decimals: 0 }),
      releaseStat(JOB),
      componentsTable(JOB, 12),
    ],
    [
      timeseries('Page render time', 'The server side of a page view, from Tempo. Hover a dot to open that render trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{${PAGE}}[${RATE_INTERVAL}])))`, { legend: 'p95', exemplar: true }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(traces_spanmetrics_latency_bucket{${PAGE}}[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0, steps: under(0.512), lines: true }),
      timeseries('Page latency objective', 'Share of renders under 512 ms over one and six hours. The line is the 95% objective.', { w: 8, h: 8 }, [
        prom('slo:page_latency:ratio_rate1h', { legend: '1h' }),
        prom('slo:page_latency:ratio_rate6h', { legend: '6h' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Renders by outcome', 'Server spans by name and status: not-found renders and errors show up here first.', { w: 8, h: 8 }, [
        prom(`sum by (span_name, status_code) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind="SPAN_KIND_SERVER"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}} · {{status_code}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    [
      timeseries('API requests', 'The routes cv measures: the question box, the contact form and the browser beacons.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('API responses by status', 'By route and status. 429 is a rate limit or a spent budget; 502 an upstream that failed.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{job="${JOB}", status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('API latency p95', 'By route. The question box waits for the model, so it is slower by design. Hover a dot to open the trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      timeseries('Outbound calls', 'Calls cv makes, by span name: the copy from Tolgee, flags from Unleash and the model are client spans; the contact email it publishes is a producer span, so both kinds are read here.', { w: 8, h: 7 }, [
        prom(`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind=~"SPAN_KIND_CLIENT|SPAN_KIND_PRODUCER"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Where the copy came from', 'Message loads by source. local or default_locale means Tolgee did not answer.', { w: 8, h: 7 }, [
        prom(`sum by (source) (rate(cv_i18n_messages_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{source}}' }),
      ], { unit: 'ops', min: 0 }),
      table('Feature flags', 'Each flag as cv read it last.', { w: 8, h: 7 }, [
        prom(`max by (flag) (cv_feature_flag_enabled{job="${JOB}"})`, { instant: true, table: true }),
      ], {
        mappings: valueMap({ '0': ['off', 'text'], '1': ['on', 'green'] }),
        hide: ['Time'],
        rename: { flag: 'Flag', Value: 'State' },
      }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [errorLogs(JOB, 24)],
  ],
};
