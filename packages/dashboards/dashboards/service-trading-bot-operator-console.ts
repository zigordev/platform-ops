import { componentsTable, errorLogs, failingTraces, healthStat, pageLatencyObjective, pageRenderTime, releaseStat, runtimeRow, slowTraces, upStat } from '../lib/common.ts';
import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { SERVICES } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { stat, timeseries, under } from '../lib/panels.ts';
import { prom } from '../lib/queries.ts';

const JOB = 'trading-bot-operator-console';
const SEL = `{job="${JOB}"}`;
const SERVER = `service="${JOB}", span_kind="SPAN_KIND_SERVER"`;

export const serviceTradingBotOperatorConsole: DashboardSpec = {
  uid: 'service-trading-bot-operator-console',
  title: 'trading-bot-operator-console',
  description:
    'The Next.js console an operator drives trading-bot from, as a server: page renders from traces, the two beacon routes it exposes to the browser, and the runtime underneath. What visitors experience is on the RUM dashboard. trading-bot is local only: no deploy, no production scrape job. Health, the page render spans, the per-route request counters behind both beacon panels, CSP reports and the JSON logs Loki labels with this app all came with trading-bot#158, which is merged, so every panel reads whenever the local stack is up.',
  folder: SERVICES,
  tags: ['service', 'trading-bot'],
  deploys: deploys(`{job="${JOB}"}`),
  rows: [
    [
      healthStat(JOB),
      upStat(JOB),
      releaseStat(JOB),
      stat('Restarts · 1 hour', 'Process starts in the last hour. A deploy counts once; more than that is a crash loop.', { w: 4, h: 5 }, [
        prom(`sum(changes(process_start_time_seconds${SEL}[1h]))`, { legend: 'restarts' }),
      ], { steps: under(2), decimals: 0 }),
      componentsTable(JOB, 8),
    ],
    [
      pageRenderTime(JOB),
      pageLatencyObjective(JOB),
      timeseries('Renders by outcome', 'Server spans by name and status. A render that fails against the control-plane shows up here first.', { w: 8, h: 8 }, [
        prom(`sum by (span_name, status_code) (rate(traces_spanmetrics_calls_total{${SERVER}}[${RATE_INTERVAL}]))`, { legend: '{{span_name}} · {{status_code}}' }),
      ], { unit: 'reqps', min: 0 }),
    ],
    [
      timeseries('Beacon routes', 'The two routes the browser posts to: RUM events and CSP reports. Nothing else in the console is measured as a route.', { w: 8, h: 8 }, [
        prom(`sum by (route) (rate(http_requests_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{route}}' }),
      ], { unit: 'reqps', min: 0 }),
      timeseries('Beacons refused', 'Beacons the ingest dropped before they reached a metric, by reason. cross_origin or rate_limited in volume is somebody other than an operator.', { w: 8, h: 8 }, [
        prom(`sum by (reason) (rate(rum_rejected_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{reason}}' }),
      ], { unit: 'ops', min: 0 }),
      timeseries('Beacon route latency p95', 'How long the ingest takes to accept a beacon. It runs on the same event loop as the pages, so a slow ingest slows renders.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket${SEL}[${RATE_INTERVAL}])))`, { legend: '{{route}}', exemplar: true }),
      ], { unit: 's', min: 0 }),
    ],
    [
      timeseries('Where the copy came from', 'Message loads by source. This console has no Tolgee configured anywhere: TOLGEE_API_URL appears in none of the three compose files trading-bot ships, and the local stack sets TOLGEE_SYNC to none, so the loader skips Tolgee before it fetches and every render counts local. A flat local line is this service behaving correctly, which is why CopyServedFromRepository watches the three sites and deliberately not this one — a > 0 alert here would fire forever. The panel earns its place as the evidence for that: the day somebody wires the console to Tolgee, merged appears and local stops being the whole story, and local coming back after that means the same fallback the three sites alert on.', { w: 24, h: 6 }, [
        prom(`sum by (source) (rate(trading_bot_operator_console_i18n_messages_total${SEL}[${RATE_INTERVAL}]))`, { legend: '{{source}}' }),
      ], { unit: 'ops', min: 0 }),
    ],
    runtimeRow(JOB),
    [failingTraces(JOB, 12), slowTraces(JOB, '1s', 12)],
    [errorLogs(JOB, 24)],
  ],
};
