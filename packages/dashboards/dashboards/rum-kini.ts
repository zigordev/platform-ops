import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { FRONTEND } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const SEL = 'job="kini-web"';

function p75(metric: string): string {
  return `histogram_quantile(0.75, sum by (le) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="${metric}"}[1h])))`;
}

export const rumKini: DashboardSpec = {
  uid: 'rum-kini',
  title: 'RUM · kini',
  description:
    'kini as visitors experience it: the vitals by release, which routes they reach, what broke in their browser and what the content security policy caught. There is no "what visitors did" table because kini-web declares no business events of its own — every interaction is a Click or a Form Submit, which says nothing a page view does not already say. The release label, the CSP panels and the log panels arrive with kini#150; the vitals, navigations, errors and frustration counters read today.',
  folder: FRONTEND,
  tags: ['rum', 'kini'],
  time: { from: 'now-24h', to: 'now' },
  deploys: deploys(`{${SEL}}`),
  rows: [
    [
      stat('LCP p75 · 1 hour', 'Largest Contentful Paint. Good is under 2.5 s.', { w: 4, h: 5 }, [prom(p75('LCP'), { legend: 'LCP' })], { unit: 's', steps: under(2.5) }),
      stat('INP p75 · 1 hour', 'Interaction to Next Paint. Good is under 200 ms.', { w: 4, h: 5 }, [prom(p75('INP'), { legend: 'INP' })], { unit: 's', steps: under(0.2) }),
      stat('CLS p75 · 1 hour', 'Cumulative Layout Shift. Good is under 0.1.', { w: 4, h: 5 }, [
        prom(`histogram_quantile(0.75, sum by (le) (rate(rum_layout_shift_score_bucket{${SEL}}[1h])))`, { legend: 'CLS' }),
      ], { decimals: 3, steps: under(0.1) }),
      stat('Page views · 24 hours', 'Page views the browser reported.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{${SEL}, navigation_type="Page View"}[24h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('Client errors · 24 hours', 'Script errors and rejected promises visitors hit.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_errors_total{${SEL}}[24h])) or vector(0)`, { legend: 'errors' }),
      ], { decimals: 0, steps: under(1) }),
      stat('CSP violations · 24 hours', 'Scripts or resources the policy did not allow. The page’s own scripts carry a nonce, so any count here is worth reading.', { w: 4, h: 5 }, [
        prom(`sum(increase(csp_violations_total{${SEL}}[24h])) or vector(0)`, { legend: 'violations' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('LCP p75 by release', 'Compare a release with the one before it. Hover a dot to open the render trace of that visit.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP"}[${RATE_INTERVAL}])))`, { legend: '{{release}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(2.5), lines: true }),
      timeseries('INP and TTFB p75 by release', 'Responsiveness and server response, by release.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="INP"}[${RATE_INTERVAL}])))`, { legend: 'INP · {{release}}' }),
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="TTFB"}[${RATE_INTERVAL}])))`, { legend: 'TTFB · {{release}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      table('Where visitors went', 'Page views by route over the time range, busiest first. The routes are an allow-list, so a path that is not one of kini’s own is counted as other rather than becoming its own row.', { w: 8, h: 9 }, [
        prom(`sum by (page) (increase(rum_navigations_total{${SEL}, navigation_type="Page View"}[$__range]))`, { instant: true, table: true }),
      ], { decimals: 0, hide: ['Time'], rename: { page: 'Route', Value: 'Views' }, sortBy: 'Views' }),
      timeseries('Frustration', 'Rage clicks, dead clicks, slow page loads and excessive scrolling.', { w: 8, h: 9 }, [
        prom(`sum by (frustration_type) (increase(rum_frustrations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{frustration_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('CSP violations by directive', 'Which rule of the policy was broken.', { w: 8, h: 9 }, [
        prom(`sum by (directive) (increase(csp_violations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{directive}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      logs('Browser errors', 'Each distinct error once per ten minutes, with the source line it maps to.', { w: 8, h: 10 }, [loki('{app="kini-web"} | json | event="rum.client_error"')]),
      logs('Poor vitals', 'Visits with a poor vital, and the element behind it.', { w: 8, h: 10 }, [loki('{app="kini-web"} | json | event="rum.vital_poor"')]),
      logs('CSP violations', 'What was blocked, where it came from and on which page.', { w: 8, h: 10 }, [loki('{app="kini-web"} | json | event="csp.violation"')]),
    ],
  ],
};
