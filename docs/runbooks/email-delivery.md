# Email delivery objective

**Alerts:** `EmailDeliveryBudgetBurningFast`, `EmailDeliveryBudgetBurning`,
`EmailDeliveryBudgetErodingSlowly` (ticket)

## What fired

The objective is that 99% of emails are accepted by SMTP within two minutes of
the producer asking for them, over 30 days. The indicator is emails delivered
within two minutes divided by emails received, so an email that fails, waits or
is dead-lettered counts against it. The three alerts are the same burn ladder
as the HTTP objectives: 14x over an hour, 6x over six hours, 3x over a day,
each confirmed by a shorter window and each needing at least three emails in
its window.

Emails held while the consumer is paused because SMTP is down are not received
yet, so an SMTP outage shows first as `ServiceUnhealthy` and
`NotificationsConsumerStuck` (see [notifications-stalled.md](notifications-stalled.md)),
and those inhibit these.

## Whether it matters

Each missed email is a person who expected a message — an invitation, a contact
reply — and got it late or not at all.

## How to see

```promql
slo:delivery:ratio_rate1h
histogram_quantile(0.95, sum by (le) (rate(notification_delivery_duration_seconds_bucket[1h])))
sum by (template_id) (increase(notifications_failed_total[1h]))
```

Each email is one trace, from the producer through `notification.process` to
`smtp.send`, with the SMTP reply code on a failed attempt.

## What to do

1. **Slow `smtp.send` spans:** the relay is slow or throttling. Gmail throttles
   bursts from one account.
2. **Failed attempts with a reply code:** 535 is the login (see the SMTP
   password in OpenBao), 4xx is temporary and retried, 5xx on one recipient is
   that address.
3. **Old `requestedAt`:** the delay happened before notifications saw the
   message; check the producer and [kafka-lag.md](kafka-lag.md).
4. **Dead letters:** see [dead-letters.md](dead-letters.md).
