import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { FRONTEND } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'trading-bot-operator-console';
const SEL = `job="${JOB}"`;

function p75(metric: string): string {
  return `histogram_quantile(0.75, sum by (le) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="${metric}"}[1h])))`;
}

export const rumTradingBotOperatorConsole: DashboardSpec = {
  uid: 'rum-trading-bot-operator-console',
  title: 'RUM · trading-bot console',
  description:
    'The trading-bot console in the browser it is actually driven from: the vitals per page, what was clicked, what broke and what the content security policy caught. The console is an internal tool with one or two operators, so read counts here as "did this person have a bad time", not as traffic. trading-bot is local only, so nothing on this dashboard has a production counterpart. CSP violations, the browser log panels and the release label the by-release panel splits on all came with trading-bot#158, which is merged, so every panel reads whenever the local stack is up.',
  folder: FRONTEND,
  tags: ['rum', 'trading-bot'],
  time: { from: 'now-24h', to: 'now' },
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      stat('LCP p75 · 1 hour', 'Largest Contentful Paint. Good is under 2.5 s.', { w: 4, h: 5 }, [prom(p75('LCP'), { legend: 'LCP' })], { unit: 's', steps: under(2.5) }),
      stat('INP p75 · 1 hour', 'Interaction to Next Paint. The console is a form-heavy tool, so this is the number an operator feels. Good is under 200 ms.', { w: 4, h: 5 }, [prom(p75('INP'), { legend: 'INP' })], { unit: 's', steps: under(0.2) }),
      stat('CLS p75 · 1 hour', 'Cumulative Layout Shift. Good is under 0.1.', { w: 4, h: 5 }, [
        prom(`histogram_quantile(0.75, sum by (le) (rate(rum_layout_shift_score_bucket{${SEL}}[1h])))`, { legend: 'CLS' }),
      ], { decimals: 3, steps: under(0.1) }),
      stat('Page views · 24 hours', 'Page views the browser reported. A console nobody opened reports none, which is normal.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{${SEL}, navigation_type="Page View"}[24h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('Client errors · 24 hours', 'Script errors and rejected promises. With this few users, one error is one operator who could not finish what they were doing.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_errors_total{${SEL}}[24h])) or vector(0)`, { legend: 'errors' }),
      ], { decimals: 0, steps: under(1) }),
      stat('CSP violations · 24 hours', 'Scripts or resources the policy did not allow. The console’s own scripts carry a nonce, so any count here is worth reading.', { w: 4, h: 5 }, [
        prom(`sum(increase(csp_violations_total{${SEL}}[24h])) or vector(0)`, { legend: 'violations' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('LCP p75 by page', 'Largest Contentful Paint per page. The configuration and promotion pages load the most from the control-plane, so they are the ones to watch.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, page) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP"}[${RATE_INTERVAL}])))`, { legend: '{{page}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(2.5), lines: true }),
      timeseries('INP and TTFB p75 by release', 'Responsiveness and server response, by release. Compare a release with the one before it.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="INP"}[${RATE_INTERVAL}])))`, { legend: 'INP · {{release}}' }),
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="TTFB"}[${RATE_INTERVAL}])))`, { legend: 'TTFB · {{release}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      table('Where the operator went', 'Page views and route changes per page over the time range. Pages outside the console’s own list are grouped as other.', { w: 8, h: 9 }, [
        prom(`sum by (page) (increase(rum_navigations_total{${SEL}}[$__range]))`, { instant: true, table: true }),
      ], { decimals: 0, hide: ['Time'], rename: { page: 'Page', Value: 'Navigations' }, sortBy: 'Navigations' }),
      timeseries('Frustration', 'Rage clicks, dead clicks, slow page loads and excessive scrolling. On an internal tool these are a feature request, not an incident.', { w: 8, h: 9 }, [
        prom(`sum by (frustration_type) (increase(rum_frustrations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{frustration_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Client errors by type', 'Script errors and rejected promises, by kind. The line that maps to a source file is in the log panel below.', { w: 8, h: 9 }, [
        prom(`sum by (error_type) (increase(rum_errors_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{error_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      logs('Browser errors', 'Each distinct error once per ten minutes, with the source line it maps to.', { w: 8, h: 10 }, [loki(`{app="${JOB}"} | json | event="rum.client_error"`)]),
      logs('Poor vitals', 'Visits with a poor vital, and the element behind it.', { w: 8, h: 10 }, [loki(`{app="${JOB}"} | json | event="rum.vital_poor"`)]),
      logs('CSP violations', 'What was blocked, where it came from and on which page.', { w: 8, h: 10 }, [loki(`{app="${JOB}"} | json | event="csp.violation"`)]),
    ],
  ],
};
