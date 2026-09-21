import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { PLATFORM } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, timeseries, under, valueMap } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const STACK = 'prometheus|alertmanager|loki|tempo|grafana|alloy|otel-collector|openbao|caddy|node-exporter';

export const platformStack: DashboardSpec = {
  uid: 'platform-stack',
  title: 'Observability and messaging',
  description: 'The tools that watch everything else, and the broker: Prometheus, Loki, Tempo, the collector, Alertmanager, OpenBao and Redpanda.',
  folder: PLATFORM,
  tags: ['stack'],
  deploys: deploys(),
  rows: [
    [
      stat('Series in memory', 'Active series in Prometheus. A jump means a label that grows without bound.', { w: 4, h: 5 }, [
        prom('max(prometheus_tsdb_head_series)', { legend: 'series' }),
      ], { decimals: 0 }),
      stat('Rule failures · 1 hour', 'Recording and alerting rules that failed to evaluate, in Prometheus and in Loki.', { w: 4, h: 5 }, [
        prom('(sum(increase(prometheus_rule_evaluation_failures_total[1h])) or vector(0)) + (sum(increase(cortex_prometheus_rule_evaluation_failures_total[1h])) or vector(0))', { legend: 'failures' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Alert emails failed · 24 hours', 'Emails Alertmanager could not send. When this is not zero, alerts are not reaching you.', { w: 4, h: 5 }, [
        prom('sum(increase(alertmanager_notifications_failed_total[24h])) or vector(0)', { legend: 'failed' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Spans dropped · 1 hour', 'Spans refused by the collector, lost exporting, or discarded by Tempo.', { w: 4, h: 5 }, [
        prom('(sum(increase(otelcol_receiver_refused_spans[1h])) or vector(0)) + (sum(increase(otelcol_exporter_send_failed_spans[1h])) or vector(0)) + (sum(increase(tempo_discarded_spans_total[1h])) or vector(0))', { legend: 'dropped' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Secret store', 'Whether OpenBao is unsealed.', { w: 4, h: 5 }, [
        prom('min(vault_core_unsealed)', { legend: 'unsealed' }),
      ], { mappings: valueMap({ '0': ['sealed', 'red'], '1': ['unsealed', 'green'] }), steps: atLeast(1) }),
      stat('Broker', 'Whether Prometheus reaches Redpanda.', { w: 4, h: 5 }, [
        prom('min(up{job="redpanda"})', { legend: 'broker' }),
      ], { mappings: valueMap({ '0': ['down', 'red'], '1': ['up', 'green'] }), steps: atLeast(1) }),
    ],
    [
      timeseries('Samples appended', 'Samples per second Prometheus writes, from scrapes and from the remote writes of Tempo and Loki.', { w: 8, h: 8 }, [
        prom(`sum(rate(prometheus_tsdb_head_samples_appended_total[${RATE_INTERVAL}]))`, { legend: 'samples' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Log lines', 'Lines Alloy shipped and dropped, and lines Loki received.', { w: 8, h: 8 }, [
        prom(`sum(rate(loki_write_sent_entries_total[${RATE_INTERVAL}]))`, { legend: 'shipped by Alloy' }),
        prom(`sum(rate(loki_write_dropped_entries_total[${RATE_INTERVAL}]))`, { legend: 'dropped by Alloy' }),
        prom(`sum(rate(loki_distributor_lines_received_total[${RATE_INTERVAL}]))`, { legend: 'received by Loki' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Spans', 'Spans the collector exported or failed to export, and spans Tempo received.', { w: 8, h: 8 }, [
        prom(`sum(rate(otelcol_exporter_sent_spans[${RATE_INTERVAL}]))`, { legend: 'exported by the collector' }),
        prom(`sum(rate(otelcol_exporter_send_failed_spans[${RATE_INTERVAL}]))`, { legend: 'failed to export' }),
        prom(`sum(rate(tempo_distributor_spans_received_total[${RATE_INTERVAL}]))`, { legend: 'received by Tempo' }),
      ], { unit: 'short', min: 0 }),
    ],
    [
      timeseries('Alerts in Alertmanager', 'Alerts by state: active, or suppressed by an inhibition or a silence.', { w: 8, h: 8 }, [
        prom('sum by (state) (alertmanager_alerts)', { legend: '{{state}}' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Alert emails', 'Notifications sent and failed, by integration.', { w: 8, h: 8 }, [
        prom(`sum by (integration) (increase(alertmanager_notifications_total[${RATE_INTERVAL}]))`, { legend: 'sent · {{integration}}' }),
        prom(`sum by (integration) (increase(alertmanager_notifications_failed_total[${RATE_INTERVAL}]))`, { legend: 'failed · {{integration}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Prometheus storage', 'Persisted blocks and the write-ahead log.', { w: 8, h: 8 }, [
        prom('max(prometheus_tsdb_storage_blocks_bytes)', { legend: 'blocks' }),
        prom('max(prometheus_tsdb_wal_storage_size_bytes)', { legend: 'write-ahead log' }),
      ], { unit: 'bytes', min: 0 }),
    ],
    [
      timeseries('Consumer lag', 'Messages written and not yet read, by consumer group and topic.', { w: 8, h: 8 }, [
        prom('kafka:consumer_group_lag:sum', { legend: '{{redpanda_group}} · {{redpanda_topic}}' }),
      ], { unit: 'short', min: 0, steps: under(1000), lines: true }),
      timeseries('Consumers', 'Members in each consumer group. Zero means nothing is reading.', { w: 8, h: 8 }, [
        prom('max by (redpanda_group) (redpanda_kafka_consumer_group_consumers)', { legend: '{{redpanda_group}}' }),
      ], { unit: 'short', min: 0, decimals: 0 }),
      timeseries('Messages written', 'Messages per second, by topic.', { w: 8, h: 8 }, [
        prom(`sum by (redpanda_topic) (rate(redpanda_kafka_max_offset{redpanda_namespace="kafka"}[${RATE_INTERVAL}]))`, { legend: '{{redpanda_topic}}' }),
      ], { unit: 'short', min: 0 }),
    ],
    [
      timeseries('Memory by component', 'Resident memory of each part of the stack. Tempo is capped at 512 MiB.', { w: 12, h: 8 }, [
        prom(`max by (job) (process_resident_memory_bytes{job=~"${STACK}"})`, { legend: '{{job}}' }),
      ], { unit: 'bytes', min: 0 }),
      timeseries('Tempo', 'Traces held in memory, and spans the metrics generator dropped.', { w: 12, h: 8 }, [
        prom('sum(tempo_ingester_live_traces)', { legend: 'live traces' }),
        prom(`sum(rate(tempo_metrics_generator_spans_discarded_total[${RATE_INTERVAL}]))`, { legend: 'generator discards' }),
      ], { unit: 'short', min: 0 }),
    ],
  ],
};
