import { RATE_INTERVAL } from './dashboard.ts';
import type { PanelSpec, Row } from './model.ts';
import { atLeast, logs, stat, table, timeseries, traces, under, valueMap, type Size } from './panels.ts';
import { loki, prom, traceql } from './queries.ts';

export const HEALTH = valueMap({ '0': ['error', 'red'], '1': ['degraded', 'orange'], '2': ['ok', 'green'] });
export const UP = valueMap({ '0': ['down', 'red'], '1': ['up', 'green'] });
export const SEAL = valueMap({ '-1': ['down', 'red'], '0': ['sealed', 'red'], '1': ['unsealed', 'green'] });

export function secretStoreStat(description: string, size: Size): PanelSpec {
  return stat('Secret store', description, size, [
    prom('max(vault_core_unsealed) == 1 or on () (max(up{job="openbao"}) - 1)', { legend: 'unsealed' }),
  ], { mappings: SEAL, steps: atLeast(1) });
}

export function healthStat(job: string): PanelSpec {
  return stat('Health', 'What the service says about itself on /health: ok, degraded (an optional dependency is down) or error.', { w: 4, h: 5 }, [
    prom(`max(service_health_status{job="${job}"})`, { legend: 'health' }),
  ], { mappings: HEALTH, steps: [{ color: 'red', value: null }, { color: 'orange', value: 1 }, { color: 'green', value: 2 }] });
}

export function upStat(job: string): PanelSpec {
  return stat('Scraped', 'Whether Prometheus reaches the service at all. Down here and silent everywhere else means the process is gone.', { w: 4, h: 5 }, [
    prom(`min(up{job="${job}"})`, { legend: 'up' }),
  ], { mappings: UP, steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }] });
}

export function releaseStat(job: string): PanelSpec {
  return stat('Release', 'The release the running process reports. Deploys are marked on every graph below.', { w: 4, h: 5 }, [
    prom(`max by (version) (service_build_info{job="${job}"})`, { legend: '{{version}}' }),
  ], { text: 'name' });
}

export function componentsTable(job: string, w: number): PanelSpec {
  return table('Dependencies', 'Each dependency as /health last saw it. A dependency that was never probed has no row.', { w, h: 5 }, [
    prom(`max by (component) (service_component_up{job="${job}"})`, { instant: true, table: true }),
  ], {
    mappings: UP,
    steps: [{ color: 'red', value: null }, { color: 'green', value: 1 }],
    hide: ['Time'],
    rename: { component: 'Dependency', Value: 'State' },
  });
}

export function runtimeRow(job: string): Row {
  return [
    timeseries('CPU', 'CPU time the process uses, in cores.', { w: 8, h: 7 }, [
      prom(`sum(rate(process_cpu_seconds_total{job="${job}"}[${RATE_INTERVAL}]))`, { legend: 'cores' }),
    ], { unit: 'short', min: 0, decimals: 2 }),
    timeseries('Memory', 'Resident memory of the process.', { w: 8, h: 7 }, [
      prom(`max(process_resident_memory_bytes{job="${job}"})`, { legend: 'resident' }),
    ], { unit: 'bytes', min: 0 }),
    timeseries('Event loop lag p99', 'How long callbacks wait for the event loop. Above 100 ms, every request is late.', { w: 8, h: 7 }, [
      prom(`max(nodejs_eventloop_lag_p99_seconds{job="${job}"})`, { legend: 'p99' }),
    ], { unit: 's', min: 0, steps: under(0.1), lines: true }),
  ];
}

export const PAGE_RENDER = 'span_kind="SPAN_KIND_SERVER", span_name=~"(RSC )?GET /.*", span_name!~"(RSC )?GET /(_next|_not-found|api|health|metrics|rum)(/.*)?", span_name!~".*[.][A-Za-z0-9]+"';

export function pageViewsStat(job: string): PanelSpec {
  return stat('Page views · 1 hour', 'Page and navigation renders traced in the last hour. Probe, API, asset and not-found spans are left out, the same way the objective leaves them out.', { w: 4, h: 5 }, [
    prom(`sum(increase(slo:page_render:latency_count{job="${job}"}[1h]))`, { legend: 'renders' }),
  ], { decimals: 0 });
}

export function pageRenderTime(job: string, w = 8): PanelSpec {
  return timeseries('Page render time', 'The server side of a page view, by route, from Tempo. Hover a dot to open that render trace.', { w, h: 8 }, [
    prom(`histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="${job}", ${PAGE_RENDER}}[${RATE_INTERVAL}])))`, { legend: 'p95', exemplar: true }),
    prom(`histogram_quantile(0.5, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="${job}", ${PAGE_RENDER}}[${RATE_INTERVAL}])))`, { legend: 'p50' }),
  ], { unit: 's', min: 0, steps: under(0.512), lines: true });
}

export function pageLatencyObjective(job: string, w = 8, h = 8): PanelSpec {
  return timeseries('Page latency objective', 'Share of page renders under 512 ms over one and six hours. The line is the 95% objective, and it is the same measurement on every web app. A service that renders no pages has no line here.', { w, h }, [
    prom(`slo:page_latency:ratio_rate1h{job="${job}"}`, { legend: '1h' }),
    prom(`slo:page_latency:ratio_rate6h{job="${job}"}`, { legend: '6h' }),
  ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true });
}

export function failingTraces(service: string, w: number, h = 10): PanelSpec {
  return traces('Failing traces', 'The latest traces with a span in error. Select a trace id to open it.', { w, h }, [
    traceql(`{ resource.service.name = "${service}" && status = error }`),
  ]);
}

export function slowTraces(service: string, threshold: string, w: number, h = 10): PanelSpec {
  return traces('Slow traces', `The latest server spans slower than ${threshold}. Select a trace id to open it.`, { w, h }, [
    traceql(`{ resource.service.name = "${service}" && kind = server && duration > ${threshold} }`),
  ]);
}

export function errorLogs(app: string, w: number, h = 10): PanelSpec {
  return logs('Errors and warnings', 'Error and warning lines, newest first. A line with a trace id has a button that opens the trace.', { w, h }, [
    loki(`{app="${app}"} | json | level=~"error|warn"`),
  ]);
}
