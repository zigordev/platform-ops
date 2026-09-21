import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { PLATFORM } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, timeseries, under } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const CORES = 'count(count by (cpu) (node_cpu_seconds_total))';

export const platformHost: DashboardSpec = {
  uid: 'platform-host',
  title: 'Host',
  description: 'The one machine the estate runs on: CPU, load, memory, disk, network, and which service uses how much.',
  folder: PLATFORM,
  tags: ['host'],
  deploys: deploys(),
  rows: [
    [
      stat('CPU busy · 5 minutes', 'Share of all cores doing work.', { w: 4, h: 5 }, [
        prom('1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m]))', { legend: 'busy' }),
      ], { unit: 'percentunit', decimals: 0, steps: under(0.8) }),
      stat('Load per core', 'Five-minute load average divided by the cores. Above 1 the host is queueing work.', { w: 4, h: 5 }, [
        prom(`max(node_load5) / ${CORES}`, { legend: 'load' }),
      ], { decimals: 2, steps: under(1) }),
      stat('Memory available', 'Share of memory still available. Below 15% the host starts to swap.', { w: 4, h: 5 }, [
        prom('min(node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)', { legend: 'available' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.15) }),
      stat('Disk free', 'Free share of the disk. A ticket under 15%, a page under 5%.', { w: 4, h: 5 }, [
        prom('min(host:filesystem_avail:ratio)', { legend: 'free' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.15) }),
      stat('Up for', 'Time since the host last booted. It is switched off outside the power window.', { w: 4, h: 5 }, [
        prom('time() - max(node_boot_time_seconds)', { legend: 'up for' }),
      ], { unit: 'dtdurations' }),
      stat('Targets up', 'Scrape targets answering, out of all of them.', { w: 4, h: 5 }, [
        prom('count(up == 1) / count(up)', { legend: 'up' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(1) }),
    ],
    [
      timeseries('CPU by mode', 'Busy time by kind, as a share of all cores. iowait is the disk holding things up.', { w: 8, h: 8 }, [
        prom(`sum by (mode) (rate(node_cpu_seconds_total{mode!="idle"}[${RATE_INTERVAL}])) / scalar(${CORES})`, { legend: '{{mode}}' }),
      ], { unit: 'percentunit', min: 0, stack: true }),
      timeseries('Load', 'Load averages against the number of cores.', { w: 8, h: 8 }, [
        prom('max(node_load1)', { legend: '1 minute' }),
        prom('max(node_load5)', { legend: '5 minutes' }),
        prom(CORES, { legend: 'cores' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Memory', 'Available and total memory.', { w: 8, h: 8 }, [
        prom('min(node_memory_MemAvailable_bytes)', { legend: 'available' }),
        prom('max(node_memory_MemTotal_bytes)', { legend: 'total' }),
      ], { unit: 'bytes', min: 0 }),
    ],
    [
      timeseries('Disk free', 'Free share of the disk. The lines are the ticket and page thresholds.', { w: 8, h: 8 }, [
        prom('host:filesystem_avail:ratio', { legend: '{{device}}' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: [{ color: 'red', value: null }, { color: 'orange', value: 0.05 }, { color: 'green', value: 0.15 }], lines: true }),
      timeseries('Disk free in a day', 'Free bytes now, and where the last six hours say they will be in 24 hours.', { w: 8, h: 8 }, [
        prom('host:filesystem_avail_bytes:max', { legend: 'free · {{device}}' }),
        prom('predict_linear(host:filesystem_avail_bytes:max[6h], 86400)', { legend: 'in 24 hours · {{device}}' }),
      ], { unit: 'bytes' }),
      timeseries('Network', 'Bytes in and out of the host, container bridges excluded.', { w: 8, h: 8 }, [
        prom(`sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|docker.*|br-.*"}[${RATE_INTERVAL}]))`, { legend: 'in' }),
        prom(`sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|docker.*|br-.*"}[${RATE_INTERVAL}]))`, { legend: 'out' }),
      ], { unit: 'Bps', min: 0 }),
    ],
    [
      timeseries('Memory by service', 'Resident memory of the ten largest processes Prometheus scrapes.', { w: 12, h: 9 }, [
        prom('topk(10, max by (job) (process_resident_memory_bytes))', { legend: '{{job}}' }),
      ], { unit: 'bytes', min: 0 }),
      timeseries('CPU by service', 'CPU of the ten busiest processes Prometheus scrapes, in cores.', { w: 12, h: 9 }, [
        prom(`topk(10, sum by (job) (rate(process_cpu_seconds_total[${RATE_INTERVAL}])))`, { legend: '{{job}}' }),
      ], { unit: 'short', min: 0, decimals: 2 }),
    ],
  ],
};
