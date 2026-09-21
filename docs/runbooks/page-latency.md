# cv page latency

**Alerts:** `PageLatencyBudgetBurningFast`, `PageLatencyBudgetEroding` (ticket)

## What fired

Too many renders of cv's page took longer than half a second. The objective is
95% of `GET /` renders under half a second over 30 days; the fast alert means
most renders of the last hour were slow and still are, the slower one means
nearly a third were slow over six hours. Both need at least twenty renders an
hour, so a handful of visits cannot raise them.

The indicator comes from the page render's own server span, through Tempo's
span metrics, because page renders do not pass through the route wrapper that
feeds `http_request_duration_seconds`. Tempo's bucket edge nearest half a
second is 512 ms, so that is the line the ratio uses.

## Whether it matters

Visitors wait longer for the first byte, and everything the browser measures
starts later. A ticket while it is new; nothing is failing.

## How to see

```promql
slo:page_latency:ratio_rate1h
```

In Grafana, Traces Drilldown for `cv-web`, filtered to `GET /` and sorted by
duration, shows the slow renders and the span that took the time. A slow
visit's LCP or TTFB point on the RUM · cv dashboard carries an exemplar that
opens the same trace, and the cv-web dashboard lists the slow renders directly.

## What to do

1. **Translations.** `i18n.load_messages` spans that take seconds mean Tolgee is
   slow; the page waits for it before falling back to the committed copy.
2. **A deploy.** The first renders after a restart are cold; a step that does
   not recover is the release itself.
3. **The host.** Memory pressure or a busy neighbour slows every span at once;
   check [host-memory.md](host-memory.md).
