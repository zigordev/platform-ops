# Binance request weight near the ceiling

**Alert:** `BinanceRateLimitNearCap` (ticket)

## What fired

market-data has spent more than 90% of the configured Binance `REQUEST_WEIGHT`
ceiling within a one-minute window, and has stayed there for five minutes.

Binance charges every REST call a weight rather than counting requests, and the
budget resets each minute. The service keeps its own limiter and aims at a
target below the ceiling — locally 5400 of 6000 — so reaching 90% means the
limiter is already delaying calls to stay under it.

trading-bot runs locally only. There is no production scrape job for it, so this
alert can only fire against the local stack.

## Whether it matters

Not yet, and that is the point of alerting here rather than at the ceiling:

- At the ceiling Binance answers `429`, and the backfill starts losing work.
- Ignore the 429s and it answers `418`, which is an IP ban with a timeout that
  grows each time. The websocket goes with it, so a REST overspend takes the
  live stream down as collateral.

Nothing is broken while this is firing. It is the warning that the next burst of
backfill will break something.

## How to see

```promql
trading_bot_market_data_binance_rest_used_weight_1m
trading_bot_market_data_binance_rest_target_weight_1m
trading_bot_market_data_binance_rest_limit_weight_1m
```

What is spending it:

```promql
sum by (path) (rate(trading_bot_market_data_binance_rest_requests_total[5m]))
```

And whether Binance has started pushing back:

```promql
sum by (path, status) (increase(trading_bot_market_data_binance_rest_rate_limit_responses_total[1h]))
```

The dashboard is **trading-bot-market-data**: the weight gauge, the REST request
graph and the limiter delay graph sit in the same two rows.

## What to do

1. **What is it backfilling?** `/api/v3/klines` at this rate is a kline backfill
   over a long lookback; `/api/v3/aggTrades` is a trade gap repair, which is the
   expensive one. The `kline_backfill.planned` and `trade_gap_repair.started`
   log lines say how much work was queued and why.
2. **Is this a one-off?** A new pair, or a long lookback after the service was
   off for a while, spends heavily until it catches up and then stops. Watch the
   used-weight line come down on its own before changing anything.
3. **Did someone add pairs?** More subscriptions means more of everything.
   `trading_bot_market_data_active_pair_subscriptions` against the last day
   answers it.
4. **Lower the target.** The limiter's target is a share of the ceiling, set in
   market-data's configuration. Lowering it makes backfills slower and safer;
   raising it toward the ceiling is what produces the ban.
