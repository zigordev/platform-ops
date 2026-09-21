import { RATE_INTERVAL } from './dashboard.ts';
import type { PanelSpec, Row } from './model.ts';
import { logs, stat, table, timeseries, traces, under, valueMap } from './panels.ts';
import { loki, prom, traceql } from './queries.ts';

export const HEALTH = valueMap({ '0': ['error', 'red'], '1': ['degraded', 'orange'], '2': ['ok', 'green'] });
export const UP = valueMap({ '0': ['down', 'red'], '1': ['up', 'green'] });

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
