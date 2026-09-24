# Page latency

**Alerts:** `PageLatencyBudgetBurningFast`, `PageLatencyBudgetEroding` (ticket)

## What fired

Too many page renders of one web app took longer than half a second. The
objective is 95% of renders under half a second over 30 days, and it is the same
objective for every web app: cv-web, gpool-web, kini-web and the trading-bot
operator console. The fast alert means most renders of the last hour were slow
and still are, the slower one means nearly a third were slow over six hours.
Both need at least twenty renders an hour, so a handful of visits cannot raise
them. `{{ $labels.job }}` on the alert says which app.

The indicator comes from the page render's own server span, through Tempo's
span metrics, because page renders do not pass through the route wrapper that
feeds `http_request_duration_seconds` — on a Next server that metric only counts
the API and beacon route handlers. Tempo's bucket edge nearest half a second is
512 ms, so that is the line the ratio uses.

`slo:page_render:latency_bucket` and `slo:page_render:latency_count` define what
counts as a page render, once, for every app: a `SPAN_KIND_SERVER` span named
`GET /…` or `RSC GET /…`, minus `/api`, `/_next`, `/_not-found`, `/health`,
`/metrics`, `/rum` and anything ending in a file extension. Both the document
request and the RSC payload a client-side navigation fetches are page renders
and both are in. The window ratios read those two series and nothing else, so a
new web app needs no new rule.

sity-web is not in it, and does not need to be: it serves files through the
kit's HTTP middleware, so every one of its page requests is already inside
`slo:latency:*` under route `/*`. It emits no server spans at all.

## Whether it matters

Visitors wait longer for the first byte, and everything the browser measures
starts later. A ticket while it is new; nothing is failing.

## How to see

```promql
slo:page_latency:ratio_rate1h
slo:page_traffic:rate1h * 3600
```

Both carry one series per web app. In Grafana, the service dashboard for the app
has the same two panels every other web app has — page render time with
exemplars, and the objective. Traces Drilldown for that service, sorted by
duration, shows the slow renders and the span that took the time. A slow visit's
LCP or TTFB point on the app's RUM dashboard carries an exemplar that opens the
same trace.

## What to do

1. **Translations.** `i18n.load_messages` spans that take seconds mean Tolgee is
   slow; the page waits for it before falling back to the committed copy.
2. **A deploy.** The first renders after a restart are cold; a step that does
   not recover is the release itself.
3. **An upstream.** gpool-web and kini-web render from their own API; a slow
   `fetch GET` client span under the render span is the cause, not the page.
4. **The host.** Memory pressure or a busy neighbour slows every span at once;
   check [host-memory.md](host-memory.md).
