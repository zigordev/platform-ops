# gpool invitation and access mail

**Alerts:** `GpoolMailPublishFailing`, `GpoolMailRequestedButNotSent` (ticket)

## What fired

- `GpoolMailPublishFailing`: gpool tried to publish an email to Kafka in the
  last fifteen minutes and the publish failed. The mail never left gpool.
- `GpoolMailRequestedButNotSent`: notifications read gpool's mail off the topic
  over the last thirty minutes and sent none of it.

The two are different halves of the same path, and they fail for different
reasons. The first is gpool and the broker; the second is notifications and a
gpool template.

When Redpanda itself is down, `GpoolMailPublishFailing` is inhibited and
`RedpandaDown` pages instead — start at [redpanda-down.md](redpanda-down.md).
When notifications is down or unhealthy, `GpoolMailRequestedButNotSent` is
inhibited the same way.

## Whether it matters

Yes, and quietly. gpool's four emails are all how a person finds out something
happened to them: they were invited to a pool, someone asked to join theirs,
their request was granted, their invitation was taken up. The admin who sent the
invitation sees a success either way — the publish happens after the response —
so nobody in the product finds out that nothing arrived.

Neither alert means data was lost. A pool that was created still exists, and a
person who was invited is still invited; they simply have no way of knowing.
Re-sending the invitation from the pool's admin page is a valid fix once the
cause is gone.

## How to see

```promql
sum by (template, outcome) (increase(gpool_notifications_total[1h]))
sum by (template_id) (increase(notifications_received_total{source_app="gpool"}[1h]))
sum by (template_id) (increase(notifications_sent_total{source_app="gpool"}[1h]))
```

The `gpool funnel` dashboard puts both halves in one table, which is the fastest
way to see where the drop is: `Queued by gpool` and `Requested` should match,
and `Sent` should follow.

gpool's own log lines are `notification.queued`, `notification.skipped`,
`notification.duplicate` and `notification.publish_failed`, with the template
and the pool id but never an email address. On the other side the lines are
`notification.failed` and `notification.dead_lettered`, with the SMTP reply.

The four templates are `gpool.pool-invitation`, `gpool.pool-access-request`,
`gpool.pool-access-granted` and `gpool.user-accepted-invitation`. All of them
travel on `notification.email.requested.v1`.

## What to do

1. **Publish failing:** check that gpool-api can reach the broker.
   `NOTIFICATIONS_KAFKA_BROKERS` and the shared network — a gpool-api container
   outside `platform_ops_shared` cannot resolve `platform-redpanda`. gpool-api's
   `/health` reports the broker as a component, so it will be `degraded` too.
2. **Publish failing right after a deploy, then stopping:** that is the producer
   reconnecting, and it is not worth chasing.
3. **Read but not sent:** look at which template. If only gpool templates fail
   while cv's mail still flows, the fault is in the gpool template itself —
   a missing variable after a payload change is the usual cause, and the render
   error is in the `notification.failed` line.
4. **Read but not sent, all templates:** it is not a gpool problem. See
   [notifications-stalled.md](notifications-stalled.md) for the relay, and
   [dead-letters.md](dead-letters.md) for what has already been given up on.
5. **Nothing obviously broken:** check `skipped`. gpool skips when it has no
   address for the person it wanted to write to, and the `notification.skipped`
   line says which — `admin_email_missing` or `user_email_missing`. A run of
   skips is a product question, not an incident. A repeated event is dropped
   before any of this and logged as `notification.duplicate` at debug level; it
   is counted in no outcome at all, so a gap between the pool counters and the
   email counters can be duplicates rather than loss.
