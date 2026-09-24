import { deploys } from '../lib/dashboard.ts';
import { ESTATE } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, stat, timeseries, type Step } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const BURN: Step[] = [
  { color: 'green', value: null },
  { color: 'orange', value: 6 },
  { color: 'red', value: 14.4 },
];

export const sloOverview: DashboardSpec = {
  uid: 'slo-overview',
  title: 'Service level objectives',
  description: 'The four objectives the alerts are built on: each indicator over its alerting windows, and how fast its error budget is being spent. Three of them ask the same technical question of every service; email delivery is the one objective that is specific to what notifications does.',
  folder: ESTATE,
  tags: ['slo'],
  time: { from: 'now-3d', to: 'now' },
  refresh: '5m',
  deploys: deploys(),
  rows: [
    [
      stat('Availability · 1 day', 'API requests not answered 5xx over the last day, by service. The objective is 99.5%.', { w: 6, h: 5 }, [
        prom('slo:availability:ratio_rate1d', { legend: '{{job}}' }),
      ], { unit: 'percentunit', decimals: 2, steps: atLeast(0.995), text: 'value_and_name' }),
      stat('Latency · 1 day', 'API requests answered within 500 ms over the last day, by service. The objective is 95%.', { w: 6, h: 5 }, [
        prom('slo:latency:ratio_rate1d', { legend: '{{job}}' }),
      ], { unit: 'percentunit', decimals: 2, steps: atLeast(0.95), text: 'value_and_name' }),
      stat('Page latency · 6 hours', 'Page renders under 512 ms over the last six hours, by web app. The objective is 95%.', { w: 6, h: 5 }, [
        prom('slo:page_latency:ratio_rate6h', { legend: '{{job}}' }),
      ], { unit: 'percentunit', decimals: 2, steps: atLeast(0.95), text: 'value_and_name' }),
      stat('Email delivery · 1 day', 'Emails sent within two minutes of the request over the last day. The objective is 99%.', { w: 6, h: 5 }, [
        prom('slo:delivery:ratio_rate1d', { legend: 'notifications-api' }),
      ], { unit: 'percentunit', decimals: 2, steps: atLeast(0.99), text: 'value_and_name' }),
    ],
    [
      timeseries('Availability', 'Share of API requests not answered 5xx, over one hour and one day. The line is the 99.5% objective.', { w: 12, h: 8 }, [
        prom('slo:availability:ratio_rate1h', { legend: '{{job}} · 1h' }),
        prom('slo:availability:ratio_rate1d', { legend: '{{job}} · 1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.995), lines: true }),
      timeseries('Availability budget burn · 1 hour', 'How many times faster than allowed the budget is being spent. 14.4 pages within the hour; 6 pages after fifteen minutes.', { w: 12, h: 8 }, [
        prom('(1 - slo:availability:ratio_rate1h) / 0.005', { legend: '{{job}}' }),
      ], { unit: 'short', min: 0, steps: BURN, lines: true }),
    ],
    [
      timeseries('Latency', 'Share of API requests answered within 500 ms, over one hour and one day. The line is the 95% objective.', { w: 12, h: 8 }, [
        prom('slo:latency:ratio_rate1h', { legend: '{{job}} · 1h' }),
        prom('slo:latency:ratio_rate1d', { legend: '{{job}} · 1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Latency budget burn · 1 hour', 'Spend against the 5% latency budget. 14.4 pages; 6 opens a ticket.', { w: 12, h: 8 }, [
        prom('(1 - slo:latency:ratio_rate1h) / 0.05', { legend: '{{job}}' }),
      ], { unit: 'short', min: 0, steps: BURN, lines: true }),
    ],
    [
      timeseries('Page latency', 'Share of page renders under 512 ms, from Tempo span metrics, over one and six hours. One line per web app: the same measurement, the same objective, whatever the app renders.', { w: 12, h: 8 }, [
        prom('slo:page_latency:ratio_rate1h', { legend: '{{job}} · 1h' }),
        prom('slo:page_latency:ratio_rate6h', { legend: '{{job}} · 6h' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.95), lines: true }),
      timeseries('Page latency budget burn · 1 hour', 'Spend against the 5% page latency budget. Both page latency alerts open tickets.', { w: 12, h: 8 }, [
        prom('(1 - slo:page_latency:ratio_rate1h) / 0.05', { legend: '{{job}}' }),
      ], { unit: 'short', min: 0, steps: BURN, lines: true }),
    ],
    [
      timeseries('Email delivery', 'Share of emails sent within two minutes, over one hour and one day.', { w: 12, h: 8 }, [
        prom('slo:delivery:ratio_rate1h', { legend: '1h' }),
        prom('slo:delivery:ratio_rate1d', { legend: '1d' }),
      ], { unit: 'percentunit', max: 1, steps: atLeast(0.99), lines: true }),
      timeseries('Email delivery budget burn · 1 hour', 'Spend against the 1% delivery budget.', { w: 12, h: 8 }, [
        prom('(1 - slo:delivery:ratio_rate1h) / 0.01', { legend: 'notifications-api' }),
      ], { unit: 'short', min: 0, steps: BURN, lines: true }),
    ],
    [
      timeseries('Traffic gates', 'Below these the alerts stay silent: about 3 API requests a minute, 20 page views an hour, and any email in the hour.', { w: 24, h: 7 }, [
        prom('slo:traffic:rate1h * 60', { legend: '{{job}} · API requests a minute' }),
        prom('slo:page_traffic:rate1h * 3600', { legend: '{{job}} · page renders an hour' }),
        prom('slo:delivery_traffic:increase1h', { legend: 'notifications-api · emails an hour' }),
      ], { unit: 'short', min: 0 }),
    ],
  ],
};
