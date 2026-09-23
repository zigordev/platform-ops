import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { BUSINESS } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

function perTemplate(metric: string): string {
  return `sum by (template_id) (increase(${metric}[$__range]))`;
}

export const emailDelivery: DashboardSpec = {
  uid: 'email-delivery',
  title: 'Email delivery',
  description: 'Every email the estate sends, by the app that asked for it and the template: requested, sent, failed, dead-lettered and how long it took.',
  folder: BUSINESS,
  tags: ['email'],
  time: { from: 'now-7d', to: 'now' },
  refresh: '5m',
  deploys: deploys('{job="notifications-api"}'),
  rows: [
    [
      stat('Requested · 24 hours', 'Email requests accepted.', { w: 4, h: 5 }, [
        prom('sum(increase(notifications_received_total[24h])) or vector(0)', { legend: 'requested' }),
      ], { decimals: 0 }),
      stat('Sent · 24 hours', 'Emails the relay accepted.', { w: 4, h: 5 }, [
        prom('sum(increase(notifications_sent_total[24h])) or vector(0)', { legend: 'sent' }),
      ], { decimals: 0 }),
      stat('Failed attempts · 24 hours', 'Attempts that failed and were retried or dead-lettered.', { w: 4, h: 5 }, [
        prom('sum(increase(notifications_failed_total[24h])) or vector(0)', { legend: 'failed' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Dead-lettered · 24 hours', 'Emails given up on. Each one needs a look.', { w: 4, h: 5 }, [
        prom('sum(increase(notifications_dlq_total[24h])) or vector(0)', { legend: 'dead-lettered' }),
      ], { decimals: 0, steps: under(1) }),
      stat('On time · 1 day', 'Share sent within two minutes of the request. The objective is 99%.', { w: 4, h: 5 }, [
        prom('slo:delivery:ratio_rate1d', { legend: 'on time' }),
      ], { unit: 'percentunit', decimals: 1, steps: atLeast(0.99) }),
      stat('Delivery p95 · 24 hours', 'Ninety-five in a hundred emails were sent within this time.', { w: 4, h: 5 }, [
        prom('histogram_quantile(0.95, sum by (le) (increase(notification_delivery_duration_seconds_bucket[24h])))', { legend: 'p95' }),
      ], { unit: 's', steps: under(120) }),
    ],
    [
      timeseries('Requested by app', 'Which app asked for email.', { w: 8, h: 8 }, [
        prom(`sum by (source_app) (increase(notifications_received_total[${RATE_INTERVAL}]))`, { legend: '{{source_app}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Sent by template', 'What kind of email went out.', { w: 8, h: 8 }, [
        prom(`sum by (template_id) (increase(notifications_sent_total[${RATE_INTERVAL}]))`, { legend: '{{template_id}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Failed attempts by template', 'Render and send failures. The reason is in the log below.', { w: 8, h: 8 }, [
        prom(`sum by (template_id) (increase(notifications_failed_total[${RATE_INTERVAL}]))`, { legend: '{{template_id}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Delivery time p95 by app', 'From the request to the relay accepting it. The line is the two-minute objective.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, source_app) (rate(notification_delivery_duration_seconds_bucket[${RATE_INTERVAL}])))`, { legend: '{{source_app}}' }),
      ], { unit: 's', min: 0, steps: under(120), lines: true }),
      timeseries('Dead-lettered and duplicates', 'Emails given up on, and repeated requests skipped because they were already sent.', { w: 12, h: 8 }, [
        prom(`sum by (template_id) (increase(notifications_dlq_total[${RATE_INTERVAL}]))`, { legend: 'dead-lettered · {{template_id}}' }),
        prom(`sum by (template_id) (increase(notifications_deduplicated_total[${RATE_INTERVAL}]))`, { legend: 'duplicate · {{template_id}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      table('By template', 'Totals over the time range.', { w: 12, h: 10 }, [
        prom(perTemplate('notifications_received_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_sent_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_failed_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_dlq_total'), { instant: true, table: true }),
      ], {
        decimals: 0,
        merge: true,
        hide: ['Time'],
        rename: { template_id: 'Template', 'Value #A': 'Requested', 'Value #B': 'Sent', 'Value #C': 'Failed attempts', 'Value #D': 'Dead-lettered' },
        sortBy: 'Requested',
      }),
      logs('Failures', 'Every failed attempt and dead letter, with the template, the app, the error class and the SMTP reply. dlt_payload_invalid is a dead letter the consumer could not even parse, so it carries no template.', { w: 12, h: 10 }, [
        loki('{app="notifications-api"} | json | event=~"notification.failed|notification.dead_lettered|notification.dlt_payload_invalid"'),
      ]),
    ],
  ],
};
