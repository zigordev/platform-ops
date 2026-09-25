# OpenBao sealed

**Alert:** `OpenBaoSealed` (page)

## What fired

OpenBao is running and answering scrapes, but it is sealed. A sealed OpenBao
holds its storage encryption key nowhere it can reach, so it serves no secrets
to anyone.

Production auto-unseals through AWS KMS, so after a normal restart it should
never reach this state. This alert firing means one of a small set of things,
listed under **What to do**.

Local auto-unseals too, through a static seal: `docker/openbao/local.hcl` points it
at `docker/.openbao-local-static-seal-key`, which `npm run local:up` creates on the
first run. A local OpenBao that stays sealed has one of the causes under
**Locally**.

## Whether it matters

Not immediately, and that is what makes it dangerous.

Applications read their secrets from OpenBao **at boot only**, through
`openbao-run.mjs` / `openbao-run.sh`. A container that is already running keeps
serving traffic and never notices. Nothing is down, no user sees anything, and
the estate looks healthy.

The bill arrives on the next restart. The boot wrappers retry for 90 seconds and
then exit; `restart: unless-stopped` restarts them, so an application that
restarts while OpenBao is sealed crash-loops on a roughly 90-second cycle until
it is unsealed. Once unsealed, everything recovers on its own within about 90
seconds — there is nothing to go and restart by hand.

Deploys fail immediately. `gpool` and `kini` break out of their OpenBao health
wait on the first 503 and exit; `notifications` waits its full 120 seconds and
then exits.

## How to see

```promql
up{job="openbao"} == 1 unless on (job) (max by (job) (vault_core_unsealed) == 1)
```

`max by (job)` is load-bearing, not tidiness. OpenBao keeps publishing the
pre-unseal `vault_core_unsealed{cluster=""} 0` series alongside the live
`cluster="<id>"` series at `1` for the whole retention window, so a bare
`vault_core_unsealed == 0` fires permanently against a perfectly healthy
instance. Aggregating takes the live series.

Matching the value alone is not enough either. A sealed OpenBao writes
`vault_core_unsealed 0` once and never refreshes it, and its telemetry drops any
metric left unrefreshed for `prometheus_retention_time` (24 hours). A day into a
seal the series is gone, `== 0` matches nothing, and the alert resolves while
OpenBao is still sealed, as it did locally on 21 September. So the rule fires
whenever OpenBao answers its scrape without reporting itself unsealed. The
Secret store tiles read the same way, and show `down` when OpenBao does not
answer at all.

Directly, on the host:

```bash
curl -s http://127.0.0.1:8200/v1/sys/seal-status
```

Run that on the host too — port 8200 is bound to `127.0.0.1` and is not reachable
from anywhere else.

`sealed: true` confirms it, and `recovery_seal: true` confirms an auto-unseal seal
is in use: KMS in production, the static seal locally. `sys/health` is the same
signal as an HTTP status: `200` unsealed, `503` sealed, `501` never initialized.

## What to do

Work out which of these it is. They need different fixes.

1. **The seal migration has not been run yet.** Expected exactly once, on the
   first deploy after auto-unseal was introduced. OpenBao is still a Shamir
   cluster and will not use KMS until it is migrated. Finish the migration in
   [cloud-first-deploy.md](../cloud-first-deploy.md); until then, unseal by hand
   with your key.

2. **Somebody sealed it.** `bao operator seal`, or the UI. Unseal it:

   Production OpenBao runs on the EC2 host, not on your machine, and an SSM
   session lands as `ssm-user`, which is not in the `docker` group. So: open a
   session, then `sudo`.

   ```bash
   AWS_PROFILE=platform-ops aws ssm start-session --region eu-west-1 \
     --target "$(terraform -chdir=infra/terraform/aws-compose output -raw instance_id)"
   ```

   ```bash
   sudo docker exec -it -e BAO_ADDR=http://127.0.0.1:8200 \
     platform-ops-prod-openbao-1 bao operator unseal
   ```

   `docker exec` on the container name rather than `docker compose exec`, because
   the prod compose file lives under whichever release directory is current.

   With the KMS seal in place this takes a **recovery key**, not the old unseal
   key. They are the same strings you got from `operator init`, but they play a
   different role now.

3. **Auto-unseal partially failed.** Rare: OpenBao reached KMS at startup but
   could not complete the unseal. `docker logs platform-ops-prod-openbao-1`
   names the reason, and it is nearly always a KMS permission or key-state
   problem — the key disabled, scheduled for deletion, or the IAM user's policy
   changed.

### Locally

`bash scripts/local-openbao-unseal.sh` tells these apart and fixes the first.

1. **The move off the Shamir seal is pending.** An OpenBao initialized before the
   static seal starts sealed once, with `"migration": true` in `sys/seal-status`.
   `npm run local:up` finishes the move when `docker/.openbao-local-unseal-key`
   holds the old unseal key; section 9 of
   [local-first-start.md](../local-first-start.md) has the manual command.

2. **Somebody sealed it.** It stays sealed until it restarts or is given the
   recovery key: `docker restart platform-ops-local-openbao-1`.

3. **The key file changed.** The log repeats `failed to unseal core`, ending in
   `cipher: message authentication failed`, every five seconds:
   `docker/.openbao-local-static-seal-key` no longer holds the key OpenBao was
   sealed with. It is also what a deleted key file looks like, because
   `npm run local:up` then writes a new one. Restore the original from your
   backup. A new key cannot open the old data; without the original,
   `npm run local:reset` and a fresh initialization are all that is left.

### If OpenBao is crash-looping instead of sealed

This alert will **not** fire for that — `ServiceDown` will, because a scrape
against a dead process fails. It is worth knowing the difference, because after
auto-unseal it is the more likely failure:

OpenBao **exits** rather than starting sealed when it cannot reach its KMS key.
The log line is unmistakable:

```
Error parsing Seal configuration: error fetching AWS KMS wrapping key
information: UnrecognizedClientException: The security token included in the
request is invalid.
```

That means the credentials in `OPENBAO_UNSEAL_AWS_ACCESS_KEY_ID` /
`OPENBAO_UNSEAL_AWS_SECRET_ACCESS_KEY` are wrong, expired, or deleted. They come
from SSM at deploy and belong to the `openbao-unseal` IAM user. A different AWS
error in the same position — `AccessDeniedException`, `NotFoundException`,
`KMSInvalidStateException` — points at the key or its policy instead of the
credentials.

Locally the static seal fails the same way. A key file that is not 32 bytes (raw,
or 64 hex or 44 base64 characters with no trailing newline) makes OpenBao exit
with `unknown encoding for AES-256 key`, and a missing one stops Docker creating
the container at all (`bind source path does not exist`). `npm run local:up`
refuses a malformed key and replaces a missing one before starting OpenBao, so
both only happen when the container is started some other way.

**Never delete the unseal KMS key.** Its ciphertext is the only thing that can
decrypt OpenBao's storage. The key has a 30-day deletion window, which is the
window you would have to notice and cancel.
