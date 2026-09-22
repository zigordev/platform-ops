# Execution is trading live

**Alert:** `ExecutionLeftPaperMode` (page)

## What fired

`trading-bot-execution` has an active promotion loaded and its mode is `live`.
Every signal the promoted strategy produces now places a real order against the
Binance account, using the API key the service was started with.

This is the only alert in the estate that pages about something working exactly
as designed. It pages because the cost of not noticing is money, and because the
switch is a data change — promoting an execution configuration with
`mode: live` in the control-plane — rather than a deploy anyone reviewed.

The gauge is set from the loaded promotion's mode, falling back to
`EXECUTION_DEFAULT_MODE`, which is `paper` unless someone set it otherwise. The
alert requires a promotion to actually be loaded, so a service that has not yet
completed its first control-plane refresh does not page on the way up.

trading-bot runs locally only. There is no production scrape job for it, so this
alert can only fire against the local stack — which also means a live mode here
is trading from a laptop.

## Whether it matters

If it was deliberate: no, and silence it by knowing it fired. If it was not:
immediately. The service reconciles balances and opens positions on its own
schedule; there is no confirmation step between the promotion and the first
order.

## How to see

```promql
trading_bot_execution_paper_mode_enabled
trading_bot_execution_active_promotion_loaded
```

`1` is paper, `0` is live. The **trading-bot-execution** dashboard shows both as
tiles, and the mode as a line over time — the step down to 0 is the moment the
promotion took effect.

What it has done since:

```logql
{app="trading-bot-execution"} | json | event="paper_trade.closed"
```

That event is only written by the paper simulator, so its absence while the mode
is live is expected, not reassuring. Real fills are on the exchange and in the
control-plane's trade records, not in this log.

## What to do

1. **Decide whether it was intended.** The control-plane's execution summary
   names the active promotion and its mode. If someone promoted a live
   configuration on purpose, note it and resolve.
2. **If not: stop the service.** Stopping `trading_bot_execution` ends new
   orders. It does not close open positions.
3. **Demote the promotion.** Restarting without changing the control-plane
   brings the service straight back up in live mode, because the mode comes from
   the promotion, not from the environment.
4. **Check what was opened.** Open positions and orders are on the exchange
   account, and reconciliation logs `reconciliation.no_free_balance` when it
   finds the account already committed.
