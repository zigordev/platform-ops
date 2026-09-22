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
| `metrics.registry.ts`                                | the one prom-client registry, with the release as `service_build_info`   |
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
| `standard-events.ts`                                 | `service.started`, `service.stopping`, `request.failed` and `process.*`  |
| `start-at-zero.ts`                                   | counters and histograms created at 0 for every label set they know       |
| `framework-logs.ts`                                  | Nest bootstrap and Fastify's listen line, kept out of the info logs      |
| `index.nest.ts`, `index.fastify.ts`, `index.next.ts` | the entry points                                                         |

`tracing.ts`, `json-logger.ts` and `metrics.registry.ts` are framework-free.
The adapters, `nest.ts`, `fastify.ts`, `next.ts` and `http-metrics.middleware.ts`,
assume their frameworks.

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
