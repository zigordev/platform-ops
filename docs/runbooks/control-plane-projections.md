# Control plane projections

**Alerts:** `ControlPlaneProjectionsFailing` (ticket)

## What fired

The control plane keeps its read model by consuming three Kafka streams and
writing each event into Postgres. One named stream lost more than 1% of its
events to projection failures over the last hour, and lost more than five of
them, for fifteen minutes.

| `stream`             | Topic it consumes         | What it writes                                |
| -------------------- | ------------------------- | --------------------------------------------- |
| `backtest_progress`  | backtest progress events  | Batch and job progress rows the console reads |
| `backtest_completed` | backtest completed events | Finished runs, and any promotion they change  |
| `data_readiness`     | data readiness events     | Per pair, timeframe and strategy readiness    |

All three consumers have the same shape: project, count `projected`, and on a
throw count `failed`, log, and return. Returning commits the offset. **Nothing
retries a failed projection and nothing dead-letters it** — the event is gone,
and the only trace it ever existed is one log line.

`ServiceDown` for the control plane inhibits this alert. It has to: the rule
reads `increase()` over a trailing hour, so a service that dies mid-incident
would keep the alert firing for an hour after there was anything left to fix.

`RedpandaDown` deliberately does **not** inhibit it. Every `failed` is counted
inside the message handler, after the broker has already delivered the event, so
a broker outage cannot produce one — it produces silence, and this alert goes
quiet on its own. Letting `RedpandaDown` inhibit it would hide a genuine
database fault that happened to start during a broker blip.

## Whether it matters

Nothing is 5xx and nobody sees an error. That is the whole problem. The console
keeps rendering whatever the last event that did project wrote, so a batch that
stopped advancing at 24% looks like a slow backtest rather than a broken one.
The 2026-09-23 incident ran for seven days at 8,529 failed against 7,650
projected — over half of every progress event dropped — with nothing watching.

Judge the blast radius by which stream it is:

- `backtest_progress` — progress bars and counts go stale. Annoying, not
  corrupting; the completed event still lands and fixes the end state.
- `backtest_completed` — a finished run never registers, and a promotion that
  should have changed did not. Execution can keep trading yesterday's promotion.
- `data_readiness` — the console offers backtests over ranges it has no data
  for, or hides ranges it does have.

## How to see

```promql
sum by (stream, outcome) (increase(trading_bot_control_plane_projections_total[1h]))

sum by (stream) (increase(trading_bot_control_plane_projections_total{outcome="failed"}[1h]))
/
sum by (stream) (increase(trading_bot_control_plane_projections_total[1h]))
```

The **Failed projections by stream** panel on `trading-bot-pipeline` is the
first of these. All six series are created at zero when the process starts, so a
zero is a real zero and not a missing series — but that also means the ratio is
`0/0` and drops out entirely while no events are flowing, which is why the rule
uses an hour rather than five minutes.

The reason is only ever in the logs. Each consumer logs its own event name with
the exception and the raw message body:

```logql
{app="trading-bot-control-plane"} | json
  | event=~"backtest.progress_projection_failed|backtest.completed_projection_failed|data_readiness.projection_failed"
```

`rawValue` on that line is the event the control plane could not project. It is
the only copy left.

## What to do

1. **Read one log line first.** The exception names the cause outright. A
   Postgres `invalid input syntax for type …` or `violates not-null constraint`
   is a schema or a statement problem; a Zod parse error is an envelope the
   producer changed shape on; a connection error is the database.
2. **Is it every event or some events?** Compare the ratio against 1.0. A
   partial loss means the payload decides — the 2026-09-23 incident lost exactly
   the events whose `progressPercent` was fractional, because
   `LEAST(100, GREATEST(0, $N))` left the bound parameter untyped and Postgres
   inferred `integer` from the literals around it. Whole-number percents
   projected fine, which is why the batch appeared to progress at all.
3. **One stream or all three?** All three at once is the database or the pool.
   One stream is that consumer's own statement or its schema.
4. **Check the producer if the envelope will not parse.** `research-backtesting`
   publishes progress and completed events; a field added or retyped there lands
   here as a parse failure with no version negotiation in between.
5. **Accept the loss, then decide about a backfill.** There is no replay path:
   the offsets are committed. For `backtest_progress` the next completed event
   repairs the end state on its own. For `backtest_completed` and
   `data_readiness` the row stays wrong until the run is repeated, so check what
   the console shows against `research-backtesting` before assuming it healed.
6. **Confirm the rate actually fell** after a fix. The rule reads a trailing
   hour, so it stays firing for up to an hour after the last failure. Watch the
   five-minute rate instead of waiting for the alert to resolve.
