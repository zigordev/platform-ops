# notifications stalled

**Alerts:** `NotificationsConsumerStuck`, `NotificationsReceivedButNotSent`
(ticket)

## What fired

- `NotificationsConsumerStuck`: the notifications consumer group has been
  behind on `notification.email.requested.v1` for fifteen minutes without
  catching up once. Email traffic is light, so any lag that lasts is mail
  that nobody is reading.
- `NotificationsReceivedButNotSent`: notifications accepted emails in the last
  thirty minutes and sent none of them.

`ServiceDown` and `ServiceUnhealthy` for notifications, and `RedpandaDown`,
inhibit both: when those fire, they are the cause.

## Whether it matters

Yes. Mail is waiting and nothing is sending it.

## How to see

```promql
kafka:consumer_group_lag:sum{redpanda_group="notifications-api"}
sum(increase(notifications_received_total[30m])), sum(increase(notifications_sent_total[30m]))
```

```bash
sudo docker exec platform-ops-prod-redpanda-1 rpk group describe notifications-api
```

`MEMBERS 0` means no consumer is in the group. notifications' `/health`
reports SMTP and Kafka as components.

## What to do

1. **SMTP down:** the consumer pauses its topic instead of dead-lettering while
   the relay refuses logins, and logs `smtp.unavailable` and
   `notification.paused_for_relay`. Fix the relay (the app password in OpenBao is
   the usual cause) and the waiting mail goes out on its own.
2. **No members:** the consumer crashed or never joined. Check the container and
   its last `service.stopping` line, and restart it.
3. **Received but not sent, with members:** every attempt is failing; the
   `notification.failed` lines say why, and [email-delivery.md](email-delivery.md)
   covers the reply codes.
