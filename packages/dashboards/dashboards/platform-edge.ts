import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { PLATFORM } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, table, timeseries, under, valueMap } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

export const platformEdge: DashboardSpec = {
  uid: 'platform-edge',
  title: 'Edge',
  description: 'Every site as visitors reach it through the ingress: requests, server errors and latency by site, and the upstreams behind them. Production only.',
  folder: PLATFORM,
  tags: ['edge'],
  deploys: deploys(),
  rows: [
    [
      timeseries('Requests by site', 'From the ingress access log.', { w: 8, h: 8 }, [
        prom('edge:requests:rate5m', { legend: '{{host}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Server error ratio by site', 'Share of requests answered 5xx at the edge, including the ingress’s own errors.', { w: 8, h: 8 }, [
        prom('edge:requests_5xx:rate5m / edge:requests:rate5m', { legend: '{{host}}' }),
      ], { unit: 'percentunit', min: 0, steps: under(0.01), lines: true }),
      timeseries('Latency p95 by site', 'Time the ingress spent on a request, upstream included.', { w: 8, h: 8 }, [
        prom('edge:latency_p95_seconds:5m', { legend: '{{host}}' }),
      ], { unit: 's', min: 0, steps: under(2), lines: true }),
    ],
    [
      timeseries('Responses by status', 'Everything the ingress answered, by status code.', { w: 12, h: 8 }, [
        prom(`sum by (code) (rate(caddy_http_request_duration_seconds_count[${RATE_INTERVAL}]))`, { legend: '{{code}}' }),
      ], { unit: 'reqps', min: 0, stack: true }),
      table('Upstreams', 'Whether the ingress can reach each service behind it.', { w: 12, h: 8 }, [
        prom('max by (upstream) (caddy_reverse_proxy_upstreams_healthy)', { instant: true, table: true }),
      ], {
        mappings: valueMap({ '0': ['down', 'red'], '1': ['healthy', 'green'] }),
        steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }],
        hide: ['Time'],
        rename: { upstream: 'Upstream', Value: 'State' },
      }),
    ],
    [
      logs('Server errors', 'Requests answered 5xx, newest first.', { w: 12, h: 10 }, [
        loki('{service="central-ingress"} | json | status >= 500'),
      ]),
      logs('Slow requests', 'Requests that took longer than two seconds.', { w: 12, h: 10 }, [
        loki('{service="central-ingress"} | json | duration > 2'),
      ]),
    ],
  ],
};
