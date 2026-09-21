# Contact messages not published

**Alert:** `ContactPublishFailing` (ticket)

## What fired

cv failed to hand at least one contact message to Kafka in the last fifteen
minutes. The visitor saw an error, and the message went nowhere.

When Redpanda itself is down, this alert is inhibited: `RedpandaDown` pages
instead, and [redpanda-down.md](redpanda-down.md) is the place to start.

## Whether it matters

Yes: each one is a person who tried to get in touch and could not. Nothing
retries it later.

## How to see

```promql
sum by (outcome) (increase(cv_contact_submissions_total[1h]))
```

The log line is `contact.publish_failed`, with the error but never the name,
email or message. cv's `/health` reports the broker as a component, so a broker
it cannot reach shows as `degraded` there too.

## What to do

1. **Can cv reach the broker?** `NOTIFICATIONS_KAFKA_BROKERS` and the shared
   network; a cv container outside `platform_ops_shared` cannot resolve
   `platform-redpanda`.
2. **Does the topic exist?** `rpk topic list` on the broker should show
   `notification.email.requested.v1`.
3. **A deploy?** cv reconnects to the broker on start; a burst of failures right
   after a restart that stops on its own is that.
