import { componentsTable, errorLogs, failingTraces, healthStat, releaseStat, runtimeRow } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'notifications-api';
const LAG = 'kafka:consumer_group_lag:sum{redpanda_group="notifications-api", redpanda_topic="notification.email.requested.v1"}';

export const serviceNotificationsApi: DashboardSpec = {
  uid: 'service-notifications-api',
  title: 'notifications-api',
  description: 'The email consumer: what it reads, sends, retries and dead-letters, how long delivery takes, the SMTP relay, runtime and failures.',
  folder: SERVICES,
  tags: ['service', 'consumer'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      componentsTable(JOB, 8),
      releaseStat(JOB),
      stat('Consumer lag', 'Emails requested and not yet read. It pauses on purpose while the SMTP relay is down.', { w: 4, h: 5 }, [
        prom(`max(${LAG}) or vector(0)`, { legend: 'lag' }),
      ], { steps: under(1), decimals: 0 }),
      stat('Emails · 1 hour', 'Email requests accepted in the last hour.', { w: 4, h: 5 }, [
        prom('sum(increase(notifications_received_total[1h])) or vector(0)', { legend: 'requested' }),
      ], { decimals: 0 }),
    ],
    [
      timeseries('Throughput', 'Requests accepted, emails sent, failed attempts, duplicates skipped and dead letters.', { w: 8, h: 8 }, [
        prom(`sum(rate(notifications_received_total[${RATE_INTERVAL}]))`, { legend: 'requested' }),
        prom(`sum(rate(notifications_sent_total[${RATE_INTERVAL}]))`, { legend: 'sent' }),
        prom(`sum(rate(notifications_failed_total[${RATE_INTERVAL}]))`, { legend: 'failed attempts' }),
        prom(`sum(rate(notifications_deduplicated_total[${RATE_INTERVAL}]))`, { legend: 'duplicates' }),
        prom(`sum(rate(notifications_dlq_total[${RATE_INTERVAL}]))`, { legend: 'dead-lettered' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Delivery time', 'From the producer asking to the relay accepting. The line is the two-minute objective.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(notification_delivery_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p95' }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(notification_delivery_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0, steps: under(120), lines: true }),
      timeseries('Delivery objective', 'Share of emails sent within two minutes, over one hour and one day. The line is the 99% objective.', { w: 8, h: 8 }, [
        prom('slo:delivery:ratio_rate1h', { legend: '1h' }),
        prom('slo:delivery:ratio_rate1d', { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.99), lines: true }),
    ],
    [
      timeseries('SMTP send time', 'How long the relay takes to accept one email. Failed sends are included.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(notification_send_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p95' }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(notification_send_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0 }),
      timeseries('Render time', 'Template rendering, by template. Only successful renders are measured.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, template_id) (rate(notification_render_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: '{{template_id}}' }),
      ], { unit: 's', min: 0 }),
      timeseries('Retries and pauses', 'Retries scheduled, by error class, and pauses while the SMTP relay was down. From the logs.', { w: 8, h: 8 }, [
        loki(`sum by (errorClass) (count_over_time({app="${JOB}"} | json | event="notification.retry_scheduled" [$__auto]))`, { legend: 'retry · {{errorClass}}' }),
        loki(`sum(count_over_time({app="${JOB}"} | json | event="notification.paused_for_relay" [$__auto]))`, { legend: 'paused for the relay' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Consumer span time', 'One message from read to done, from Tempo. Hover a dot to open that trace.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="${JOB}", span_name="notification.process"}[${RATE_INTERVAL}])))`, { legend: 'p95', exemplar: true }),
      ], { unit: 's', min: 0 }),
      timeseries('Consumer lag over time', 'Emails requested and not yet read, on the email topic.', { w: 8, h: 8 }, [
        prom(LAG, { legend: 'lag' }),
      ], { unit: 'short', min: 0 }),
      failingTraces(JOB, 8, 8),
    ],
    runtimeRow(JOB),
    [
      logs('Failed and dead-lettered', 'Every failed attempt, dead letter and relay outage, newest first, with the template and the SMTP reply. dlt_payload_invalid is a dead-lettered payload the consumer could not parse; it is the one line that says a message left the topic and was read by nothing.', { w: 12, h: 10 }, [
        loki(`{app="${JOB}"} | json | event=~"notification.failed|notification.dead_lettered|notification.routed_to_dlt|notification.dlt_payload_invalid|smtp.unavailable|smtp.recovered"`),
      ]),
      errorLogs(JOB, 12),
    ],
  ],
};
