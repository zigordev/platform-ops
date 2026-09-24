# platform-ops

Shared operations and infrastructure repository for platform services.

## Repository shape

- `docker/` — the ops stack: `compose.ops.local.yml`, `compose.ops.prod.yml` and per-service config folders (`openbao/`, `grafana/`, `loki/`, `prometheus/`, `otel/`, `alertmanager/`, `tolgee/`)
- `infra/terraform/` — the AWS infrastructure every product deploys onto
- `scripts/` — local stack, remote deploy, and the checks husky and CI run
- `observability/` — the kit each product copies
- `docs/` — `local-first-start.md`, `cloud-first-deploy.md`, the runbooks and the engineering standard
- `.github/workflows/` — CI, deploy, release, governance workflows

## Quick start

1. Install dependencies

```bash
npm ci
```

2. Start the ops stack

```bash
npm run local:up
```

That creates the shared `platform_ops_shared` network every product attaches to, and brings up OpenBao, Redpanda, Tolgee and the observability services. First-time setup — initialising and unsealing OpenBao, seeding Tolgee — is in `docs/local-first-start.md`.

3. Stop it

```bash
npm run local:down
```

`npm run local:reset` stops it and drops the volumes, which discards local secrets and translations.

## Quality commands

```bash
npm run format:check
npm run typecheck
npm run test:cov
npm run test:shell
npm run check:hooks
npm run audit
```

`check:hooks` runs the secret scan, the shell syntax, workflow, compose and Terraform checks, the kit manifest check and the alert wiring check — the same set husky runs before a commit.

## Release + deploy model

- `Release Please` manages versioning/changelog + release PR.
- On release publish, `Deploy AWS Ops (EC2 Compose)` deploys the ops stack to the shared EC2 host over SSM. A `refactor` or `chore` merge does not cut a release, so it does not deploy.
- Terraform in `infra/terraform/` owns the host, the deploy bucket, ingress and every product's ECR repository and deploy role.
- Products own their own app stack compose and config; this repository owns everything they share.

Production is one `t3.large` and it is close to full. `docs/host-capacity.md` records what runs on it, why `trading-bot` cannot, and what instance size it would take — read it before deploying anything new there.

See:

- `docs/local-first-start.md`
- `docs/cloud-first-deploy.md`
- `docs/host-capacity.md`

## Husky Commit Checks

This repo uses Husky + Node scripts for local quality gates.

Install once:

```bash
npm install
```

That installs dependencies and enables Git hooks via `prepare`.

Run checks manually:

```bash
npm run check:hooks
```

Checks include:

- gitleaks secret scan (staged files)
- shell syntax (`bash -n`)
- workflow YAML parse
- compose config render (local/prod)
- terraform fmt check
- observability kit manifest matches the kit
- every alert is scraped, routed, runbooked and dashboarded

Requirements for checks:

1. `docker`
2. `terraform`
3. `ruby`
4. `gitleaks`

Install gitleaks on macOS:

```bash
brew install gitleaks
```

## Local OpenBao

`docker/.env.ops.local` comes from `docker/.env.ops.local.example`; the real file is git-ignored and is the local ops env source.

Local OpenBao behaves like production:

- no `-dev` auto-init
- no auto-unseal
- no default dev token

So a first run — or a run after `npm run local:reset`, which drops the volumes — needs a manual initialise and unseal. `docs/local-first-start.md` walks through it.

## Production Deployment

1. Configure GitHub environment `production` in `platform-ops`:

- secret: `AWS_DEPLOY_ROLE_ARN`
- vars: `AWS_REGION`, `AWS_DEPLOY_BUCKET`, `AWS_DEPLOY_INSTANCE_ID`, `AWS_SSM_OPS_PREFIX`

2. Run workflow `.github/workflows/deploy-ops.yml` with `ref=main`.
3. Validate target host services using SSM and health endpoints.

Destroy the full AWS environment later with `docs/cloud-destroy.md`.

## Power

Production is one EC2 host, so it can be switched off to save compute cost without losing anything: every volume, the Elastic IP and the instance id survive a stop.

- Manual: run the `Power` workflow (`.github/workflows/power.yml`) with `on`, `off` or `status`.
- Scheduled: the `power_*` variables in `infra/terraform/aws-compose/environments/prod.tfvars` drive two EventBridge Scheduler rules.

Details, including what deploys and the uptime probe do while the host is off, are in `docs/power.md`.

## Ops UI Access (Private via SSM)

Default local URLs once tunnels are open:

- OpenBao: `http://127.0.0.1:18200`
- Grafana: `http://127.0.0.1:13000`
- Tolgee: `http://127.0.0.1:18080`

Notes:

- Tolgee auth depends on `docker/tolgee/config.yaml` plus `spring.config.additional-location` in compose (configured in this repo).
- The shared Redpanda broker is part of this repo's ops stack and is reachable on the shared Docker network as `platform-redpanda:9092`.
- Prometheus and Tempo have no exposed UI; use Grafana for metrics and traces.
- Alert status is available in Grafana via the Alertmanager datasource.

## Release Automation

- `.github/workflows/release-please.yml` runs on pushes to `main` and creates/updates the Release Please PR.
- `.github/workflows/auto-merge.yml` enables auto-merge for pull requests opened from this repository by its owner, Release Please's included, and for Dependabot's patch and minor updates. A pull request from anyone else waits for a person to merge it, and only collaborators can open one.
- `.github/workflows/deploy-ops.yml` triggers on `release.published` and deploys the published tag automatically.
- Manual deploy remains available via `workflow_dispatch` in `.github/workflows/deploy-ops.yml`.
- Required secret for Release Please merge/release operations: `RELEASE_PLEASE_TOKEN` (PAT with `contents:write`; do not use `GITHUB_TOKEN`).
