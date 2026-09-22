# Binance market stream disconnected

**Alert:** `MarketStreamDisconnected` (ticket)

## What fired

`trading-bot-market-data` has told its own `/health` endpoint that the Binance
websocket is down, and it has said so for ten minutes.

`ComponentDown` fires on the same fact, generically, after five. This alert
exists because the market stream is not one dependency among several: it is the
only source of new data in the product, and the next two hours of everything
else depend on it.

trading-bot runs locally only. There is no production scrape job for it, so this
alert can only fire against the local stack.

## Whether it matters

Yes, and it gets worse quietly rather than loudly:

- `trading-bot-execution` keeps evaluating, on candles that stop moving. A
  strategy that reads a flat market does nothing, so there is no error to see.
- Nothing is written to ClickHouse for the period, so a backtest run later over
  that window silently reads a gap. `backtest.kline_coverage_incomplete` in the
  research service's log is the downstream symptom.

market-data reconnects on its own, and backfills the gap when it does. Ten
minutes without that having happened means the reconnect loop is not getting
anywhere.

## How to see

```promql
service_component_up{job="trading-bot-market-data"}
```

and, for whether anything at all is coming out:

```promql
sum(rate(trading_bot_market_data_kline_publish_total[5m]))
sum(rate(trading_bot_market_data_trade_publish_total[5m]))
```

Trades stop within seconds of the stream dropping; klines can take a minute
longer, because a candle only closes once per interval.

The dashboard is **trading-bot-market-data**. The log panel there carries
`subscriptions.refreshed` and the backfill events, which is how you tell "the
stream is down" from "the stream is up and subscribed to nothing".

Note that `trading_bot_market_data_stream_connected` exists as a metric and is
never written — it reads 0 on a healthy service. Do not use it. The truth is in
`service_component_up{component="marketStream"}`, which the health handler
writes from the same state `/health` reports.

## What to do

1. **Is Binance reachable at all?** The REST side shares the network:
   `sum by (outcome) (rate(trading_bot_market_data_binance_rest_requests_total[5m]))`.
   REST failing too means the network or the region, not the stream.
2. **Was it rate limited into a ban?** See
   [binance-rate-limit.md](binance-rate-limit.md). A 418 gets the address
   blocked for a while, and the websocket goes with it.
3. **Is it subscribed to anything?** A runtime-config refresh that failed can
   leave the service with an empty subscription list, which looks like silence.
   `trading_bot_market_data_active_kline_subscriptions` should be non-zero.
4. **Restart it.** The reconnect loop is the thing that is stuck; a fresh
   process re-subscribes and backfills what it missed.
