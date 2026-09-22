# Team invitations not queued

**Alert:** `TeamInvitationsNotQueued` (ticket)

## What fired

kini failed to publish at least one team invitation to
`notification.email.requested.v1` in the last fifteen minutes. The invitation
never reached notifications, so no email was rendered or sent.

When Redpanda itself is down this alert is inhibited: `RedpandaDown` pages
instead, and [redpanda-down.md](redpanda-down.md) is the place to start.

## Whether it matters

Yes, in a small and quiet way. Someone invited a person to a team, saw the
request fail, and the invited person got nothing. Nothing retries it — kini
publishes once and reports the error up to the request.

The rest of kini is unaffected: the broker is an optional dependency, so
`/health` reports `degraded` rather than `error` and the API keeps serving.

## How to see

```promql
sum by (template, outcome) (increase(kini_notifications_total[6h]))
```

`template` is `kini.team-invitation`; `outcome` is `queued` or `failed`. The
**Invitation emails** panel on `service-kini-api` is the same query.

```logql
{app="kini-api"} | json | event=~"notification.publish_failed|kafka.producer_connected"
```

The failure line carries the template, the message id and the error, never the
recipient's address.

An invitation that was queued and then never arrived is a different problem and
belongs to notifications: see [email-delivery.md](email-delivery.md).

## What to do

1. **Can kini reach the broker?** `NOTIFICATIONS_KAFKA_BROKERS` and the shared
   network; a kini container outside `platform_ops_shared` cannot resolve
   `platform-redpanda`. kini's `/health` reports `kafka` as a component, and
   the container's own health check calls it every ten seconds, so the
   **Dependencies** tile is never more than that out of date.
2. **Does the topic exist?** `rpk topic list` on the broker should show
   `notification.email.requested.v1`. kini creates it on demand, so a missing
   topic usually means it never got far enough to try.
3. **A deploy?** The producer connects at boot rather than on first publish, so
   a burst of failures right after a restart that stops on its own is the
   broker not being up yet.
4. **Re-sending.** There is no replay. The person has to send the invitation
   again once publishing works.
