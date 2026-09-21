import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { ESTATE } from '../lib/folders.ts';
import { HEALTH } from '../lib/common.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, table, timeseries, under, valueMap } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

export const estateOverview: DashboardSpec = {
  uid: 'estate-overview',
  title: 'Estate overview',
  description: 'Every service on the host at a glance: health, alerts, traffic, errors, the objectives and the machine underneath.',
  folder: ESTATE,
  tags: ['overview'],
  deploys: deploys(),
  rows: [
    [
      stat('Healthy', 'Services whose /health says ok.', { w: 4, h: 4 }, [
        prom('count(service_health_status == 2) or vector(0)', { legend: 'healthy' }),
      ], { steps: atLeast(1), decimals: 0 }),
      stat('Degraded', 'Services running without an optional dependency.', { w: 4, h: 4 }, [
        prom('count(service_health_status == 1) or vector(0)', { legend: 'degraded' }),
      ], { steps: under(1), decimals: 0 }),
      stat('In error', 'Services whose /health says error: a required dependency is gone.', { w: 4, h: 4 }, [
        prom('count(service_health_status == 0) or vector(0)', { legend: 'error' }),
      ], { steps: under(1), decimals: 0 }),
      stat('Targets down', 'Scrape targets Prometheus cannot reach, of any kind.', { w: 4, h: 4 }, [
        prom('count(up == 0) or vector(0)', { legend: 'down' }),
      ], { steps: under(1), decimals: 0 }),
      stat('Alerts firing', 'Alerts firing now, pages and tickets alike.', { w: 4, h: 4 }, [
        prom('count(ALERTS{alertstate="firing"}) or vector(0)', { legend: 'firing' }),
      ], { steps: under(1), decimals: 0 }),
      stat('Disk free', 'Free space on the host. A ticket under 15%, a page under 5%.', { w: 4, h: 4 }, [
        prom('min(host:filesystem_avail:ratio)', { legend: 'free' }),
      ], { unit: 'percentunit', steps: atLeast(0.15), decimals: 0 }),
    ],
    [
      table('Service health', 'Each service as its own /health reports it.', { w: 12, h: 8 }, [
        prom('max by (job) (service_health_status)', { instant: true, table: true }),
      ], {
        mappings: HEALTH,
        steps: [{ color: 'red', value: null }, { color: 'orange', value: 1 }, { color: 'green', value: 2 }],
        hide: ['Time'],
        rename: { job: 'Service', Value: 'Health' },
        sortBy: 'Health',
        desc: false,
      }),
      table('Alerts firing', 'Every alert firing now, with its severity and the service it names.', { w: 12, h: 8 }, [
        prom('max by (alertname, severity, job) (ALERTS{alertstate="firing"})', { instant: true, table: true }),
      ], {
        hide: ['Time', 'Value'],
        rename: { alertname: 'Alert', severity: 'Severity', job: 'Service' },
        sortBy: 'Severity',
        desc: false,
      }),
    ],
    [
      timeseries('Requests per second', 'API requests by service. Page views are counted from traces and at the edge, not here.', { w: 8, h: 8 }, [
        prom(`sum by (job) (rate(http_requests_total[${RATE_INTERVAL}]))`, { legend: '{{job}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Server error ratio', 'Share of API requests answered 5xx, by service. Empty while a service has no traffic.', { w: 8, h: 8 }, [
        prom('platform_api:http_error_ratio:rate5m', { legend: '{{job}}' }),
      ], { unit: 'percentunit', min: 0, steps: under(0.005), lines: true }),
      timeseries('API latency p95', 'By service. The dots are exemplars: hover one and open its trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (job, le) (rate(http_request_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: '{{job}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(0.5), lines: true }),
    ],
    [
      timeseries('Page latency objective · cv', 'Share of cv page renders under 512 ms. The objective is 95%.', { w: 8, h: 8 }, [
        prom('slo:page_latency:ratio_rate1h', { legend: '1h' }),
        prom('slo:page_latency:ratio_rate6h', { legend: '6h' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Email delivery objective', 'Share of emails sent within two minutes of the request. The objective is 99%.', { w: 8, h: 8 }, [
        prom('slo:delivery:ratio_rate1h', { legend: '1h' }),
        prom('slo:delivery:ratio_rate1d', { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.99), lines: true }),
      timeseries('Edge error ratio by site', 'Server errors as visitors saw them, from the ingress access log. Production only.', { w: 8, h: 8 }, [
        prom('edge:requests_5xx:rate5m / edge:requests:rate5m', { legend: '{{host}}' }),
      ], { unit: 'percentunit', min: 0, steps: under(0.01), lines: true }),
    ],
    [
      timeseries('Disk free', 'Free share of the host disk. The lines are the ticket and page thresholds.', { w: 6, h: 7 }, [
        prom('host:filesystem_avail:ratio', { legend: '{{device}}' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: [{ color: 'red', value: null }, { color: 'orange', value: 0.05 }, { color: 'green', value: 0.15 }], lines: true }),
      timeseries('Memory available', 'Share of host memory still available. Below 15% the host starts to swap.', { w: 6, h: 7 }, [
        prom('min(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)', { legend: 'available' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: atLeast(0.15), lines: true }),
      timeseries('Consumer lag', 'Messages written but not yet read, by consumer group and topic.', { w: 6, h: 7 }, [
        prom('kafka:consumer_group_lag:sum', { legend: '{{redpanda_group}} · {{redpanda_topic}}' }),
      ], { unit: 'short', min: 0, steps: under(1000), lines: true }),
      stat('Secret store', 'Whether OpenBao is unsealed. Sealed means no service can read its secrets at start.', { w: 6, h: 7 }, [
        prom('min(vault_core_unsealed)', { legend: 'unsealed' }),
      ], { mappings: valueMap({ '0': ['sealed', 'red'], '1': ['unsealed', 'green'] }), steps: atLeast(1) }),
    ],
  ],
};
