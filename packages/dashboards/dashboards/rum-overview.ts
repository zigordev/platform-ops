import { deploys, jobVariable, RATE_INTERVAL } from '../lib/dashboard.ts';
import { FRONTEND } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, timeseries, under } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const SEL = 'job="$job"';

export const rumOverview: DashboardSpec = {
  uid: 'rum-overview',
  title: 'RUM overview',
  description: 'Any web app, picked from the list, as its visitors experience it: Core Web Vitals, errors, frustration and what they did.',
  folder: FRONTEND,
  tags: ['rum'],
  variables: [jobVariable('rum_navigations_total', 'Web app')],
  deploys: deploys('{job="$job"}'),
  rows: [
    [
      timeseries('Core Web Vitals p75', 'Real visits. Good is under 2.5 s for LCP, 200 ms for INP and 800 ms for TTFB. A dot is a visit whose page render trace you can open.', { w: 12, h: 9 }, [
        prom(`histogram_quantile(0.75, sum by (le, metric_name) (rate(rum_performance_seconds_bucket{${SEL}, metric_name=~"LCP|INP|TTFB|FCP"}[${RATE_INTERVAL}])))`, { legend: '{{metric_name}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
      timeseries('Share of good experiences', 'Visits inside the good threshold: LCP within 2.5 s, INP within 200 ms, CLS within 0.1.', { w: 12, h: 9 }, [
        prom(`sum(rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP", le="2.5"}[${RATE_INTERVAL}])) / sum(rate(rum_performance_seconds_count{${SEL}, metric_name="LCP"}[${RATE_INTERVAL}]))`, { legend: 'LCP' }),
        prom(`sum(rate(rum_performance_seconds_bucket{${SEL}, metric_name="INP", le="0.2"}[${RATE_INTERVAL}])) / sum(rate(rum_performance_seconds_count{${SEL}, metric_name="INP"}[${RATE_INTERVAL}]))`, { legend: 'INP' }),
        prom(`sum(rate(rum_layout_shift_score_bucket{${SEL}, le="0.1"}[${RATE_INTERVAL}])) / sum(rate(rum_layout_shift_score_count{${SEL}}[${RATE_INTERVAL}]))`, { legend: 'CLS' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: atLeast(0.75), lines: true }),
    ],
    [
      timeseries('Layout shift p75', 'Cumulative Layout Shift, unitless. Good is under 0.1.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le) (rate(rum_layout_shift_score_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'CLS' }),
      ], { unit: 'short', min: 0, decimals: 3, steps: under(0.1), lines: true }),
      timeseries('Client errors', 'Script errors and rejected promises the browser reported, by type.', { w: 8, h: 8 }, [
        prom(`sum by (error_type) (rate(rum_errors_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{error_type}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Frustration', 'Rage clicks, dead clicks, slow page loads and excessive scrolling.', { w: 8, h: 8 }, [
        prom(`sum by (frustration_type) (rate(rum_frustrations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{frustration_type}}' }),
      ], { unit: 'ops', min: 0 }),
    ],
    [
      timeseries('Page views and route changes', 'Navigations the browser reported.', { w: 8, h: 8 }, [
        prom(`sum by (navigation_type) (rate(rum_navigations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{navigation_type}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Interactions', 'Clicks, form submissions and the app’s own named events.', { w: 8, h: 8 }, [
        prom(`sum by (interaction_type) (rate(rum_interactions_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{interaction_type}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Rejected beacons', 'Beacons the ingest refused, by reason. A burst of cross_origin or rate_limited is someone other than a visitor.', { w: 8, h: 8 }, [
        prom(`sum by (reason) (rate(rum_rejected_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{reason}}' }),
      ], { unit: 'ops', min: 0 }),
    ],
    [
      timeseries('Pages per visit', 'Median and 90th percentile of pages a visit sees.', { w: 12, h: 7 }, [
        prom(`histogram_quantile(0.5, sum by (le) (rate(rum_navigation_path_length_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'median' }),
        prom(`histogram_quantile(0.9, sum by (le) (rate(rum_navigation_path_length_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'p90' }),
      ], { unit: 'short', min: 0 }),
      timeseries('LCP p75 by page', 'Largest Contentful Paint by page. Pages outside the app’s list are grouped as other.', { w: 12, h: 7 }, [
        prom(`histogram_quantile(0.75, sum by (le, page) (rate(rum_performance_seconds_bucket{${SEL}, metric_name="LCP"}[${RATE_INTERVAL}])))`, { legend: '{{page}}' }),
      ], { unit: 's', min: 0, steps: under(2.5), lines: true }),
    ],
  ],
};
