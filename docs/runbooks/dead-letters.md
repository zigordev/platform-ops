# Dead-lettered notifications

**Alerts:** `DeadLetterQueueGrowing`, `NotificationsDeadLetterUnread` (ticket)

## What fired

- `DeadLetterQueueGrowing`: `notifications_dlq_total` increased in the last
  hour. One or more messages were retried, kept failing, and were moved to the
  dead-letter topic. This is the moment of the failure.
- `NotificationsDeadLetterUnread`: records are sitting on
  `notification.email.requested.v1.DLT` behind the `notifications-api` consumer
  group. This is the aftermath, and it is the one that lasts. The consumer group
  subscribes to the DLT as well as to the main topic, so a record it cannot
  handle stays at the group's committed offset and is read again on every
  rebalance and restart.

`RedpandaDown` inhibits both: with the broker down the lag reading is not
trustworthy. `ServiceDown` and `ServiceUnhealthy` deliberately do **not** inhibit
them — a dead letter is waiting whether or not notifications is up, and bringing
the service back does not clear it.

## Whether it matters

Every dead letter is an email a person expected and did not receive: an
invitation, a password reset, a booking confirmation. The count is small and the
consequence is not.

`NotificationsDeadLetterUnread` will not resolve on its own. Nothing retries a
dead letter, so unlike `NotificationsConsumerStuck` — which clears once the relay
comes back or the consumer catches up — this one stays until a person drains or
replays the topic.

## How to see

How many, and how recently:

```promql
increase(notifications_dlq_total[6h])
```

What is still unread, by topic:

```promql
kafka:consumer_group_lag:sum{redpanda_group="notifications-api"}
```

What they were — read the dead-letter topic on the broker:

```bash
sudo docker exec -it platform-ops-prod-redpanda-1 rpk topic consume notification.email.requested.v1.DLT --num 20
```

The reason is in the service logs at the time of the failure; the trace ID in
the log line opens the full path in Tempo.

## What to do

1. **Read one.** The failures are nearly always the same failure repeated, and
   one message tells you which.
2. **Common causes** — the SMTP relay rejecting the recipient, a malformed
   payload from a producer that changed shape without a contract change, or a
   template referencing a field that is not there.
3. **Fix the cause, then replay.** Messages in the DLQ are not automatically
   retried; they stay until something replays them deliberately.
4. **Clear the lag once they are handled.** `NotificationsDeadLetterUnread` keeps
   firing while the group's committed offset is behind the topic's end, so a
   record that can never be processed has to be replayed or committed past
   explicitly:

   ```bash
   sudo docker exec platform-ops-prod-redpanda-1 \
     rpk group describe notifications-api
   ```

   Check the DLT partition's offset against its end before and after.

5. **Tell the affected people** if the failure window was long. They are waiting
   for mail that is not coming.

## When the dead-letter write itself fails

`NotificationsDeadLetterUnwritable` is a different and worse failure: an email
failed, and the attempt to record that failure on the dead-letter topic also
failed, on every retry. The consumer does not drop the record — dropping it
would lose an email nobody would ever hear about — so it leaves the offset
uncommitted and lets the batch fail, which means that partition stops moving
and everything queued behind it waits.

Which record is wedged, and how long it has been:

```logql
{app="notifications-api"} | json | event = "notification.record_blocked"
```

`failures` on that line counts consecutive failures of the same topic,
partition and offset, so it keeps rising across the consumer restarts rather
than resetting to one each time.

The publish is retried `NOTIFICATIONS_RETRY_MAX_ATTEMPTS` times with the delay
doubling from `NOTIFICATIONS_RETRY_INTERVAL_MS` up to thirty seconds, and the
consumer heartbeats through each wait, so a short broker blip is absorbed and
shows up only as `outcome="retried"` on
`notifications_dlq_publish_failures_total`. `outcome="exhausted"` is what this
alert watches.

Almost always the broker is the cause, so check `RedpandaDown` first — it
inhibits this alert for exactly that reason. If Redpanda is healthy, the topic
itself is the next thing to look at: a missing `notification.email.requested.v1.DLT`,
a partition without a leader, or a quota rejecting the write.

Once the broker takes writes again the consumer clears the backlog on its own.
Nothing needs replaying, because nothing was committed.
