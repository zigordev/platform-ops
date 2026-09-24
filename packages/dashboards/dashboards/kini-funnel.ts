import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { BUSINESS } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, logs, stat, table, timeseries, under } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const WAITING = 'Empty until kini#160 merges and the API restarts; after that a zero here is a real zero, because kini creates every action at zero when it starts.';

const KINI_MAIL =
  'sum by (template_id) (label_replace(sum by (template) (increase(kini_notifications_total{outcome="queued"}[$__range])), "template_id", "$1", "template", "(.*)"))';

const BROWSER_STEPS =
  'invitation-sent|invitation-accepted|invitation-accept-failed|available-pool-added|match-result-set|match-assigned|results-checked';

const FUNNEL_LOG =
  'team.invitation_sent|team.invitation_accepted|pool.created|notification.queued|notification.publish_failed';

function perTemplate(metric: string): string {
  return `sum by (template_id) (increase(${metric}{source_app="kini"}[$__range]))`;
}

function teamAction(action: string, window: string): string {
  return `sum(increase(kini_team_actions_total{action="${action}"}[${window}])) or vector(0)`;
}

function poolAction(action: string, window: string): string {
  return `sum(increase(kini_pool_actions_total{action="${action}"}[${window}])) or vector(0)`;
}

export const kiniFunnel: DashboardSpec = {
  uid: 'kini-funnel',
  title: 'kini funnel',
  description:
    'The road a kini player walks: invited to a team, accepting, taking up the week’s draw, filling in every match, checking the results — and, alone in the estate, ending on an outcome rather than an action, because a checked match is a hit or a miss. The invitation email is followed from kini asking to the relay accepting it. The player counters come from kini#160 and stay empty until it merges; the email loop, the browser steps and the log below read today.',
  folder: BUSINESS,
  tags: ['kini', 'teams'],
  time: { from: 'now-7d', to: 'now' },
  refresh: '5m',
  deploys: deploys('{job="kini-api"}'),
  rows: [
    [
      stat('Invitations sent · 7 days', `People invited to a team. Every step to the right of this one starts here. ${WAITING}`, { w: 4, h: 5 }, [
        prom(teamAction('invitation_sent', '7d'), { legend: 'sent' }),
      ], { decimals: 0 }),
      stat('Invitations accepted · 7 days', `Invitations that turned into a team member. ${WAITING}`, { w: 4, h: 5 }, [
        prom(teamAction('invitation_accepted', '7d'), { legend: 'accepted' }),
      ], { decimals: 0 }),
      stat('Acceptance rate · 7 days', `Accepted over sent. Low with healthy mail is a product problem, low with failed mail is ours, and the email row below says which. It reads nothing at all while nobody has been invited, because the counters are both zero. ${WAITING}`, { w: 4, h: 5 }, [
        prom('sum(increase(kini_team_actions_total{action="invitation_accepted"}[7d])) / sum(increase(kini_team_actions_total{action="invitation_sent"}[7d]))', { legend: 'accepted' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.5) }),
      stat('Draws taken up · 7 days', `Weekly lottery draws a team pulled in to play. A team that accepts invitations and takes up no draw has joined and never played. ${WAITING}`, { w: 4, h: 5 }, [
        prom(poolAction('taken_up', '7d'), { legend: 'taken up' }),
      ], { decimals: 0 }),
      stat('Predictions completed · 7 days', `Draws whose last empty match was filled in, so the team has a full ticket. Fewer of these than draws taken up means tickets are being abandoned half-played. ${WAITING}`, { w: 4, h: 5 }, [
        prom(poolAction('predictions_completed', '7d'), { legend: 'completed' }),
      ], { decimals: 0 }),
      stat('Hit rate · 7 days', `Share of first-scored matches the team called right. This is the end of the funnel and the only step that is an outcome rather than something a player did — nobody can make it go up by using kini more, and it is here to be watched rather than improved. The line sits just above a third, which is what blind guessing at a home win, a draw or an away win would give you. It reads nothing until a draw has been scored. ${WAITING}`, { w: 4, h: 5 }, [
        prom('sum(increase(kini_match_results_total{outcome="hit"}[7d])) / sum(increase(kini_match_results_total[7d]))', { legend: 'hit' }),
      ], { unit: 'percentunit', decimals: 0, steps: atLeast(0.35) }),
    ],
    [
      timeseries('The funnel over time', `The whole chain in one chart, one bar per step. The bars should fall from left to right within a week; a step that collapses while the one before it holds is where players are being lost. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum(increase(kini_team_actions_total{action="invitation_sent"}[${RATE_INTERVAL}]))`, { legend: 'invited' }),
        prom(`sum(increase(kini_team_actions_total{action="invitation_accepted"}[${RATE_INTERVAL}]))`, { legend: 'accepted' }),
        prom(`sum(increase(kini_pool_actions_total{action="taken_up"}[${RATE_INTERVAL}]))`, { legend: 'draw taken up' }),
        prom(`sum(increase(kini_pool_actions_total{action="predictions_completed"}[${RATE_INTERVAL}]))`, { legend: 'predictions completed' }),
        prom(`sum(increase(kini_pool_actions_total{action="results_checked"}[${RATE_INTERVAL}]))`, { legend: 'results checked' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Hits and misses', `Matches scored against the official results for the first time. A rescore of the same match is counted in neither, so these bars are players finding out, not the checker running. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum by (outcome) (increase(kini_match_results_total[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Invitations that went nowhere', `The two dead ends of an invitation: the address already belongs to a member, or accepting threw and the person saw an error. The second one costs a player and needs the log below. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(kini_team_actions_total{action=~"invitation_already_member|invitation_accept_failed"}[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      timeseries('Teams', `Teams players made themselves, and the ones kini made for them on first sign-in. default_created without created means nobody has chosen to build a team of their own. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(kini_team_actions_total{action=~"created|default_created"}[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Everything done to a draw', `Every pool action stacked: taken up from the week’s lottery feed, created or edited by hand, filled in, scored. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(kini_pool_actions_total[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Predictions', `set and cleared are a player changing a pick; assigned and unassigned are a team handing a match to one of its members to call. Clearing and unassigning are normal play, not errors. ${WAITING}`, { w: 8, h: 8 }, [
        prom(`sum by (action) (increase(kini_predictions_total[${RATE_INTERVAL}]))`, { legend: '{{action}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      table('The invitation email loop, by template', 'Both halves of the same email side by side. kini labels its counter template where notifications labels it template_id, so the first column is renamed before the join; a row where queued and requested disagree means an invitation was lost between kini and the broker. kini sends one kind of email, so one row is the whole of it. This reads today.', { w: 12, h: 9 }, [
        prom(KINI_MAIL, { instant: true, table: true }),
        prom(perTemplate('notifications_received_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_sent_total'), { instant: true, table: true }),
        prom(perTemplate('notifications_failed_total'), { instant: true, table: true }),
      ], {
        decimals: 0,
        merge: true,
        hide: ['Time'],
        rename: { template_id: 'Template', 'Value #A': 'Queued by kini', 'Value #B': 'Requested', 'Value #C': 'Sent', 'Value #D': 'Failed attempts' },
        sortBy: 'Queued by kini',
      }),
      timeseries('How long invitation mail takes', 'From kini asking to the relay accepting, for kini templates only. The line is the two-minute objective every product shares. An invitation that arrives late is an acceptance that happens late or not at all. This reads today.', { w: 12, h: 9 }, [
        prom(`histogram_quantile(0.95, sum by (le) (rate(notification_delivery_duration_seconds_bucket{source_app="kini"}[${RATE_INTERVAL}])))`, { legend: 'p95' }),
        prom(`histogram_quantile(0.5, sum by (le) (rate(notification_delivery_duration_seconds_bucket{source_app="kini"}[${RATE_INTERVAL}])))`, { legend: 'p50' }),
      ], { unit: 's', min: 0, steps: under(120), lines: true }),
    ],
    [
      timeseries('Invitations at the other end', 'The same mail as notifications handled it: sent by the relay, a failed attempt, or given up on. A dead letter is an invitation nobody will ever receive and nobody is told about. This reads today.', { w: 12, h: 9 }, [
        prom(`sum(increase(notifications_sent_total{source_app="kini"}[${RATE_INTERVAL}]))`, { legend: 'sent' }),
        prom(`sum(increase(notifications_failed_total{source_app="kini"}[${RATE_INTERVAL}]))`, { legend: 'failed attempts' }),
        prom(`sum(increase(notifications_dlq_total{source_app="kini"}[${RATE_INTERVAL}]))`, { legend: 'dead-lettered' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('The same steps in the browser', 'What players clicked, reported by their browsers, including the accept that failed in front of them. It should track the server counts above; a gap means the click never reached the API. This reads today.', { w: 12, h: 9 }, [
        prom(`sum by (interaction_type) (increase(rum_interactions_total{job="kini-web", interaction_type=~"${BROWSER_STEPS}"}[${RATE_INTERVAL}]))`, { legend: '{{interaction_type}}' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      logs('Invitations, draws and the emails they trigger', 'Every invitation sent and accepted, every pool created by hand and every email decision, newest first, with the team and pool ids. Email addresses are never logged. This reads today and does not wait on kini#160, because the API already logs these lines; locally it is usually empty simply because nobody has been invited, not because it is pointed at the wrong stream.', { w: 24, h: 10 }, [
        loki(`{app="kini-api"} | json | event=~"${FUNNEL_LOG}"`),
      ]),
    ],
  ],
};
