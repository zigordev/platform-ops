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

An empty subscription list does not fire it. With its runtime config loaded and
no pairs to stream, market-data reports the stream `idle`, stays healthy, and
keeps no `marketStream` series. That is an empty trading-bot database, not a
broken stream: add pairs from the control plane's `/docs`, or restore the seed
described in trading-bot's `docs/architecture/postgres-seed-data.md`.

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

`trading_bot_market_data_stream_connected` follows the websocket: 1 while
connected, 0 otherwise, idle included. The alert reads
`service_component_up{component="marketStream"}` instead, which the health
handler writes from the same state `/health` reports, and which has no series
while the stream is idle.

## What to do

1. **Is Binance reachable at all?** The REST side shares the network:
   `sum by (outcome) (rate(trading_bot_market_data_binance_rest_requests_total[5m]))`.
   REST failing too means the network or the region, not the stream.
2. **Was it rate limited into a ban?** See
   [binance-rate-limit.md](binance-rate-limit.md). A 418 gets the address
   blocked for a while, and the websocket goes with it.
3. **Is it subscribed to anything?** A runtime config that never loaded leaves
   the service with an empty subscription list and the stream down.
   `trading_bot_market_data_active_kline_subscriptions` should be non-zero, and
   the `runtimeConfig` component should be `up`.
4. **Restart it.** The reconnect loop is the thing that is stuck; a fresh
   process re-subscribes and backfills what it missed.
