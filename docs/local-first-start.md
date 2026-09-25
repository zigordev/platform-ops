# Local First Start (platform-ops)

Use this runbook when you are creating the full local platform from scratch.
Start here before `gpool`, or `notifications`, because those repos depend on the shared services started by `platform-ops`.

## 1. What You Are Building

When this runbook is complete, you will have a local shared platform with:

- `OpenBao` for application secrets
- `Tolgee` for runtime translations
- `Redpanda` and Redpanda Console for the shared Kafka-compatible broker
- `Prometheus`, `Grafana`, `Loki`, `Alertmanager` and `Tempo` for observability
- `OpenTelemetry Collector` for trace ingestion
- shared Docker network `platform_ops_shared` used by the app repos

## 2. Prerequisites

Run every command in this document from the `platform-ops` repo root.

Required on your machine:

- Docker Desktop or Docker Engine
- `npm`
- `openssl`
- a web browser

Optional but useful:

- `jq`

## 3. Prepare The Local Env File

Create the real local env file from the tracked example:

```bash
cp docker/.env.ops.local.example docker/.env.ops.local
```

Then edit `docker/.env.ops.local`.

Values you must set:

- `GRAFANA_ADMIN_USER`
  - local Grafana username
  - keeping the default value is fine
- `GRAFANA_ADMIN_PASSWORD`
  - local Grafana password
  - choose any strong local-only password
- `TOLGEE_INITIAL_USERNAME`
  - bootstrap Tolgee admin username
  - keeping the default value is fine
- `TOLGEE_INITIAL_PASSWORD`
  - bootstrap Tolgee admin password
  - choose any strong local-only password
- `TOLGEE_JWT_SECRET`
  - secret used internally by Tolgee
  - must be at least 32 characters

Generate a strong Tolgee JWT secret:

```bash
openssl rand -hex 32
```

Important:

- `docker/.env.ops.local` is intentionally ignored by git.
- Keep real passwords only in `docker/.env.ops.local`, never in the tracked example file.

## 4. Start The Local Stack

Start the shared platform:

```bash
npm run local:up
```

What this command does:

- creates the shared Docker network `platform_ops_shared`
- creates `docker/.openbao-local-static-seal-key` on the first run: the gitignored key OpenBao unseals itself with
- starts `openbao` first
- validates the required env values
- starts the remaining ops services, including the shared Redpanda broker
- waits for Tolgee to answer, because the `local:up` of cv, gpool and kini pushes and pulls translations through it straight away
- exits non-zero when OpenBao ends up uninitialized, sealed or unreachable, or Tolgee never answers, because the products' own `local:up` needs both

What it does not do:

- it does not initialize OpenBao

So a first boot still needs the one-time initialization below.

## 5. Initialize OpenBao

Open the OpenBao UI:

- `http://localhost:8200/ui`

On the first run, OpenBao will be uninitialized.

Choose `Create a new Raft cluster`, then initialize it with:

- `Key shares = 1`
- `Key threshold = 1`

OpenBao unseals itself as soon as it is initialized, so there is no unseal step. The one key it shows you is a recovery key, not an unseal key: `generate-root` and `rekey` ask for it, a normal start never does.

Save these values immediately:

- `Recovery Key 1`
- `Initial Root Token`

Treat both as real secrets:

- store them in your password manager
- do not commit them
- do not put them in tracked repo files

Back up `docker/.openbao-local-static-seal-key` next to them. Nothing else holds a copy, and OpenBao cannot unseal this data without it:

```bash
base64 < docker/.openbao-local-static-seal-key
```

To restore it from that value:

```bash
printf '%s' '<value>' | base64 -d > docker/.openbao-local-static-seal-key && chmod 600 docker/.openbao-local-static-seal-key
```

Then sign in:

1. choose token login
2. paste `Initial Root Token`
3. sign in

## 6. Enable The `kv` Secrets Engine

The app repos expect OpenBao KV v2 secrets under paths like `kv/gpool`, and `kv/notifications`.

In the OpenBao UI:

1. open `Secrets engines`
2. choose `Enable new engine`
3. choose `KV`
4. set `Version = 2`
5. set `Path = kv`
6. save

If `kv` already exists, do nothing.

## 7. Validate The Shared Platform

Confirm the containers are up:

```bash
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml ps
```

Confirm the shared broker is running:

```bash
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml ps redpanda redpanda-console
```

Confirm the key services respond:

```bash
curl -fsS http://localhost:8200/v1/sys/health
curl -fsS http://localhost:3002/api/health
curl -fsS http://localhost:8090/actuator/health
```

Useful local URLs:

- OpenBao UI: `http://localhost:8200/ui`
- Grafana: `http://localhost:3002`
- Tolgee: `http://localhost:8090`
- Redpanda Console: `http://localhost:18081`

If these work, the platform foundation for the app repos is ready.

## 8. Translation Workflow

Tolgee in the local `platform-ops` stack is the development authoring source for app translations.

Use this model consistently:

- edit translations in the local Tolgee UI at `http://localhost:8090`
- run the downstream app repo `local:up` command again after Tolgee edits
- that app startup pulls the latest Tolgee export into the tracked `apps/ui/messages/*.json` files
- commit those JSON snapshot changes to git if you want the history in the repository
- do not treat the local JSON files as the primary editing surface

Promotion model:

- local Tolgee is the development authoring source
- committed JSON snapshots are the auditable git history
- production Tolgee is updated by the downstream app repo promotion workflow
- production Tolgee should be treated as a promoted target, not as a manual editing surface

This means there are only two intended write paths:

- local Tolgee during development
- git commits that capture the pulled snapshots

## 9. Daily Commands

Start or restart the local platform:

```bash
npm run local:up
```

Stop the stack but keep volumes:

```bash
npm run local:down
```

Stop the stack and delete local volumes:

```bash
npm run local:reset
```

Important:

- resetting deletes local OpenBao, Tolgee, Redpanda, Grafana, Loki, and related data
- after a reset, you must initialize OpenBao again; the static seal key survives the reset and is reused

OpenBao unseals itself on every start with `docker/.openbao-local-static-seal-key`,
the way production unseals itself through KMS. The seal stanza is the only difference
between `docker/openbao/local.hcl` and `docker/openbao/prod.hcl.tpl`.

An OpenBao initialized before the static seal existed starts sealed once, waiting to
move onto it. `npm run local:up` finishes the move when `docker/.openbao-local-unseal-key`
holds `Unseal Key 1`; that file is gitignored. Without it, run:

```bash
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml exec -e BAO_ADDR=http://127.0.0.1:8200 openbao bao operator unseal -migrate
```

and give it `Unseal Key 1`. From then on that key is a recovery key, and the file is no longer needed.

## 10. Troubleshooting

`Missing required local env file`:

- copy `docker/.env.ops.local.example` to `docker/.env.ops.local`
- fill in concrete values

OpenBao health returns `501`:

- OpenBao is running but not initialized yet
- go back to section 5

OpenBao health returns `503`:

- OpenBao is sealed although it unseals itself
- run `bash scripts/local-openbao-unseal.sh`: it finishes a pending move off the Shamir seal (section 9) and otherwise says why OpenBao stays sealed
- `docs/runbooks/openbao-sealed.md` covers each cause

Grafana or Tolgee login fails after you changed bootstrap credentials:

- the service data volume may still contain the old values
- if this is only a local environment, run `npm run local:reset` and bootstrap again

You need service logs:

```bash
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml logs --no-color <service>
```

Examples:

- `openbao`
- `tolgee`
- `redpanda`
- `redpanda-console`
- `grafana`
- `otel-collector`

## 11. CLI Fallback (Optional)

If the UI is not available, the equivalent OpenBao CLI flow is:

```bash
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml exec -T -e BAO_ADDR=http://127.0.0.1:8200 openbao bao operator init -recovery-shares=1 -recovery-threshold=1
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml exec -T -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN=<ROOT_TOKEN> openbao bao login <ROOT_TOKEN>
docker compose --env-file docker/.env.ops.local -f docker/compose.ops.local.yml exec -T -e BAO_ADDR=http://127.0.0.1:8200 -e BAO_TOKEN=<ROOT_TOKEN> openbao bao secrets enable -path=kv kv-v2
```

## 12. Next Step

After `platform-ops` is ready, continue with:

- `gpool/docs/local-first-start.md`
- `notifications/docs/local-first-start.md`
