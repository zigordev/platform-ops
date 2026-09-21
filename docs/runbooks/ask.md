# cv answer box

**Alerts:** `AskSlow`, `AskUpstreamFailing`, `AskBudgetNearlySpent`,
`AskBudgetExhausted` (ticket)

## What fired

- `AskSlow`: the 95th percentile of answer times over the last half hour is
  above ten seconds, across at least five questions.
- `AskUpstreamFailing`: more than half of the questions sent to Claude in the
  last fifteen minutes failed upstream, at least three of them.
- `AskBudgetNearlySpent`: 80% of the month's answer budget is spent.
- `AskBudgetExhausted`: all of it is; the answer box refuses every question
  until the month turns or the limit is raised.

## Whether it matters

The answer box is optional: the rest of the site works without it. A visitor
who asks and gets nothing back still leaves with a worse impression than one
who never saw the box.

## How to see

```promql
sum by (outcome) (increase(cv_ask_requests_total[1h]))
histogram_quantile(0.95, sum by (le) (rate(cv_ask_latency_seconds_bucket[30m])))
cv_ask_budget_used_ratio
```

Each question is one trace, `POST /api/ask` → `chat claude-opus-5`, with the
tokens, the cost and the finish reason on the span. Its log line is
`ask.completed`, with the outcome and, for a failure, the upstream status.

## What to do

1. **Upstream failing:** a 401 means the API key was revoked or rotated; a 429
   means Anthropic's rate limit; anything 5xx is their side, so check
   <https://status.anthropic.com> before touching anything here.
2. **Slow:** compare the `chat` span with the whole request. If Claude is slow,
   the prompt grew or the model is loaded; if the rest is slow, see
   [page-latency.md](page-latency.md).
3. **Budget:** check whether the spend is real visitors or one client looping
   (the per-IP limits should stop that). Raise `ASK_BUDGET_LIMIT_USD` only on
   purpose; closing for the rest of the month is the designed outcome.
