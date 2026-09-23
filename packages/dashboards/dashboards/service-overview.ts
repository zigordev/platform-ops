import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow, upStat } from '../lib/common.ts';
import { deploys, jobVariable, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, timeseries, under } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const JOB = '$job';

const ANY_SERVICE = '{__name__=~"service_health_status|service_build_info|http_requests_total"}';

export const serviceOverview: DashboardSpec = {
  uid: 'service-overview',
  title: 'Service overview',
  description:
    'Any service, picked from the list: health, requests, errors, latency with traces, its objectives, runtime and logs. The list is every job that announces itself the way the observability kit does, so the Rust services are in it too; their runtime row stays empty, because a Rust process publishes no event loop or process metrics.',
  folder: SERVICES,
  tags: ['service'],
  variables: [jobVariable(ANY_SERVICE, 'Service')],
  deploys: deploys('{job="$job"}'),
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
      timeseries('Requests per second', 'By route. Only routes the service measures appear here.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Server error ratio', 'Share of requests answered 5xx. Empty while there is no traffic.', { w: 8, h: 8 }, [
        prom(`sum(rate(http_requests_total{job="${JOB}", status=~"5.."}[${RATE_INTERVAL}])) / sum(rate(http_requests_total{job="${JOB}"}[${RATE_INTERVAL}]))`, { legend: '5xx' }),
      ], { unit: 'percentunit', min: 0, steps: under(0.005), lines: true }),
      timeseries('Latency p95', 'By route. The dots are exemplars: hover one and open its trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{job="${JOB}"}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(0.5), lines: true }),
    ],
    [
      timeseries('Server spans p95', 'Latency of every server span Tempo received, by span name. Hover a dot to open that trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, span_name) (rate(traces_spanmetrics_latency_bucket{service="${JOB}", span_kind="SPAN_KIND_SERVER"}[${RATE_INTERVAL}])))`, { legend: '{{span_name}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
      timeseries('Server spans per second', 'Traced requests by span name, including page renders that no route metric counts.', { w: 8, h: 8 }, [
        prom(`sum by (span_name) (rate(traces_spanmetrics_calls_total{service="${JOB}", span_kind="SPAN_KIND_SERVER"}[${RATE_INTERVAL}]))`, { legend: '{{span_name}}' }),
      ], { unit: 'reqps', min: 0 }),
      failingTraces(JOB, 8, 8),
    ],
    [
      timeseries('Availability', 'Share of requests not answered 5xx over one hour and one day. The line is the 99.5% objective.', { w: 8, h: 7 }, [
        prom(`slo:availability:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:availability:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.995), lines: true }),
      timeseries('Latency', 'Share of requests answered within 500 ms over one hour and one day. The line is the 95% objective.', { w: 8, h: 7 }, [
        prom(`slo:latency:ratio_rate1h{job="${JOB}"}`, { legend: '1h' }),
        prom(`slo:latency:ratio_rate1d{job="${JOB}"}`, { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Dependencies over time', 'Each dependency as /health saw it: 1 is up, 0 is down.', { w: 8, h: 7 }, [
        prom(`max by (component) (service_component_up{job="${JOB}"})`, { legend: '{{component}}' }),
      ], { unit: 'short', min: 0, max: 1, decimals: 0 }),
    ],
    runtimeRow(JOB),
    [errorLogs(JOB, 24)],
  ],
};
