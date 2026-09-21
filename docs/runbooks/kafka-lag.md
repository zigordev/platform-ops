# Kafka consumer lag

**Alert:** `KafkaConsumerLagGrowing` (ticket)

## What fired

A consumer group is more than 1000 messages behind on a topic, and has been for
fifteen minutes.

## Whether it matters

Lag is not failure — it is delay, and a batch job or a burst of writes produces
lag that clears itself. Sustained lag is different: it means the consumer is
permanently slower than the producers, or it has stopped consuming and nobody
noticed.

For `notification.email.requested.v1` the visible symptom is email arriving
late, then later, then not at all.

## How to see

```promql
kafka:consumer_group_lag:sum
```

Lag is derived: the partition's latest offset minus the group's committed
offset. Redpanda 24.3 only exports a lag metric when `enable_consumer_group_metrics`
includes `consumer_lag`, which this cluster does not set, so an alert written
against `redpanda_kafka_consumer_group_lag_sum` never had anything to read.

Whether it is growing or draining matters more than the absolute number:

```promql
deriv(sum by (redpanda_group) (kafka:consumer_group_lag:sum)[30m:])
```

The notifications group has a stricter alert of its own, because any lasting
lag there is mail nobody is reading: see [notifications-stalled.md](notifications-stalled.md).

Positive and steady means the consumer is losing.

## What to do

1. **Is the consumer alive?** Check `up` and `service_health_status` for the
   consuming service. A consumer that crashed leaves lag that only grows.
2. **Did it leave the group?** `trading-bot-market-data` is known not to rejoin
   after a broker restart, and looks exactly like this. Restarting it is the
   current fix.
3. **Is it erroring per message?** Check the service logs and
   [dead-letters.md](dead-letters.md) — a consumer failing every message can
   still hold its group membership.
4. **Is it just slow?** If lag drains when producers go quiet, the consumer is
   under-provisioned rather than broken.
