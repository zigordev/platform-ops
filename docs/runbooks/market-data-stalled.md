# Market data is not reaching anyone

**Alerts:** `MarketDataNotPublishing` (ticket), `MarketDataProducerDisconnected`
(ticket)

## What fired

Two different ways of noticing the same outcome: market-data is holding
subscriptions and nothing is coming out the other end.

- `MarketDataNotPublishing` is the evidence. No kline has been published for
  fifteen minutes while the service reports at least one kline subscription.
  Every subscription closes a candle at least once a minute, so this is not a
  quiet market.
- `MarketDataProducerDisconnected` is the service's own opinion: `/health`
  reports the Kafka producer as down.

The evidence alert is the one to trust. market-data sets its producer flag to
`up` once at startup and has no path that ever sets it back to `down`, so today
`MarketDataProducerDisconnected` cannot fire — it is written against the metric
that will be correct once trading-bot clears that flag on a publish failure, and
it costs nothing in the meantime. Until then, publishing stopping is detected by
the counter, not by the flag.

trading-bot runs locally only, so neither alert has a production counterpart.

## Whether it matters

Yes. Everything downstream of market-data is fed by these two topics:

- `trading-bot-execution` reads klines and aggregate trades. No messages means
  no evaluation, so no signals and no trades — silently, because an execution
  service with nothing to read looks idle rather than broken.
- The control-plane's data-readiness projection stops advancing, so the research
  service is never told a window is ready and schedules no backtests.

## How to see

```promql
sum(rate(trading_bot_market_data_kline_publish_total[5m]))
sum(rate(trading_bot_market_data_trade_publish_total[5m]))
max(trading_bot_market_data_active_kline_subscriptions)
```

Then look at whether the consumers are the ones complaining:

```promql
kafka:consumer_group_lag:sum{redpanda_group=~"trading-bot-.*"}
```

Lag that is flat at its old value while publishing is zero is the producer side.
Lag that is climbing is the opposite problem — messages are being written and
nobody is reading them.

The dashboard is **trading-bot-market-data**.

## What to do

1. **Is the stream up?** [market-stream.md](market-stream.md). No input is the
   commonest cause of no output, and it has its own alert.
2. **Is Redpanda up?** [redpanda-down.md](redpanda-down.md). When the broker is
   down, `RedpandaDown` pages and this is inhibited.
3. **Can this container reach the broker?** market-data resolves
   `platform-redpanda` over `platform_ops_shared`; a container started outside
   that network cannot, and fails every publish while looking healthy.
4. **Is it writing to ClickHouse?** `trading_bot_market_data_kline_store_failures_total`
   rising alongside means the store, not the broker — the historical store is a
   separate failure with the same shape.
5. **Restart it.** The producer is created at startup and is not rebuilt; a
   connection it has given up on is only replaced by a new process.
