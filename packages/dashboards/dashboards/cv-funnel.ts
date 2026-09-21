import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { BUSINESS } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, gauge, logs, stat, timeseries, under, type Step } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const BUDGET: Step[] = [
  { color: 'green', value: null },
  { color: 'orange', value: 0.8 },
  { color: 'red', value: 1 },
];

export const cvFunnel: DashboardSpec = {
  uid: 'cv-funnel',
  title: 'cv funnel',
  description: 'What visitors do with the cv: questions to the answer box and what they cost, contact messages and whether they arrived, downloads.',
  folder: BUSINESS,
  tags: ['cv', 'ask'],
  time: { from: 'now-7d', to: 'now' },
  refresh: '5m',
  deploys: deploys('{job="cv-web"}'),
  rows: [
    [
      stat('Questions · 24 hours', 'Questions sent to the answer box, whatever happened to them.', { w: 4, h: 5 }, [
        prom('sum(increase(cv_ask_requests_total[24h])) or vector(0)', { legend: 'questions' }),
      ], { decimals: 0 }),
      stat('Answered · 24 hours', 'Share of questions that got an answer with citations.', { w: 4, h: 5 }, [
        prom('sum(increase(cv_ask_requests_total{outcome="answered"}[24h])) / sum(increase(cv_ask_requests_total[24h]))', { legend: 'answered' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.5) }),
      gauge('Monthly budget used', 'Spend so far this month against the answer box budget. At 100% the box rests until next month.', { w: 4, h: 5 }, [
        prom('max(cv_ask_budget_used_ratio)', { legend: 'used' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: BUDGET }),
      stat('Spend · 24 hours', 'Estimated model spend in the last day.', { w: 4, h: 5 }, [
        prom('sum(increase(cv_ask_cost_usd_total[24h])) or vector(0)', { legend: 'spend' }),
      ], { unit: 'currencyUSD', decimals: 2 }),
      stat('Contact messages · 24 hours', 'Messages the contact form queued for delivery.', { w: 4, h: 5 }, [
        prom('sum(increase(cv_contact_submissions_total{outcome="queued"}[24h])) or vector(0)', { legend: 'queued' }),
      ], { decimals: 0 }),
      stat('PDF downloads · 24 hours', 'Downloads of the CV as a PDF, from the browser.', { w: 4, h: 5 }, [
        prom('sum(increase(rum_interactions_total{job="cv-web", interaction_type="cv-downloaded"}[24h])) or vector(0)', { legend: 'downloads' }),
      ], { decimals: 0 }),
    ],
    [
      timeseries('Questions by outcome', 'answered and refused are normal; upstream_error, incomplete and budget_exhausted are not.', { w: 8, h: 8 }, [
        prom(`sum by (outcome) (increase(cv_ask_requests_total[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Answer time', 'From the question arriving to the answer leaving, for questions that passed validation.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(cv_ask_latency_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p95' }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(cv_ask_latency_seconds_bucket[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0, steps: under(15), lines: true }),
      timeseries('Tokens by kind', 'Billed tokens. A high cache_read share is the prompt cache doing its job.', { w: 8, h: 8 }, [
        prom(`sum by (kind) (increase(cv_ask_tokens_total[${RATE_INTERVAL}]))`, { legend: '{{kind}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
    ],
    [
      timeseries('Budget used', 'Share of the monthly budget spent, as each question left it. It resets on the first of the month.', { w: 8, h: 8 }, [
        prom('max(cv_ask_budget_used_ratio)', { legend: 'used' }),
      ], { unit: 'percentunit', min: 0, steps: BUDGET, lines: true }),
      timeseries('Citations per answer', 'CV passages an answer points to.', { w: 8, h: 8 }, [
        prom(`histogram_quantile(0.5, sum by (le) (rate(cv_ask_citations_bucket[${RATE_INTERVAL}])))`, { legend: 'median' }),
        prom(`histogram_quantile(0.9, sum by (le) (rate(cv_ask_citations_bucket[${RATE_INTERVAL}])))`, { legend: 'p90' }),
      ], { unit: 'short', min: 0 }),
      timeseries('Refusals by reason', 'Why the box declined: off topic, better asked through the contact form, or not in the CV. From the logs.', { w: 8, h: 8 }, [
        loki('sum by (refusal) (count_over_time({app="cv-web"} | json | event="ask.completed" | outcome="refused" [$__auto]))', { legend: '{{refusal}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Contact form', 'What happened to each submission: queued for delivery, rejected by validation or the rate limit, or failed to reach the broker.', { w: 8, h: 8 }, [
        prom(`sum by (outcome) (increase(cv_contact_submissions_total[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Contact emails', 'The same messages at the other end: sent by notifications, or a failed attempt.', { w: 8, h: 8 }, [
        prom(`sum(increase(notifications_sent_total{source_app="cv"}[${RATE_INTERVAL}]))`, { legend: 'sent' }),
        prom(`sum(increase(notifications_failed_total{source_app="cv"}[${RATE_INTERVAL}]))`, { legend: 'failed attempts' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Visitor steps', 'Opening the box or the form, sending, downloading, reading a case study. From the browser.', { w: 8, h: 8 }, [
        prom(`sum by (interaction_type) (increase(rum_interactions_total{job="cv-web", interaction_type=~"ask-opened|ask-submitted|contact-opened|contact-sent|cv-downloaded|case-study-opened"}[${RATE_INTERVAL}]))`, { legend: '{{interaction_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      logs('Questions and outcomes', 'Each question the box handled, with its outcome, citations and cost. Kept for 14 days.', { w: 24, h: 10 }, [
        loki('{app="cv-web"} | json | event="ask.completed"'),
      ]),
    ],
  ],
};
