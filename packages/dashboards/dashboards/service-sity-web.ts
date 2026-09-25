import { errorLogs, healthStat, releaseStat, runtimeRow, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { logs, stat, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOB = 'sity-web';
const SEL = `job="${JOB}"`;

function p75(metrics: string): string {
  return `histogram_quantile(0.75, sum by (le, metric_name) (rate(rum_performance_seconds_bucket{${SEL}, metric_name=~"${metrics}"}[${RATE_INTERVAL}])))`;
}

export const serviceSityWeb: DashboardSpec = {
  uid: 'service-sity-web',
  title: 'sity-web',
  description:
    'The server that hands out the sity scene, and the browser that draws it: requests, health, Core Web Vitals, what broke in the browser and what the content security policy caught. sity carries its own deploy workflow and production compose, but it has never deployed: its production environment holds no values, so both release deploys, v0.4.0 and v0.4.1, stopped at a missing AWS_REGION, and sity.zigordev.com has no DNS record. So sity runs on a laptop and nowhere else today, there is no production scrape, and nothing here has an objective to breach or an alert to page on. Two panel families are missing on purpose: sity serves files and calls nothing, so it ships no OpenTelemetry SDK and has no traces, and its /health reports no components, so there is no dependency table. Release reads local, the constant the local compose defaults APP_RELEASE to, so no new version ever appears and no deploy is ever marked; the production compose requires a real APP_RELEASE, so both start working the first time sity deploys. sity#36 shipped the instrumentation and platform-ops#205 added the local scrape job, so the rest reads whenever the local stack is up.',
  folder: SERVICES,
  tags: ['service', 'sity'],
  time: { from: 'now-24h', to: 'now' },
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      upStat(JOB),
      releaseStat(JOB),
      stat('Page views · 24 hours', 'Page views the browser reported. sity is one page, so this is how often someone opened the scene.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_navigations_total{${SEL}, navigation_type="Page View"}[24h])) or vector(0)`, { legend: 'views' }),
      ], { decimals: 0 }),
      stat('Client errors · 24 hours', 'Script errors and rejected promises the browser reported. RUM starts before the scene, so a machine that cannot open a WebGL context is counted here instead of failing silently.', { w: 4, h: 5 }, [
        prom(`sum(increase(rum_errors_total{${SEL}}[24h])) or vector(0)`, { legend: 'errors' }),
      ], { decimals: 0, steps: under(1) }),
      stat('CSP violations · 24 hours', 'The policy is served report-only, so nothing was actually blocked. A count here is what would break once it is enforced.', { w: 4, h: 5 }, [
        prom(`sum(increase(csp_violations_total{${SEL}}[24h])) or vector(0)`, { legend: 'violations' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('Requests per second', 'By route, as Fastify labels it. A file that exists is counted under /*; unmatched is everything the router had no route for, which is both the page handed back for any other path and every 404. /rum/events and /rum/csp are the browser reporting back.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Responses that were not 2xx', 'By route and status. Every 404 lands on unmatched rather than on /*, and means a file that is not there — usually an asset a stale page still asks for. 400, 403 or 429 on /rum is a beacon the ingest refused; the reason is in Rejected beacons below.', { w: 8, h: 8 }, [
        prom(`sum by (route, status) (rate(http_requests_total{${SEL}, status!~"2.."}[${RATE_INTERVAL}]))`, { legend: '{{route}} · {{status}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Latency p95', 'By route. /* covers everything from the 4 kB page to the compressed megabyte of bundle, so its p95 says more about what was asked for than about the server. The /rum posts are small and constant: a rise there is the machine.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: '{{route}}' }),
      ], { unit: 's', min: 0 }),
    ],
    [
      timeseries('Core Web Vitals p75', 'Real visits. Good is under 2.5 s for LCP, 200 ms for INP and 800 ms for TTFB.', { w: 8, h: 8 }, [
        prom(p75('LCP|INP|TTFB|FCP'), { legend: '{{metric_name}}' }),
      ], { unit: 's', min: 0 }),
      timeseries('Page load p75', 'How long the page takes to be ready and then fully loaded. This is where a heavier scene or a new asset shows up first.', { w: 8, h: 8 }, [
        prom(p75('DOMContentLoaded|Load'), { legend: '{{metric_name}}' }),
      ], { unit: 's', min: 0 }),
      timeseries('Layout shift p75', 'Cumulative Layout Shift, unitless. Good is under 0.1. The canvas fills the viewport, so a shift here means something moved around it.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.75, sum by (le) (rate(rum_layout_shift_score_bucket{${SEL}}[${RATE_INTERVAL}])))`, { legend: 'CLS' }),
      ], { unit: 'short', min: 0, decimals: 3, steps: under(0.1), lines: true }),
    ],
    [
      timeseries('Client errors', 'By type. A machine that cannot open a WebGL context throws while the scene module loads, and RUM is started first, so it arrives here as a JavaScript Error rather than as a blank page nobody hears about.', { w: 8, h: 8 }, [
        prom(`sum by (error_type) (rate(rum_errors_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{error_type}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Frustration', 'Rage clicks, dead clicks, slow page loads and excessive scrolling. Only buttons and links are watched, so this is the control panel and never the canvas: a click on the scene itself is not recorded at all.', { w: 8, h: 8 }, [
        prom(`sum by (frustration_type) (rate(rum_frustrations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{frustration_type}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Rejected beacons', 'Beacons the ingest threw away, by reason. Read this first when someone used sity and the browser panels are still empty: cross_origin means the page was opened on a host name the server does not answer to, rate_limited that one browser sent too many, malformed that the batch did not parse.', { w: 8, h: 8 }, [
        prom(`sum by (reason) (rate(rum_rejected_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{reason}}' }),
      ], { unit: 'ops', min: 0 }),
    ],
    [
      timeseries('CSP violations by directive', 'Which rule of the policy was broken. The scene compiles WebAssembly decoders and loads geometry from data URIs, so script-src and connect-src are the two to watch before anyone enforces the policy.', { w: 24, h: 7 }, [
        prom(`sum by (directive) (increase(csp_violations_total{${SEL}}[${RATE_INTERVAL}]))`, { legend: '{{directive}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    runtimeRow(JOB),
    [
      logs('Browser errors', 'Each distinct error once per ten minutes, with the source line it maps to.', { w: 8, h: 10 }, [
        loki(`{app="${JOB}"} | json | event="rum.client_error"`),
      ]),
      logs('CSP violations', 'What was reported, where it came from and on which page.', { w: 8, h: 10 }, [
        loki(`{app="${JOB}"} | json | event="csp.violation"`),
      ]),
      errorLogs(JOB, 8),
    ],
  ],
};
