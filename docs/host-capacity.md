# Host Capacity

Production is **one `t3.large`: 2 vCPU, 8 GiB**. Everything in the estate shares
it. This page exists because the next thing anyone wants to deploy is
`trading-bot`, and it does not fit — not marginally, not with tuning.

## What runs there now

23 containers.

| Group    | Containers                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ops (14) | tempo, otel-collector, alertmanager, prometheus, grafana, loki, tolgee, openbao, redpanda, unleash_db, unleash, central-ingress, alloy, node-exporter |
| Apps (9) | cv_web, gpool_db, gpool_api, gpool_web, kini_db, kini_api, kini_web, notifications_db, notifications_api                                              |

`sity` adds one: a single static-serving container, and it fits. The shared
side of its delivery is built here — ingress route, ECR repository, OIDC deploy
role — and `sity` now carries its own deploy workflow and production compose
file, so the code path is complete. It has still never deployed: its
`production` environment holds no values, so the v0.4.0 release deploy stopped
at its own variable check on a missing `AWS_REGION`, and `sity.zigordev.com` has
no DNS record. Nothing runs `sity-web` in production, so it has no prod scrape
job; the `sity-web` entry in `docker/observability-parity.json` records the gap.

## Why trading-bot does not fit

Measured locally, `trading-bot`'s seven containers come to **~10.6 GiB**, of
which **ClickHouse alone is 5.57 GiB**. The host has 8 GiB in total and is
already using most of it.

| Container                        | Role                                       |
| -------------------------------- | ------------------------------------------ |
| trading_bot_historical_store     | ClickHouse, ~5.57 GiB on its own           |
| trading_bot_db                   | Postgres                                   |
| trading_bot_market_data          | Rust, `mem_limit: 8g` in the local compose |
| trading_bot_research_backtesting | Rust, replays trades in bulk               |
| trading_bot_execution            | Rust                                       |
| trading_bot_control_plane        | Node                                       |
| trading_bot_operator_console     | Next, the only browser-facing surface      |

### What it would actually take

- **Co-located on the shared host**: today's 8 GiB plus ~10.6 GiB is ~19 GiB
  before headroom. The first size that holds that is a **`t3.2xlarge`
  (8 vCPU, 32 GiB)** — roughly four times the `t3.large` hourly rate, on top of
  the ~$99/month the estate costs now.
- **On its own host**: ~10.6 GiB measured needs **at least a `t3.xlarge`
  (4 vCPU, 16 GiB)**, and that leaves little room for ClickHouse merges or a
  large backtest. A second host also means a second ingress, a second Alloy, and
  either a second Prometheus or a remote-write path back to this one.

Neither is a deployment decision. It is a billing decision, and it is the
user's.

## So the path is built and inert

Everything `trading-bot` needs from `platform-ops` exists:

- an ingress vhost on `TRADING_BOT_CONSOLE_DOMAIN`, pointing at
  `trading-bot-operator-console:3000`
- an ingress vhost on `TRADING_BOT_API_DOMAIN`, pointing at
  `trading-bot-control-plane:8080`
- five ECR repositories under `trading-bot/prod/`, one for each image the
  deploy builds: control-plane, operator-console, market-data,
  research-backtesting and execution
- an OIDC deploy role and policy, scoped to those five repositories

What deliberately does **not** exist:

- **No prod scrape jobs.** Prometheus is not told to scrape any `trading-bot`
  service. A job pointed at a container that is not running makes `ServiceDown`
  fire forever, and an alert that is always on is an alert nobody reads. The
  five `trading-bot` entries in `docker/observability-parity.json` record that
  as a deliberate gap rather than an oversight.
- **No uptime probe.** Same reason: it would open an issue every five minutes.
- **No release-triggered deploy.** `trading-bot`'s deploy workflow is
  `workflow_dispatch` only. Merging a PR does not deploy it and cutting a
  release does not deploy it.

## Before you press the button

Two hostnames are meant to be reachable from a browser: the operator console
and the control plane behind `TRADING_BOT_API_DOMAIN`. The console reads its
control-plane URL from `NEXT_PUBLIC_CONTROL_PLANE_BASE_URL`, which is baked
into the browser bundle, so the browser calls the control plane directly and
opens a WebSocket to it. Market data, research-backtesting, execution,
Postgres and ClickHouse stay internal and have no ingress route, on purpose.

Deploying the console alone is possible and small — it is one Next container —
but it talks to a control plane that would not be there, so it would render and
then fail every call. The console is only useful once the services behind it
run, which is the part that needs the bigger instance.

If you are deploying it anyway, in this order:

1. Resize the host, or stand up a second one, per the numbers above.
2. Create the DNS records for `TRADING_BOT_CONSOLE_DOMAIN` and
   `TRADING_BOT_API_DOMAIN`. Both are needed: the console fails every call
   without the second.
3. Add the prod scrape jobs and delete the matching entries from
   `docker/observability-parity.json` — `npm run check:alerts` fails on an
   exception that no longer suppresses anything, which is what keeps this
   honest.
4. Add the console to the uptime probe.

## While the DNS record is missing

Both `sity` and `trading-bot` have an ingress vhost whose hostname does not
resolve yet. Caddy will try to get a certificate for each, fail the ACME
challenge, and retry with backoff. That failure is per-hostname and does not
touch the certificates for the sites that do resolve.

Both vhosts answer 502 until something is actually deployed behind them. For
`trading-bot` that waits on the resize. For `sity` it waits on a deploy
workflow and a production compose file in the `sity` repository: the DNS record
alone will not serve the scene.
