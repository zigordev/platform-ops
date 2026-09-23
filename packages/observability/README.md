# Observability kit

The reference implementation of the observability code every Node service runs.

Each service keeps its own copy under `apps/*/src/observability/` and maintains
it by hand. Nothing propagates a change made here and nothing compares the
copies; whoever changes the kit carries the change into the consumers that need
it.

## Why vendored rather than published

These are seven separate repositories across two GitHub owners, built by
Dockerfiles whose dependency stage copies only manifests. A private registry
would mean a token in every CI run and a build secret in every image, for a
handful of files.

If the estate grows past a handful of consumers, publish it properly; the
directory is already shaped like a package.

## What is in it

| file                                                 | for                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `tracing.ts`                                         | OTel bootstrap. Import **first**, before anything else                   |
| `json-logger.ts`                                     | structured logs carrying the trace of a sampled span, framework-free     |
| `metrics.registry.ts`                                | the plain prom-client registry, with the release as `service_build_info` |
| `metrics.registry.openmetrics.ts`                    | the same registry in OpenMetrics, for the Next apps that set exemplars   |
| `health-metrics.ts`                                  | health status and component gauges                                       |
| `feature-flags.ts`                                   | flag definitions, environment overrides and the Unleash client           |
| `http-metrics.middleware.ts`                         | request counter and duration histogram (Express)                         |
| `nest.ts`, `fastify.ts`                              | the NestJS and Fastify adapters                                          |
| `next.ts`                                            | the Next.js adapter: `/metrics`, the RUM ingest and the CSP report route |
| `fastify-rum.ts`                                     | the RUM ingest and the CSP report route for a frontend Fastify serves    |
| `rum-client.ts`, `RumProvider.tsx`                   | RUM in the browser: web-vitals, error details, the funnel                |
| `rum-ingest.ts`, `rum-metrics.ts`, `rum-details.ts`  | validation, metrics by page and release, error and poor-vital logs       |
| `csp-reports.ts`                                     | CSP violation reports in both browser formats, counted and logged        |
| `server-timing.ts`                                   | a response's `Server-Timing: traceparent`, for sampled spans only        |
| `mask.ts`                                            | emails and digits masked out of browser error messages                   |
| `probe-paths.ts`                                     | the probe paths the tracer never samples                                 |
| `route-names.ts`                                     | the route a Nest server span is named after, promoted from the router    |
| `standard-events.ts`                                 | `service.started`, `service.stopping`, `request.failed` and `process.*`  |
| `start-at-zero.ts`                                   | counters and histograms created at 0 for every label set they know       |
| `framework-logs.ts`                                  | Nest bootstrap and Fastify's listen line, kept out of the info logs      |
| `index.nest.ts`, `index.fastify.ts`, `index.next.ts` | the entry points                                                         |

`tracing.ts`, `json-logger.ts` and `metrics.registry.ts` are framework-free.
The adapters, `nest.ts`, `fastify.ts`, `next.ts` and `http-metrics.middleware.ts`,
assume their frameworks.

## How a server span is named

Every HTTP server span is named `{METHOD} {route}` — `GET /fut-pools/stats`,
not a bare `GET` — so one query reads the same across the Node services and the
Rust crate, and an SLI can name a route.

Next.js already names its own server spans that way. The Nest services did not.
Express 5 moved its routing into the standalone `router` package, so
`@opentelemetry/instrumentation-express` — the one piece that publishes the
resolved route onto the request — emits nothing at all, and
`@opentelemetry/instrumentation-router` handles the routing instead while
keeping the route on its own internal span. `instrumentation-http` looks on the
request for a route to rename the server span after, finds none, and leaves
`GET`.

`route-names.ts` bridges the two. It copies the route off the router's
request-handler span onto the request, and the HTTP instrumentation's own rename
then fires unchanged. Nothing in the kit formats `{METHOD} {route}` a second
time, which is how the Node and Rust halves stay identical by construction. The
route also reaches `http.server.request.duration`, which the SDK derives from
the same place.

The processor acts only on spans whose `router.type` is `request_handler`. That
guard is load-bearing: the router instrumentation emits a span per middleware
too, each carrying the mount point as its `http.route`, and one running after the
handler would collapse every route to `GET /`. Where there is no router
instrumentation it never fires, so the Next apps are untouched.

`tracing.ts` registers it under `spanProcessors`. That key and `traceExporter`
are alternatives rather than a pair — the SDK ignores the exporter once
`spanProcessors` is set — so the batch processor listed beside it is what
exports, and adding `traceExporter` back would stop every span with no error.
`@opentelemetry/sdk-node` installs the `@opentelemetry/core` and
`@opentelemetry/sdk-trace-base` this file imports, but a service vendoring it
should declare both rather than reach through the SDK.

## Which registry a service uses

Next apps use `metrics.registry.openmetrics.ts`. Nest and Fastify services use
`metrics.registry.ts`. The split is deliberate, and the two are not
interchangeable.

The reason is exemplars. The kit's `rum-metrics.ts` reads `registry.contentType`
and attaches a `trace_id` exemplar only when the registry is an OpenMetrics one,
and each Next app carries an `http-metrics.ts` — a Next-only file, which is why
the kit has no exemplar-setting middleware — that does the same for request
metrics. prom-client serialises exemplars in OpenMetrics only; under `0.0.4` it
drops them without a word. Prometheus runs with
`--enable-feature=exemplar-storage`, so those `trace_id`s are what makes the
metric-to-trace jump work in Grafana. Nest and Fastify services set no exemplars
at all, so the plain registry costs them nothing.

The choice belongs to the adapter, not the deployment, so it is a file and not
an environment variable: a misconfiguration would drop every exemplar in
production and look like nothing had happened.

Switching a service between the two changes its exposition, not what Prometheus
stores. OpenMetrics takes the `_total` suffix off the `# HELP` and `# TYPE`
family name, leaves it on the sample name, and ends the body with `# EOF`. The
series name and the metadata type Prometheus records are identical either way.
The trap is a counter that is not already named `*_total`: OpenMetrics appends
`_total` to its sample, so anything naming the bare form stops matching. Every
counter in the estate already ends in `_total`, and the next one has to as well.

`nest.ts`, `fastify.ts` and `next.ts` take the `Content-Type` off the registry
rather than naming a format, so the header and the body cannot disagree.

A Next app vendors `metrics.registry.openmetrics.ts` verbatim and reduces its own
`metrics.registry.ts` to a re-export of it. Every vendored file then stays a
verbatim copy, and a diff against the kit still means drift.

## Contract

Configuration is read from the environment, following the OpenTelemetry spec:

| variable                      | meaning                                                                                                               | default                      |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `OTEL_SERVICE_NAME`           | names the service in traces, logs, metrics, health                                                                    | required                     |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | **base** URL; the kit appends `/v1/traces`                                                                            | `http://otel-collector:4318` |
| `OTEL_TRACES_ENABLED`         | `false` disables tracing entirely                                                                                     | enabled                      |
| `OTEL_SERVICE_VERSION`        | the release, as `service_build_info{version}`; `APP_RELEASE` and then `NEXT_PUBLIC_RELEASE` are read when it is unset | `dev`                        |

`OTEL_EXPORTER_OTLP_ENDPOINT` is the base URL, not the traces URL. This is what
the OTel spec says, what the Rust services already assume, and what gpool did —
notifications was the one treating it as a full path, which is why the two
stacks needed different values for the same variable name.
