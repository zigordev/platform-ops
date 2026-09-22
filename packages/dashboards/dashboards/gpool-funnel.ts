import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { BUSINESS } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const GPOOL_MAIL = 'sum by (template_id) (label_replace(sum by (template) (increase(gpool_notifications_total{outcome="queued"}[$__range])), "template_id", "$1", "template", "(.*)"))';

function perTemplate(metric: string): string {
  return `sum by (template_id) (increase(${metric}{source_app="gpool"}[$__range]))`;
}

function poolAction(action: string, window: string): string {
  return `sum(increase(gpool_pool_actions_total{action="${action}"}[${window}])) or vector(0)`;
}

export const gpoolFunnel: DashboardSpec = {
  uid: 'gpool-funnel',
  title: 'gpool funnel',
  description: 'The life of a pool: created, people invited, invitations accepted, predictions submitted — and the emails that carry each invitation, followed from gpool asking to the relay accepting.',
  folder: BUSINESS,
  tags: ['gpool', 'pools'],
  time: { from: 'now-7d', to: 'now' },
  refresh: '5m',
  deploys: deploys('{job="gpool-api"}'),
  rows: [
    [
      stat('Pools created · 7 days', 'New pools. Everything else on this dashboard starts here.', { w: 4, h: 5 }, [
        prom(poolAction('created', '7d'), { legend: 'created' }),
      ], { decimals: 0 }),
      stat('Invitations sent · 7 days', 'People invited to a pool by its admin.', { w: 4, h: 5 }, [
        prom(poolAction('invitation_sent', '7d'), { legend: 'sent' }),
      ], { decimals: 0 }),
      stat('Invitations accepted · 7 days', 'Invitations that turned into a member.', { w: 4, h: 5 }, [
        prom(poolAction('invitation_accepted', '7d'), { legend: 'accepted' }),
      ], { decimals: 0 }),
      stat('Acceptance rate · 7 days', 'Accepted over sent. A low rate with healthy email delivery is a product problem; a low rate with failed deliveries is an ours problem, and the row below says which.', { w: 4, h: 5 }, [
        prom('sum(increase(gpool_pool_actions_total{action="invitation_accepted"}[7d])) / sum(increase(gpool_pool_actions_total{action="invitation_sent"}[7d]))', { legend: 'accepted' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.5) }),
      stat('Predictions · 7 days', 'Predictions submitted. A pool with members and no predictions is a pool nobody is playing.', { w: 4, h: 5 }, [
        prom('sum(increase(gpool_predictions_total{action="submitted"}[7d])) or vector(0)', { legend: 'submitted' }),
      ], { decimals: 0 }),
      stat('Emails gpool could not queue · 7 days', 'Emails that never reached the broker. Nobody retries these, so each one is an invitation that was never sent.', { w: 4, h: 5 }, [
        prom('sum(increase(gpool_notifications_total{outcome="failed"}[7d])) or vector(0)', { legend: 'failed' }),
      ], { decimals: 0, steps: under(1) }),
    ],
    [
      timeseries('Pool lifecycle', 'Every action on a pool over time, stacked. The shape of a healthy week is a few creations followed by invitations and accepts.', { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(gpool_pool_actions_total[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Invitations', 'Sent, accepted, and people who joined a pool. The gap between sent and accepted is where invitations go to die.', { w: 8, h: 8 }, [
        prom(`sum(increase(gpool_pool_actions_total{action="invitation_sent"}[${RATE_INTERVAL}]))`, { legend: 'sent' }),
        prom(`sum(increase(gpool_pool_actions_total{action="invitation_accepted"}[${RATE_INTERVAL}]))`, { legend: 'accepted' }),
        prom(`sum(increase(gpool_pool_actions_total{action="joined"}[${RATE_INTERVAL}]))`, { legend: 'joined' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Access requests', 'The other way into a pool: someone asks, an admin grants. A pile of requests with no grants means the admin never saw the email.', { w: 8, h: 8 }, [
        prom(`sum(increase(gpool_pool_actions_total{action="access_requested"}[${RATE_INTERVAL}]))`, { legend: 'requested' }),
        prom(`sum(increase(gpool_pool_actions_total{action="access_granted"}[${RATE_INTERVAL}]))`, { legend: 'granted' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Predictions', 'Submitted and cleared. Clearing is a player changing their mind before kickoff, not an error.', { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(gpool_predictions_total[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Emails gpool asked for', 'By outcome, as gpool saw it: queued reached the broker, skipped was deliberate (no address, or the same mail already queued), failed never left.', { w: 8, h: 8 }, [
        prom(`sum by (outcome) (increase(gpool_notifications_total[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Emails at the other end', 'The same mail as notifications handled it: sent by the relay, a failed attempt, or given up on.', { w: 8, h: 8 }, [
        prom(`sum(increase(notifications_sent_total{source_app="gpool"}[${RATE_INTERVAL}]))`, { legend: 'sent' }),
        prom(`sum(increase(notifications_failed_total{source_app="gpool"}[${RATE_INTERVAL}]))`, { legend: 'failed attempts' }),
        prom(`sum(increase(notifications_dlq_total{source_app="gpool"}[${RATE_INTERVAL}]))`, { legend: 'dead-lettered' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      table('The email loop, by template', 'Both halves of the same email side by side. gpool labels its counter template where notifications labels it template_id, so the first column is renamed before the join; a row where queued and requested disagree means mail was lost between gpool and the broker.', { w: 12, h: 9 }, [
        prom(GPOOL_MAIL, { instant: true, table: true }),
        prom(perTemplate('notifications_received_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_sent_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_failed_total'), { instant: true, table: true }),
      ], {
        decimals: 0,
        merge: true,
        hide: ['Time'],
        rename: { template_id: 'Template', 'Value #A': 'Queued by gpool', 'Value #B': 'Requested', 'Value #C': 'Sent', 'Value #D': 'Failed attempts' },
        sortBy: 'Queued by gpool',
      }),
      timeseries('How long gpool mail takes', 'From gpool asking to the relay accepting, for gpool templates only. The line is the two-minute objective every product shares.', { w: 12, h: 9 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(notification_delivery_duration_seconds_bucket{source_app="gpool"}[${RATE_INTERVAL}])))`, { legend: 'p95' }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(notification_delivery_duration_seconds_bucket{source_app="gpool"}[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0, steps: under(120), lines: true }),
    ],
    [
      timeseries('The same steps in the browser', 'What players clicked, reported by their browsers. It should track the server counts above; a gap means a step failed after the click. The failure events need gpool#283 for the release label, but the counts read today.', { w: 12, h: 9 }, [
        prom(`sum by (interaction_type) (increase(rum_interactions_total{job="gpool-web", interaction_type=~"Pool Created|User Invited|Access Requested|Invitation Accepted|Access Request Accepted"}[${RATE_INTERVAL}]))`, { legend: '{{interaction_type}}' }),
        prom(`sum by (interaction_type) (increase(rum_interactions_total{job="gpool-web", interaction_type=~"Invitation Accept Failed|Access Request Accept Failed"}[${RATE_INTERVAL}]))`, { legend: '{{interaction_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      logs('Pools and the emails they trigger', 'Every pool action and every email decision, newest first, with the pool and user ids. Email addresses are never logged.', { w: 12, h: 9 }, [
        loki('{app="gpool-api"} | json | event=~"pool.*|notification.*"'),
      ]),
    ],
  ],
};
