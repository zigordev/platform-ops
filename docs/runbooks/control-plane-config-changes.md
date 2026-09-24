# Control plane configuration changes

**Alerts:** `ControlPlaneConfigPublishFailing` (ticket)

## What fired

Somebody created, updated or deleted a resource in the control plane — a pair, a
timeframe, a strategy, a risk profile, a promotion — and the event announcing it
never reached Redpanda. At least one such change was lost in the last fifteen
minutes.

Two outcomes trip it, and `outcome` on the alert says which:

| `outcome` | What happened                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------- |
| `failed`  | `producer.send` threw. The publisher then disconnects and retries the connection on the next change. |
| `skipped` | The change was offered after the publisher had been told to stop, during shutdown.                   |

Both are swallowed. The write to Postgres had already succeeded and the HTTP
caller was answered 2xx, so nothing above this point knows anything went wrong.
There is no retry and no dead-letter queue; the counter and one log line are the
only record.

`published` is counted on the same metric and is not part of the rule. All three
are created at zero on start, so a zero here is a real zero.

## Whether it matters

Less than the projections alert next door, and the bound is worth knowing before
you decide how quickly to act.

- **market-data** is the only consumer of the topic, and it uses the event as a
  fast path: on one it re-reads its configuration immediately. It also runs a
  reconcile on every hour boundary regardless. A lost event therefore delays a
  change by up to an hour — it does not lose it.
- **execution** polls the control plane every 15 s (`EXECUTION_REFRESH_INTERVAL_MS`)
  and never reads this topic.
- **research-backtesting** fetches runtime config and risk profiles per run, and
  never reads this topic either.

So one lost event is an hour of market-data streaming and storing the old set of
subscriptions. Persistent failure means every configuration change is an hour
late, permanently, which is the case worth fixing today rather than this week.

`ServiceDown` and `RedpandaDown` both inhibit this alert. `RedpandaDown` has to:
a broker outage is the most likely cause of a throwing `send`, and the outage is
the thing to fix.

## How to see

```promql
sum by (outcome) (increase(trading_bot_control_plane_config_changes_total[1h]))
```

The **Configuration changes to the services** panel on `trading-bot-pipeline` is
that query, and the logs panel beside it is the reason:

```logql
{app="trading-bot-control-plane"} | json | event=~"config.publish_failed|config.publish_skipped"
```

A `config.publish_failed` line carries `resourceType`, `operation`, `resourceId`
and the error. That triple is what was lost, and it is enough to repeat the
change by hand.

## What to do

1. **Is Redpanda up?** `RedpandaDown` would have inhibited this if it were
   firing, so a `failed` arriving on its own usually means the broker is
   reachable but the topic is not writable — check the partition count and the
   leader on `redpanda-console`.
2. **Read one `config.publish_failed` line.** A timeout points at the broker, a
   `TOPIC_AUTHORIZATION_FAILED` or an unknown-topic error points at the topic
   itself, which the publisher creates on start and only on start.
3. **`skipped` alone during a deploy is benign.** It means a change landed
   while the process was shutting down. Repeat that one change once the new
   process is up; there is nothing to fix.
4. **Repeat the lost changes.** Re-saving the resource in the console publishes
   a fresh event. Touch each `resourceId` from the log lines rather than waiting
   for the reconcile if the change is one you want applied now.
5. **Confirm market-data caught up.** Its configuration refresh is visible as
   `config-change:<resourceType>:<operation>` in its logs, and the hourly path
   as `periodic-reconcile`. Seeing only the latter means the fast path is still
   broken.
