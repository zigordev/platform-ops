# Error logs

Two alerts read the logs rather than the metrics, because some failures never
reach a metric at all.

## ErrorLogsSpiking

**What fired.** One application wrote more than one error line every five
seconds, for ten minutes. Not one error — a steady stream of them.

**Whether it matters.** Usually yes, but not always urgently: a service can log
errors while still serving every request, which is exactly the case no other
alert covers. What it means is that something is failing repeatedly and the
retries, fallbacks or defaults are hiding it.

**How to see.** In Grafana, Explore, Loki:

```
{app="<app>"} | json | level = "error"
```

Group them by event to find the one that repeats:

```
sum by (event) (count_over_time({app="<app>"} | json | level = "error" [15m]))
```

A line carries the trace it was written inside. Open it in Tempo from the
`TraceID` button on the log line: the request that produced the error is
usually more informative than the error.

**What to do.** In the order these are usually true:

1. A dependency is refusing: Tolgee, Unleash, the broker, the relay, the
   database. Check `/health` for that service — since CV-4 and N-3 it reports
   its dependencies rather than itself alone.
2. A deploy just happened. Compare the `release` field on the error lines with
   the previous ones.
3. One caller is sending something the service cannot handle. The `event` and
   the error class say which.

If the errors are real but expected — a third party is down and the fallback is
working — the alert is doing its job; silence it in Alertmanager for as long as
the outage lasts rather than editing the rule.

## UncaughtExceptions

**What fired.** An application logged `process.uncaught_exception`.

**Whether it matters.** It is always a bug, and what followed depends on the
runtime. Next catches the exception, prints it and keeps serving, so nothing
else in the platform notices: no 5xx, no health change, no restart. The process
continues in a state nobody designed. A Rust service loses the task that
panicked and keeps the rest running, unless the panic was in its main task. The
Node APIs and sity's server exit. After an exit Docker restarts the container,
and `service.started` follows.

**How to see.**

```
{app="<app>"} | json | event = "process.uncaught_exception"
```

The line carries the stack. If it happened inside a request, the trace id is on
it too.

**What to do.** Read the stack and fix the cause. A handler that throws
asynchronously outside a request is the usual source — a timer, an event
listener, a fire-and-forget promise. Until it is fixed, the exception will
repeat.
