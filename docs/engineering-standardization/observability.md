# The observability contract

Every deployable implements all five of these. They are a contract because the
platform is built around them: Prometheus scrapes a path, Alloy parses a log
shape, Tempo receives a service name. A service that skips one is invisible in
that dimension, and the platform cannot tell the difference between "healthy"
and "not reporting".

In production that is six services: cv-web, gpool-api, gpool-web, kini-api,
kini-web and notifications-api. trading-bot's five and sity-web run the same
contract locally; neither has a deploy yet.

---

## 1. Traces

OTLP over HTTP to the shared collector. Bootstrapped before anything else
imports, so instrumentation can patch the modules it wraps.

Reference implementation: `platform-ops/packages/observability/tracing.ts`, and
`trading-bot/crates/observability` for the Rust services.

```ts
resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName });
traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
```

The kit loads the Node auto-instrumentations except `fs`, whose span per file
read drowns everything else, and `pino`, because the kit stamps the trace on log
lines itself. HTTP, the framework, `pg` and `kafkajs` are all covered.

**`OTEL_SERVICE_NAME` is `<repo>-<app>`** — `gpool-api`, `notifications-api`,
`cv-web`. This is the same string as the Prometheus job name and the Grafana
dashboard title. One name, three tools.

**Every span is kept.** Sampling is parent-based and always on: at this volume
a trace sampled away is a question nobody can answer later. The kit's tracer
drops the spans nobody reads (`/health`, `/metrics`, `/rum/*` and static files),
so a service's traces are its requests and its work rather than its probes.

**A log line names a trace only when that trace was sampled.** A line pointing
at a trace Tempo never stored is a link that opens nothing.

### Tempo and exemplars

Tempo keeps traces for 30 days. Its metrics generator turns every span into span
metrics, `traces_spanmetrics_calls_total` and `traces_spanmetrics_latency_bucket`
by `service`, `span_name`, `span_kind` and `status_code`, plus service-graph
edges, and remote-writes them into Prometheus with an exemplar per bucket. The
page latency objective every web app shares is built on them, since a page
render has no route metric, and every graph drawn from them is a door into a
trace. A recording rule does not carry exemplars, so a panel that wants one
reads the generator series and not `slo:page_render:*`. The
`local-blocks` processor keeps recent blocks queryable by TraceQL metrics, which
is what Traces Drilldown runs on.

Generator series carry `service`, never `job`, and no `environment`: a rule that
joins them to scraped series has to `label_replace` the service into a `job`.

An app's own histograms carry exemplars only when its registry speaks
OpenMetrics and the observation happens inside a sampled span. cv does both, for
its API routes and for RUM vitals, whose trace id comes from the page's
`traceparent` meta tag. The other services expose the text format, so their
exemplars come from span metrics alone.

Grafana wires the rest: a Prometheus exemplar and Loki's `traceId` field open
Tempo, and a span opens its logs and its service's request metrics.

---

## 2. Metrics

Prometheus text format on `GET /metrics`, unauthenticated on the private network.

Reference implementation: the kit's `http-metrics.middleware.ts` for Express,
`fastify.ts` for Fastify, and `withRouteMetrics` in `next.ts` for Next.js route
handlers.

**Every HTTP service exposes these two, with exactly these names and labels:**

```
http_requests_total              Counter    [method, route, status]
http_request_duration_seconds    Histogram  [method, route, status]
  buckets: 0.005 0.01 0.025 0.05 0.1 0.25 0.5 1 2 5
```

`route` is the **route pattern**, never the resolved path — `/pools/:id`, not
`/pools/8f2a`. A label whose cardinality grows with traffic will eventually take
Prometheus down.

Plus `collectDefaultMetrics()` for process and runtime gauges.

**Business metrics** are named `<domain>_<noun>_<verb>_total`, and every service
should have at least one. RED metrics tell you the API is healthy; they cannot
tell you nobody has joined a pool in six hours. notifications counts requests,
sends, failures, duplicates and dead letters, and times each delivery; cv counts
questions to the answer box, what they cost, and contact submissions. gpool
counts pool actions, predictions and notifications
(`gpool_pool_actions_total{action}`, `gpool_predictions_total{action}`,
`gpool_notifications_total{template,outcome}`); kini counts pool-sync runs, the
problems they meet and notifications (`kini_pools_sync_runs_total{outcome}`,
`kini_pools_sync_problems_total{source,problem}`,
`kini_notifications_total{template,outcome}`), with the clients on its socket as
the `kini_websocket_clients` gauge and every attempt to open it as
`kini_websocket_connections_total{outcome,reason}`; the trading-bot control plane counts
projections and configuration changes
(`trading_bot_control_plane_projections_total{stream,outcome}`,
`trading_bot_control_plane_config_changes_total{outcome}`). Every one of them
starts at 0 for each label set it knows, through the kit's `startAtZero`, so
the first event is an increase and not the birth of a series.

**Every service exports `service_build_info{version}`**, from the kit's registry:
the release from `OTEL_SERVICE_VERSION`, `APP_RELEASE` or `NEXT_PUBLIC_RELEASE`,
in that order. The dashboards mark a deploy when a new version appears.

**In a Next.js app, a metric recorded outside a route handler does not reach
`/metrics` on its own.** Next gives page renders, route handlers and
instrumentation module graphs of their own, each with its own copy of every
module and so its own registry, and `/metrics` serves one of them. Keep the
numbers on `globalThis` under a `Symbol.for` key and let the metric read them at
scrape time, as cv does for its flags and its copy source.

---

## 3. Logs

One JSON object per line, to stdout. Alloy tails the container and ships it to
Loki; nothing else is required of the application.

Reference implementation: `platform-ops/packages/observability/json-logger.ts`.

**The record shape is fixed:**

| Field       | Always            | Notes                                      |
| ----------- | ----------------- | ------------------------------------------ |
| `timestamp` | yes               | ISO 8601                                   |
| `level`     | yes               | `debug` `info` `warn` `error`              |
| `service`   | yes               | same value as `OTEL_SERVICE_NAME`          |
| `release`   | when known        | `OTEL_SERVICE_VERSION`, `APP_RELEASE`      |
| `event`     | for event lines   | dot-style name, from the fields passed in  |
| `message`   | for message lines | free text                                  |
| `context`   | when known        | the emitting class or module               |
| `traceId`   | when in a span    |                                            |
| `spanId`    | when in a span    |                                            |
| `error`     | on failures       | `name`, `message`, `stack` when unexpected |
| `stack`     | on errors         |                                            |

`error` goes to stderr; everything else to stdout.

**Fields go at the top level, not inside `message`.** Pass an object and it is
spread into the record, so LogQL reads `event` rather than `message_event` —
Loki flattens a nested object by prefixing it with its parent's name, which is
how a whole estate ended up querying fields that read as empty.

**`LOG_LEVEL` filters below a level**, defaulting to `info`. An unreadable value
keeps the default rather than silencing the service.

**`traceId` is the field that makes the platform cohere.** With it, a slow span
in Tempo and the log lines that produced it are one query apart. Without it,
Loki and Tempo are two tools that happen to be installed on the same host. Every
Node service logs through the kit's `json-logger.ts`, Fastify through the kit's
pino options, and the Rust services through the crate's formatter. No service
writes to the console directly.

### Levels

Four levels, and choosing one is a promise about who reads the line:

| level   | means                                                                | read by                    |
| ------- | -------------------------------------------------------------------- | -------------------------- |
| `error` | something failed that a person should look at                        | `ErrorLogsSpiking`, people |
| `warn`  | something went wrong and was handled: a retry, a fallback, a refusal | dashboards, when asked     |
| `info`  | the service's lifecycle and its business events                      | queries                    |
| `debug` | detail for a local run, filtered out in production by `LOG_LEVEL`    | nobody in production       |

The kit's Nest logger writes Nest's `log` as `info` and `verbose` as `debug`, and
its kafkajs adapter maps the client's numeric levels, so every service writes
the same four strings. Framework chatter stays out of `info`: Nest's bootstrap
and route-mapping lines go to `debug` (`framework-logs.ts`; a gpool-api restart
wrote 63 of them against 4 of its own), the kit's Fastify options drop Fastify's
"Server listening at" line, and the Fastify services turn off its per-request
lines with a `LogController`. `service.started` says once what they said. An expected failure is a `warn`: a Tolgee timeout that
fell back to the committed copy is the design working, and logging it as an
error teaches everyone to ignore the ticket that error lines raise.

### Events

A line recording that something happened carries an `event`: `<area>.<what
happened>`, lower case, words joined by underscores, such as `ask.completed`,
`contact.publish_failed`, `notification.dead_lettered` or `smtp.recovered`. The
name is an interface. Dashboards, runbooks and the log alerts query it, so
renaming one breaks them, and a new outcome gets a new name rather than a new
meaning for an old one. Everything else about the event goes in top-level fields
beside it, never inside `message`.

Every service also writes the standard events: `service.started` with its
release and runtime, `service.stopping` with the signal, `request.failed` for a
response the service failed to produce (a 5xx), and `process.uncaught_exception`
and `process.unhandled_rejection`. The Node services write them from the kit's
`standard-events.ts`. The Rust services write them from their crate, with two
differences: their `service.started` carries no runtime, and a panic is their
`process.uncaught_exception`, with no rejection counterpart. `UncaughtExceptions`
reads the fourth. They are observed rather than handled, so what follows depends
on the runtime. A Node API or sity's server still dies of an uncaught exception,
and the log line is written on the way down. A Next app keeps serving after
both, because Next handles them itself; the web apps write them from
`instrumentation.ts`, and the kit logs a rejection there as a `warn`
(`rejections: 'observe'`). A Rust panic ends the task it happened in, or the
process when it is the main one. Each service's own events:

| service                               | events                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cv-web                                | `request.failed`, `contact.rejected`, `contact.queued`, `contact.publish_failed`, `ask.configured`, `ask.completed`, `ask.budget_unreadable`, `ask.budget_unpersisted`, `flags.unavailable`, `flags.recovered`, `flags.changed`, `i18n.fallback`, `csp.violation`, `rum.client_error`, `rum.vital_poor`, `secrets.unavailable`, `secrets.missing`                                                                                                                                                                                                                                                                                             |
| notifications-api                     | `kafka.consumer_started`, `kafka.consumer_crashed`, `notification.retry_scheduled`, `notification.paused_for_relay`, `notification.routed_to_dlt`, `notification.duplicate`, `notification.already_processing`, `notification.sent`, `notification.failed`, `notification.dead_lettered`, `notification.dlt_payload_invalid`, `smtp.unavailable`, `smtp.recovered`, `postgres.idle_client_error`, `postgres.migrations_applied`, `postgres.unavailable`, `postgres.recovered`                                                                                                                                                                 |
| gpool-api                             | `pool.created`, `pool.updated`, `pool.configured`, `pool.deleted`, `pool.joined`, `pool.access_requested`, `pool.access_granted`, `pool.invitation_sent`, `pool.invitation_accepted`, `pool.invitation_already_member`, `match.results_recorded`, `match.results_cleared`, `bracket.phase_created`, `bracket.eliminations_synced`, `bracket.scoring_recalculated`, `auth.user_created`, `auth.login_failed`, `notification.queued`, `notification.skipped`, `notification.duplicate`, `notification.publish_failed`, `kafka.producer_connected`, `kafka.producer_disconnect_failed`, `postgres.schema_verified`, `postgres.idle_client_error` |
| kini-api                              | `pools_sync.enabled`, `pools_sync.empty`, `pools_sync.unmapped`, `pools_sync.failed`, `team.invitation_sent`, `team.legacy_pools_adopted`, `auth.login_failed`, `notification.queued`, `notification.publish_failed`, `kafka.producer_connected`, `kafka.producer_disconnect_failed`                                                                                                                                                                                                                                                                                                                                                          |
| trading-bot-control-plane             | `kafka.consumer_started`, `backtest.projection_hydrated`, `backtest.projection_hydration_failed`, `backtest.progress_projection_failed`, `backtest.completed_projection_failed`, `data_readiness.projection_failed`, `config.publish_failed`, `config.publish_skipped`, `kafka.producer_connected`, `kafka.producer_disconnect_failed`, `postgres.unavailable`, `postgres.recovered`                                                                                                                                                                                                                                                          |
| trading-bot Rust services             | market-data: `subscriptions.refreshed`, `refresh.*`, `kline_backfill.*`, `trade_backfill.*`, `trade_gap_repair.*`, `compaction.*`, `binance.*`, `clickhouse.request_retry`, `data_readiness.publish_failed`; research-backtesting: `backtest.*`, `backtest_scan.*`, `trade_cache.*`, `trade_retrieval.*`, `kafka.consumer_*`; execution: `kline.*`, `trade.*`, `paper_trade.closed`, `reconciliation.no_free_balance`, `control_plane.refresh_failed`; progress lines are at `debug`                                                                                                                                                          |
| gpool-web, kini-web, operator console | `request.failed` (a failed render, with route and digest), `i18n.fallback`, `csp.violation`, `rum.client_error`, `rum.vital_poor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| sity-web                              | `request.failed`, `csp.violation`, `rum.client_error`, `rum.vital_poor`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Two notifications events predate the convention and should be renamed together
with the queries that read them: `notification_failure_audit_failed` and
`notification_failure_lease_release_failed`.

### Log alerts

Three rules in `docker/loki/rules/fake/log-alerts.yml`, all tickets.
`ErrorLogsSpiking` fires when a service writes more than one error line every
five seconds for ten minutes, and `UncaughtExceptions` on any
`process.uncaught_exception` line: a Next app or a Rust task goes on after one
with nothing else firing, and a process that exits and restarts shows only as a
gap in its metrics. Both group by `app` and `environment` and match only a non-empty
app, so a container that writes no service field cannot page under a blank name.
The third, `NotificationsConsumerCrashLooping`, reads `kafka.consumer_crashed`,
which the consumer writes at `warn` when the client restarts it — a level the
error rule filters out, on a path that leaves every metric where it was. Logs never
page: a page needs a symptom visitors feel, and that is a metric's job. The
level policy above is what keeps the error rule worth reading.

All three copy `app` into a `job` label, and `environment` reaches them because
Alloy stamps it on every stream from `ENVIRONMENT`. Alertmanager compares
`environment` and `job` in its inhibit rules, and Loki's ruler has no
`external_labels` setting to supply either, so without both a log alert is never
inhibited by the `ServiceDown` that explains it and the same outage arrives
twice.

---

## 4. The shared kit

Every Node service runs a copy of the observability code that originated in
`platform-ops/packages/observability/`, kept under `apps/*/src/observability/`
and maintained by hand in each repository. Nothing propagates a change from
here; the kit is the reference, and carrying a change into a consumer is a
deliberate edit there. What is not left to memory is noticing that the edit
never happened — see [the parity check](#the-parity-check).

| file                                                | for                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `tracing.ts`                                        | OTel bootstrap; **import first**, see below                           |
| `json-logger.ts`                                    | structured logs carrying the trace of a sampled span                  |
| `metrics.registry.ts`                               | the one prom-client registry, with `service_build_info`               |
| `health-metrics.ts`                                 | the health status and component gauges                                |
| `feature-flags.ts`                                  | flag definitions, environment overrides and the Unleash client        |
| `http-metrics.middleware.ts`                        | request counter and duration histogram (Express)                      |
| `nest.ts`, `fastify.ts`                             | the NestJS and Fastify adapters                                       |
| `next.ts`                                           | the Next.js adapter: `/metrics`, the RUM ingest and CSP report routes |
| `rum-client.ts`, `RumProvider.tsx`                  | RUM in the browser                                                    |
| `rum-ingest.ts`, `rum-metrics.ts`, `rum-details.ts` | the RUM ingest: validation, metrics, error and poor-vital logs        |
| `csp-reports.ts`, `server-timing.ts`, `mask.ts`     | CSP reports, `Server-Timing: traceparent`, masking browser messages   |
| `probe-paths.ts`                                    | the probe paths the tracer never samples                              |
| `standard-events.ts`                                | start, stop, failed requests and crashes, as events                   |
| `start-at-zero.ts`                                  | counters and histograms created at 0 for every label set they know    |

Vendored rather than published because these are seven repositories across two
GitHub owners, built by Dockerfiles whose dependency stage copies only
manifests. A private registry would mean a token in every CI run and a build
secret in every image, for a dozen files.

### The parity check

A vendored copy decays in two directions, and they need different answers.

An **edit** is a local change to a copy that never went back upstream. It is
fully described by the bytes in the repository that made it, so its check is
offline and deterministic, and it blocks the pull request that introduced it.

**Staleness** is the kit moving on while a copy stayed. Nothing inside the copy
describes it — a manifest of hashes committed beside the copy agrees with itself
forever — so it can only be seen by comparing against the kit as it is now. That
comparison needs the network, and a network failure must never be a red build on
an unrelated change. So staleness is reported and not enforced: it annotates the
run, and a weekly scheduled run is what fails.

The split matters most in the case that is normal rather than exceptional:
platform-ops merges a kit change, and for the next few days the consumers have
not vendored it yet. Every one of them is behind, on purpose. A check that
treated behind as a failure would turn every unrelated pull request in five
repositories red until someone did the rounds, and would be switched off within
a week.

`packages/observability/kit.manifest.json` is what both halves read. It is
generated from the kit by `npm run kit:manifest`, holds a SHA-256 per file and a
`digest` over all of them, and CI regenerates and compares it, so the kit and the
manifest cannot disagree. Each consumer commits an `observability.kit.json` that
embeds the manifest it last vendored against, names the directories it vendors
and under which profile, and declares its deviations. `scripts/check-kit-parity.mjs`
is one script body shared by every repository, like `check-licences.mjs`.

The kit is fetched over `raw.githubusercontent.com` rather than installed. All
eight repositories are public, so no token is needed, which is the objection
that ruled out publishing the kit to a registry in the first place. A submodule
would pin honestly but would have to be cloned by every Dockerfile and every
`actions/checkout`, and would still not let a consumer vendor a subset.

#### Declared deviations

A justified deviation is declared in `observability.kit.json`, where it can be
read, rather than being pattern-matched away in the checker. Three rules exist:

| rule                  | for                                                                 |
| --------------------- | ------------------------------------------------------------------- |
| `js-import-extension` | a copy compiled as NodeNext ESM, whose relative imports carry `.js` |
| `alias`               | a file compared against a differently named kit file                |
| `exempt`              | a copy deliberately forked, with a reason and an optional expiry    |

The trading-bot control plane declares `js-import-extension`. A deviation that
stops being needed fails the check, and so does one naming a file that is not
there: the declaration is kept honest in the same pass as the copies.

The Next apps' registry split is not a deviation. `kit.profiles.json` gives each
profile a `kit` list, vendored verbatim and compared, and a `local` list of files
the app writes itself and the profile still requires. `metrics.registry.ts` is
`local` in the `next` profile: the app provides a re-export of the
`metrics.registry.openmetrics.ts` it did vendor, for the reason in
[the kit's README](../../packages/observability/README.md). Declaring it once in
the profile beats four identical deviations that each look like a fork.

The profile lists are checked for closure: a profile that carries a file must
carry, in one list or the other, every kit file that file imports. That check
found `route-names.ts` missing from two profiles the first time it ran.

#### Adopting it in a consumer

Copy `scripts/check-kit-parity.mjs` in verbatim — it is a shared body, and
`verify-standards.sh` fails the estate if the copies differ. Then write an
`observability.kit.json` at the repository root:

```json
{
  "schema": 1,
  "kit": { "repo": "zigordev/platform-ops", "ref": "main" },
  "pinned": {},
  "copies": [{ "path": "apps/api/src/observability", "profile": "nest" }],
  "deviations": []
}
```

`node scripts/check-kit-parity.mjs --repin` fills `pinned` from the kit's
current manifest; commit the result. Add `"check:kit": "node
./scripts/check-kit-parity.mjs"` to `package.json`, put it in the repository's
`check:hooks` chain, and give CI two steps: `npm run check:kit -- --offline` in
the quality job, and `npm run check:kit -- --strict-remote` in a weekly scheduled
workflow. The first blocks an edit; the second is what eventually makes being
behind somebody's problem.

Re-vendoring is then: copy the changed files in, run `--repin`, commit both.
The pin and the copies move together or the check fails, which is the point.

### The Rust half

The Rust services cannot vendor a TypeScript package, so `trading-bot/crates/observability`
is the equivalent: a workspace crate, not three copies, because copies drift and
the drift here is silent — the alerts simply stop covering a service.

It carries three things:

- **`HttpMetrics` + `track_http_metrics`**, an axum middleware emitting
  `http_requests_total` and `http_request_duration_seconds` under exactly the
  names and labels the Node middleware uses. The `route` label comes from
  axum's `MatchedPath`, and unmatched requests are labelled `unmatched` rather
  than by their raw path — otherwise a scanner probing random URLs creates a
  time series per probe.
- **`tracing_setup::init`**, the OTLP exporter and a log formatter producing the
  estate's JSON shape. `tracing_subscriber`'s own `.json()` writes
  `{"fields":{"message":...},"target":...}` with no `service` and no trace id,
  which would be a third log format in an estate that already agreed on one.
- **A span per HTTP request**, created by the same middleware.

That last one is the part that is easy to get wrong. **`tracing-opentelemetry`
exports spans, not events** — so wiring up the OTLP exporter without creating a
single span exports nothing at all, and nothing warns you. The three Rust
services had no `info_span!` or `#[instrument]` anywhere in them, so the
middleware is currently their whole tracing surface. Adding spans to the
interesting internals — backfill batches, order placement, backtest runs — is
where the next real value is.

### Import tracing first. Not second.

```ts
import './observability/tracing'; // FIRST. Nothing above this line.

import { NestFactory } from '@nestjs/core';
```

OpenTelemetry instruments by patching modules as they load. Anything required
before `tracing` is never patched, and it fails silently — you still get traces,
just thinner ones, which is far harder to notice than no traces at all.

This is not hypothetical. gpool had the import at the _bottom_ of its import
list. Its traces contained express middleware spans and nothing else: no
`pg.query`, no controller spans, because `pg` and `@nestjs/core` had already
loaded. notifications, which imported it first, produced all three. The two
services looked equally instrumented until someone compared span names.

### Configuration

| variable                      | meaning                                            | default                      |
| ----------------------------- | -------------------------------------------------- | ---------------------------- |
| `OTEL_SERVICE_NAME`           | names the service in traces, logs, metrics, health | required                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | **base** URL; the kit appends `/v1/traces`         | `http://otel-collector:4318` |
| `OTEL_TRACES_ENABLED`         | `false` disables tracing entirely                  | enabled                      |
| `OTEL_SERVICE_VERSION`        | the release, as `service_build_info{version}`      | `APP_RELEASE`, then `dev`    |

`OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL, per the OTel spec. notifications
used to treat it as the full traces URL, and its env files still carried the full
path in September 2026, so every span went to `.../v1/traces/v1/traces`, got a
404 and was dropped without an error. If a service's traces are missing and
nothing complains, check this first.

Tracing reads the environment directly rather than a config object, because it
must run before any DI container exists. A `tracingEnabled` field in a config
service is a field that cannot be honoured.

## 5. Health

**One endpoint per service: `GET /health`.** It probes dependencies and returns
200 only when the service can actually do its job.

```
GET /health   200 ok / 200 degraded / 503 error

{ "status": "ok",
  "service": "gpool-api",
  "components": { "db":    { "status": "up" },
                  "kafka": { "status": "up" } } }
```

`status` is one of three values, and the distinction is the point:

| `status`   | code | meaning                                                 |
| ---------- | ---- | ------------------------------------------------------- |
| `ok`       | 200  | every component up                                      |
| `degraded` | 200  | an **optional** component down — reduced, still serving |
| `error`    | 503  | a **required** component down — cannot do its job       |

Which components are required is a per-service judgement, and it is not
symmetric across the estate:

- **The database is always required.** Without it there is nothing to serve.
- **Kafka is required for the consumer, optional for the producers.**
  notifications consumes `notification.email.requested.v1`; a consumer that has
  dropped out of its group stops working silently, with mail piling up and
  nothing erroring anywhere, so its loss is a 503. gpool and kini only produce to
  that topic — a broker outage stops emails being queued but leaves every other
  request working, so it is a `degraded` 200. Failing the whole check there would
  take a mostly-working service out of rotation.

A component may also report `"unknown"`, which is not a failure: it means no
connection has been attempted yet. Reporting `down` at boot would be a lie.

What each service reports, and what it treats as fatal:

| service                          | components                                                                    | `degraded` when |
| -------------------------------- | ----------------------------------------------------------------------------- | --------------- |
| cv-web                           | `kafka`, `tolgee`, `unleash`                                                  | any one down    |
| gpool-web, kini-web              | `tolgee`                                                                      | `tolgee` down   |
| trading-bot-operator-console     | `tolgee`, only when Tolgee is configured, which it is not today               | `tolgee` down   |
| sity-web                         | none: it serves files and depends on nothing                                  | never           |
| gpool-api                        | `db`, `kafka`                                                                 | `kafka` down    |
| kini-api                         | `db`, `kafka`                                                                 | `kafka` down    |
| notifications-api                | `db`, `kafka`, `smtp`                                                         | never           |
| trading-bot-control-plane        | `db`                                                                          | never           |
| trading-bot-market-data          | `runtimeConfig`, `kafkaProducer`, `kafkaConsumer`, `marketStream`, `database` | never           |
| trading-bot-execution            | `controlPlane`, `marketData`, `executionContext`, `exchange`                  | never           |
| trading-bot-research-backtesting | `controlPlane`, `historicalStore`                                             | never           |

gpool, kini and cv have optional dependencies. The web apps render from
committed copy when Tolgee is gone, and cv from default flags when Unleash is, and only the contact form
needs the broker. Everything else cannot work without the dependencies it has,
so their loss is a 503: notifications counts the SMTP relay among them, because
a relay rejecting its login means no email leaves.

Component values are objects, not bare strings — `{"status": "up"}` rather than
`"up"`. The nesting looks redundant for a bare up/down, and it is, until the day
a component needs a `latencyMs` or a `lastSeenAt` beside its status. Adding a
field to an object breaks no consumer; replacing a string with an object breaks
every one.

### Probing a broker you only produce to

A consumer knows the broker is gone: it crashes and reports it. A **producer**
does not. kafkajs gives a producer no way to ask "is the broker still there" —
its `DISCONNECT` event fires when _you_ disconnect, not when the broker
vanishes, and the connection pool reconnects lazily on the next send. Measured,
not assumed: with the broker stopped, a passive flag on gpool's producer read
`up` indefinitely.

So gpool and kini each run a small admin client on a 15-second timer, asking for
cluster metadata and recording whether it answered. Retries are off and the
timeouts are 3s: this is a probe, not a request that matters, and it must fail
fast rather than leave the health endpoint blocked behind a retry ladder. Health
reads the cached flag, so the endpoint stays instant.

Measured recovery after the broker came back: producers 25s, the consumer 75s
(its own retry backoff). Both self-heal without a restart.

`service` is the same string as `OTEL_SERVICE_NAME`, so health, metrics, traces
and logs all identify a service identically.

Keep the check under a second: one that times out under load turns a slow
service into a down one.

**Set the status code; do not throw.** Throwing routes the response through the
global exception filter, which replaces the body with its own error shape — so
the 503 arrives saying nothing about _which_ dependency failed, which is the only
part worth having. Use `@Res({ passthrough: true })` and `res.status(503)`.

**Health sits outside any global prefix, on every service including the Next.js
apps.** gpool excludes it alongside `metrics` in `setGlobalPrefix`; cv serves
`src/app/health/route.ts` rather than `src/app/api/health/`. A probe address that
varies by framework is a probe address someone will get wrong.

cv always answers 200, with `degraded` when any of its three is down; it has no
dependency whose loss stops the page rendering.

### On collapsing liveness into health

The estate previously exposed `/health/liveness` (process up, no dependencies
touched) alongside `/health/readiness` (dependencies probed). One endpoint is
simpler and matches how these services are actually run, but the merge does lose
something worth writing down.

Liveness answers "restart me"; readiness answers "stop routing to me". Under
Docker Compose that distinction costs nothing: a failing healthcheck marks a
container unhealthy and Docker does **not** restart it. Under Kubernetes it
matters — a dependency-probing endpoint wired to `livenessProbe` turns a database
blip into a restart loop, and restarting a service never fixes its database.

**So: if any service moves to Kubernetes, point `readinessProbe` at `/health`
and give that service a separate dependency-free liveness path.** Until then the
single endpoint stands.

One live consequence today: `depends_on: service_healthy` blocks dependents while
a service is merely degraded, because Compose sees only healthy/unhealthy and a
`degraded` 200 reads as healthy — which is the behaviour we want, and the reason
producers return 200 rather than 503 when the broker is gone.

---

## 6. Real User Monitoring

Every UI in the estate runs the same RUM client from the kit: Core Web Vitals,
JavaScript errors, clicks, navigation, and frustration signals (rage clicks,
dead clicks, excessive scrolling). Each UI ingests its own beacons at
`POST /rum/events` and exposes the results on its own `/metrics`, so the five
UIs are Prometheus targets in their own right: the four Next apps, and sity,
whose Fastify server takes the same routes from the kit's `fastify-rum.ts`.

Ingesting locally rather than posting to a backend API is what makes this
uniform: cv, sity and the operator console have no API of their own, and a UI that
reports its own experience needs no cross-service hop to do it.

### This endpoint is public, and that shapes everything

`POST /rum/events` cannot be authenticated. It is called by anonymous visitors,
before any login, often while the page is being unloaded. It is the only
unauthenticated write endpoint in the estate, so the protections live in the
handler:

| control               | what it stops                                             |
| --------------------- | --------------------------------------------------------- |
| Same-origin check     | a browser on another site posting on a visitor's behalf   |
| 64 KB body cap        | a single request tying up the process                     |
| 60 batches/min per IP | one client flooding the metrics                           |
| Allow-listed names    | **the important one — see below**                         |
| Route normalisation   | one time series per entity id                             |
| 204 empty response    | the endpoint working as an oracle for probing the filters |

**Every label value is chosen by the server, never by the caller.** Event names
are matched against an allow-list and anything else becomes `other`; paths are
collapsed to route patterns. Without that, `POST`ing a loop of random event
names creates unlimited Prometheus time series from the open internet — a
metrics endpoint is a write endpoint, and an unbounded label is a denial of
service with extra steps.

The rate limiter is a fixed window in process memory. In memory because this
must not add Redis to four web apps for a counter; it is a floor, not a
boundary, and a distributed flood still needs the reverse proxy in front of it.
`x-forwarded-for` is trusted only as far as its first entry, since the whole
header is caller-controlled when no proxy rewrites it.

### What is deliberately not collected

The original implementation in gpool sent, with every event: the full
`location.href` including the query string, the `userAgent`, the `id`,
`className` and visible `textContent` of whatever was clicked, the signed-in
user's id, and error stack traces. One call site passed an invitee's **email
address** as event metadata.

None of that survives. Query strings carry session tokens; button text is
user-visible copy that routinely contains names and email addresses; a user id
makes every event personally identifying for a signal that is aggregate by
nature; stack traces carry values from the code that threw. What is sent now is
a bounded enum and a number — which is exactly what makes an unauthenticated
ingest endpoint acceptable. There is nothing in the payload worth stealing.

Business events survive as names only: `trackEvent('Pool Created')`, with the
name declared in that app's `customInteractions` allow-list. Metadata is gone,
because it could never become a label and only ever shipped personal data.

`normalizePage` is the security-critical function here and has unit tests in
`packages/observability/rum-metrics.test.ts`. They exist because it shipped
broken: `..` matches the route-character test, so `/../../etc/passwd` reached a
label verbatim until a probe caught it.

### Beyond the vitals

- **Error details.** A browser error arrives with its message masked (emails and
  digits removed) and its stack mapped through the build's source maps on the
  server, so the log line names the source file and line. Each distinct error is
  logged once every ten minutes as `rum.client_error`; the metric counts them
  all.
- **The trace behind a page view.** Next's `clientTraceMetadata` renders the
  page's `traceparent` into a meta tag. The client attaches its trace id to LCP,
  FCP and TTFB, and the server keeps it as an exemplar when the trace was
  sampled.
- **Content security policy.** cv sends a report-only policy with a nonce made
  per request by `src/proxy.ts`, so Next's own inline scripts pass and anything
  else is reported to `POST /rum/csp`, counted by directive in
  `csp_violations_total` and logged as `csp.violation`. It uses `report-uri`
  only: Chromium never delivered a `report-to` report to the local endpoint.
- **Every series carries the release**, so a regression shows as one release
  against the one before.

---

## 7. Dashboards

Dashboards are code. `platform-ops/packages/dashboards/` holds one TypeScript
file per dashboard, and `npm run dashboards` writes the JSON Grafana provisions
from `platform-ops/docker/grafana/provisioning/dashboards/<folder>/`, together
with one provider per folder. Nothing is edited in the Grafana UI: provisioned
dashboards refuse UI saves, and a test fails when the committed JSON is not what
the generator writes.

Five folders, each with its own provider:

| folder   | what it answers                             | dashboards                                                     |
| -------- | ------------------------------------------- | -------------------------------------------------------------- |
| Estate   | is anything wrong, and are we within budget | Estate overview, Service level objectives                      |
| Services | how one service is doing, down to a trace   | Service overview (any Node service), cv-web, notifications-api |
| Frontend | what visitors experience                    | RUM overview (any web app), RUM · cv                           |
| Platform | the host, the edge, the tools themselves    | Host, Edge, Observability and messaging                        |
| Business | what people do and what it costs            | cv funnel, Email delivery                                      |

Every dashboard marks deploys: the first ten minutes of a `service_build_info`
version not seen in the three days before are drawn on every graph, so a host
switched off overnight does not look like a deploy each morning. Latency panels
ask for exemplars, and the Services dashboards list the latest failing traces.
Every alert names a dashboard in a `dashboard` annotation, and the alert email
links it with the service and the time the alert started, so the failing trace
is two clicks from the email.

A new dashboard is a file in `packages/dashboards/dashboards/`, listed in its
`index.ts`. The generator's tests check that every metric a query names is in
`lib/metrics.ts` and that every alert links a dashboard that exists.

---

## Profiles

Three kinds of service run here. Each implements the five parts above, plus
what its kind needs.

### A web app: cv-web, gpool-web, kini-web and the operator console

- `/metrics`, `POST /rum/events` and `POST /rum/csp` from the kit's `next.ts`,
  and `/health` at `src/app/health/route.ts`.
- API route handlers wrapped in `withRouteMetrics`, which counts them and
  answers with `Server-Timing: traceparent` for a sampled span.
- `experimental.clientTraceMetadata: ['traceparent']` in `next.config.js`, so a
  page view can be tied to its render trace. The proxy runs in a trace of its
  own, so a header set there names the wrong trace.
- Page renders measured from span metrics, not route metrics: `GET /…` and
  `RSC GET /…` server spans, with a page latency objective of 95% under 512 ms,
  Tempo's bucket edge nearest half a second. `slo:page_render:latency_bucket`
  and `slo:page_render:latency_count` select them for every app at once, so an
  app inherits the objective by being named `<repo>-web` or `<repo>-console` and
  emitting spans, not by getting rules of its own.
- A registry that speaks OpenMetrics, for exemplars, and metrics recorded while
  rendering kept on `globalThis` (section 2).
- A report-only CSP with a nonce per request and `report-uri /rum/csp`. A
  hand-written inline script takes the nonce from the request's policy. A
  socket to another origin is named with its `ws:` or `wss:` scheme too, since
  Chromium does not let an `http:` source cover the same host's socket scheme:
  kini's socket.io and the console's `/ws/ops`. The console builds zod 4 object schemas, so it sets
  `z.config({ jitless: true })`; zod otherwise probes eval and every page view
  reports it.
- `instrumentation.ts` starts the tracer and writes the standard events inside a
  `NEXT_RUNTIME === 'nodejs'` block. An early return instead still lets
  Turbopack compile the Node code into the Edge bundle, with a warning per call.
- `OTEL_SERVICE_NAME` set in every compose file; without it the kit logs as
  `unknown-service`.

### A static site: sity-web

- A Fastify server (`apps/web/server`) serves the Vite build: assets cached for
  30 days, the page revalidated on every visit, any other path answered with the
  page.
- `/metrics` and the request metrics from the kit's `fastify.ts`, `/health`
  recorded through `health-metrics.ts`, and `POST /rum/events` and
  `POST /rum/csp` from `fastify-rum.ts`. With no proxy
  in front, the socket address keys the RUM rate limit.
- RUM from production builds only, with errors mapped through the Vite source
  maps under `/assets/`.
- A report-only CSP without a nonce, because the page has no inline script.
  `'wasm-unsafe-eval'` and `data:` in `connect-src` are there for the scene's
  WebAssembly decoders and the geometry its models embed.
- No traces: the server serves files and calls nothing downstream.

### An API: gpool-api, kini-api and the trading-bot control plane

- `http_requests_total` and `http_request_duration_seconds` from the kit's
  middleware, with `/metrics` and `/health` outside the global prefix.
- Two objectives: 99.5% of requests not answered 5xx, and 95% within 500 ms, as
  multi-window burn rates, gated on about three requests a minute.
- A producer probes its broker on a timer (section 5), because a kafkajs
  producer cannot tell that the broker is gone.
- The release as `APP_RELEASE`, so `service_build_info` marks its deploys.
- `request.failed` for a 5xx only; a 4xx is in the response and the metrics.
- Domain counters that start at zero (section 2), and state changes logged once:
  `postgres.unavailable` when a readiness probe first fails, `postgres.recovered`
  when one first passes again.

### A consumer: notifications-api

- **A trace per message**, parented on the producer's `traceparent` header, so a
  contact message is one trace from cv's handler to the SMTP reply:
  `notification.process`, with `notification.claim`, `notification.render` and
  `smtp.send` under it.
- **A delivery objective instead of a request one.** Its HTTP traffic is only
  probes. 99% of requested emails are sent within two minutes of the request:
  `notification_delivery_duration_seconds` under 120 s over
  `notifications_received_total`, on the same burn ladder, gated on any email in
  the window.
- **Pause on a dead dependency; never dead-letter it.** When the SMTP relay
  rejects the login or stops answering, the consumer pauses its partition and
  retries after a backoff (`SMTP_OUTAGE_BACKOFF_MS`, 30 s by default). `/health`
  reports `smtp` down, a 503, so `ServiceUnhealthy` pages, and the waiting emails
  go out when the relay comes back. Dead-lettering is for a message that can
  never succeed, such as an unknown template, not for an outage that will end.
- **Lag from the broker, not the app.** `kafka:consumer_group_lag:sum` is
  Redpanda's newest offset minus the group's committed one.
  `NotificationsConsumerStuck` fires when it stays above zero for fifteen
  minutes, and `DeadLetterQueueGrowing` on any dead letter.

Not in any profile yet: only cv reads exemplars from its own histograms, and
only cv-web and notifications-api have dashboards of their own. The other
services appear in the shared service, RUM and estate dashboards.
