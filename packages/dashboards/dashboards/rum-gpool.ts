import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { FRONTEND } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const SEL = 'job="gpool-web"';
const FUNNEL =
  'Pool Created|User Invited|Access Requested|Invitation Accepted|Invitation Accept Failed|Access Request Accepted|Access Request Accept Failed';

function p75(metric: string): string {
  return `histogram_quantile(0.75, sum by (le) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="${metric}"}[1h])))`;
}

export const rumGpool: DashboardSpec = {
  uid: 'rum-gpool',
  title: 'RUM · gpool',
  description: 'gpool as its players experience it: the vitals, which of its pages are slow, what they did with pools and what broke in their browser. Every panel reads today.',
  folder: FRONTEND,
  tags: ['rum', 'gpool'],
  time: { from: 'now-24h', to: 'now' },
  deploys: deploys('{job="gpool-web"}'),
  rows: [
    [
      stat('LCP p75 · 1 hour', 'Largest Contentful Paint. Good is under 2.5 s.', { w: 4, h: 5 }, [prom(p75('LCP'), { legend: 'LCP' })], { unit: 's', steps: under(2.5) }),
      stat('INP p75 · 1 hour', 'Interaction to Next Paint. Good is under 200 ms, and gpool is a click-heavy app, so this is the vital to watch.', { w: 4, h: 5 }, [prom(p75('INP'), { legend: 'INP' })], { unit: 's', steps: under(0.2) }),
      stat('CLS p75 · 1 hour', 'Cumulative Layout Shift. Good is under 0.1.', { w: 4, h: 5 }, [
        prom(`histogram_quantile(0.75, sum by (le) (rate(rum_layout_shift_score_bucket{${SEL}}[1h])))`, { legend: 'CLS' }),
      ], { decimals: 3, steps: under(0.1) }),
      stat('Page views · 24 hours', 'Full page loads the browser reported. Moving between pools is a route change, not a page view, and is counted below.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{${SEL}, navigation_type="Page View"}[24h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('Client errors · 24 hours', 'Script errors and rejected promises players hit.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_errors_total{${SEL}}[24h])) or vector(0)`, { legend: 'errors' }),
      ], { decimals: 0, steps: under(1) }),
      stat('CSP violations · 24 hours', 'Scripts or resources the policy did not allow. gpool-web serves a nonce policy and a report endpoint, so any count here is worth reading.', { w: 4, h: 5 }, [
        prom(`sum(increase(csp_violations_total{${SEL}}[24h])) or vector(0)`, { legend: 'violations' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('LCP p75 by release', 'Compare a release with the one before it. Visits from before gpool#283 carry no release label and fall into one unnamed series. Hover a dot to open the render trace.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP"}[${RATE_INTERVAL}])))`, { legend: '{{release}}', exemplar: true }),
      ], { unit: 's', min: 0, steps: under(2.5), lines: true }),
      timeseries('INP and TTFB p75 by release', 'Responsiveness and server response, by release.', { w: 12, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="INP"}[${RATE_INTERVAL}])))`, { legend: 'INP · {{release}}' }),
        prom(`histogram_quantile(0.75, sum by (le, release) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="TTFB"}[${RATE_INTERVAL}])))`, { legend: 'TTFB · {{release}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      table('What players did', 'gpool declares its own event names, so these are the product steps rather than raw clicks. Most frequent first.', { w: 8, h: 9 }, [
        prom(`sum by (interaction_type) (increase(rum_interactions_total{${SEL}, interaction_type=~"${FUNNEL}"}[$__range]))`, { instant: true, table: true }),
      ], { decimals: 0, hide: ['Time'], rename: { interaction_type: 'Event', Value: 'Count' }, sortBy: 'Count' }),
      timeseries('Frustration', 'Rage clicks, dead clicks, slow page loads and excessive scrolling. A dead click on a pool page is usually a button that needed a sign-in.', { w: 8, h: 9 }, [
        prom(`sum by (frustration_type) (increase(rum_frustrations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{frustration_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('CSP violations by directive', 'Which rule of the policy was broken.', { w: 8, h: 9 }, [
        prom(`sum by (directive) (increase(csp_violations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{directive}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      table('Pages', 'Views and largest paint per page over the time range. Pool ids are collapsed to :id, so every pool shares one row. other means a path that is not in the route allow-list.', { w: 12, h: 9 }, [
        prom(`sum by (page) (increase(rum_navigations_total{${SEL}}[$__range]))`, { instant: true, table: true }),
        prom(`histogram_quantile(0.75, sum by (le, page) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP"}[$__range])))`, { instant: true, table: true }),
      ], {
        unit: 's',
        decimals: 2,
        merge: true,
        hide: ['Time'],
        rename: { page: 'Page', 'Value #A': 'Views', 'Value #B': 'LCP p75' },
        sortBy: 'Views',
        overrides: [{ matcher: { id: 'byName', options: 'Views' }, properties: [{ id: 'unit', value: 'short' }, { id: 'decimals', value: 0 }] }],
      }),
      timeseries('How far a session gets', 'Pages visited in one session. gpool is a several-page app, so a median of one means players arrive and leave without opening a pool.', { w: 12, h: 9 }, [
        prom(`histogram_quantile(0.5, sum by (le) (rate(rum_navigation_path_length_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'median' }),
        prom(`histogram_quantile(0.9, sum by (le) (rate(rum_navigation_path_length_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'p90' }),
      ], { unit: 'short', min: 0 }),
    ],
    [
      logs('Browser errors', 'Each distinct error once per ten minutes, with the source line it maps to.', { w: 8, h: 10 }, [loki('{app="gpool-web"} | json | event="rum.client_error"')]),
      logs('Poor vitals', 'Visits with a poor vital, and the element behind it.', { w: 8, h: 10 }, [loki('{app="gpool-web"} | json | event="rum.vital_poor"')]),
      logs('CSP violations', 'What was blocked, where it came from and on which page.', { w: 8, h: 10 }, [loki('{app="gpool-web"} | json | event="csp.violation"')]),
    ],
  ],
};
