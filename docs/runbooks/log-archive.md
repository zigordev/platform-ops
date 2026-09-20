# Log archive

Loki keeps logs for a limited window. Before a day falls out of that window it is
exported to S3, so the history survives retention without keeping it in Loki's
much more expensive store.

The export runs on the EC2 host, not in a container: the IMDS hop limit stops
containers from using the instance role, and the instance role is what grants
write access to the bucket.

## What lands where

One private bucket, created by `infra/terraform/aws-compose`. Its name is in the
Terraform output `archive_bucket_name` and in `OPS_LOG_ARCHIVE_BUCKET` in
`docker/.env.ops.prod`.

```
logs/dt=2026-09-19/_manifest.json
logs/dt=2026-09-19/app=notifications-api.jsonl.gz
logs/dt=2026-09-19/service=kini_db.jsonl.gz
logs/dt=2026-09-19/other.jsonl.gz
```

A day is one gzipped file per group of streams, plus a manifest. A group is the
`app` label when the service writes the estate's JSON logs, the Docker Compose
`service` label when it does not, and `other` for everything else — today that is
every container in the ops stack, because the ops compose file does not pass the
Compose labels to the log driver.

Every line is one JSON object: the nanosecond timestamp, the full label set, and
the log line exactly as Loki stored it.

```json
{ "ts": "1789714066990097626", "labels": { "app": "kini-api" }, "line": "..." }
```

The manifest is the record that the day is done. It carries the line count per
object and the total, which is what the export is checked against.

`logs/` moves to Glacier Instant Retrieval after 30 days and is deleted after a
year. Old versions of an object are deleted after 7 days. `backups/` exists for
database dumps and has no rule yet.

## What is not in it

- Today. Only whole days are exported.
- `app=cv-web`. Those lines carry visitors' questions to Ask, and Loki keeps them
  for 14 days on purpose; an archive would outlive that promise. Change
  `LOG_ARCHIVE_EXCLUDE` in `/etc/cron.d/platform-ops-log-archive` to archive them.

## When it runs

`/etc/cron.d/platform-ops-log-archive`, at 10:15 on weekdays, host time, which is
UTC. The host is off outside the power window, so an overnight job would never
start.

Each run looks at the last 30 days and exports every day with no manifest in the
bucket, so a weekend, a powered-off day or a failed run is caught up by the next
one. A day that is already archived costs one `ListObjectsV2` call.

The deploy installs the script, the cron entry and the log rotation on every ops
release, from `scripts/archive-logs.sh` and `scripts/lib/log-archive.sh`.

## Check that it ran

On the host:

```bash
AWS_PROFILE=platform-ops aws ssm start-session --region eu-west-1 \
  --target "$(terraform -chdir=infra/terraform/aws-compose output -raw instance_id)"
```

```bash
sudo tail -40 /var/log/platform-ops-log-archive.log
```

From your machine, the last few days:

```bash
AWS_PROFILE=platform-ops aws s3 ls "s3://$(terraform -chdir=infra/terraform/aws-compose output -raw archive_bucket_name)/logs/" --recursive --human-readable | tail -20
```

The host can write and list `logs/`, and nothing else. Reading a day back uses
your own credentials, not the instance role.

## Read a day

```bash
AWS_PROFILE=platform-ops aws s3 cp "s3://<bucket>/logs/dt=2026-09-19/app=notifications-api.jsonl.gz" .
```

```bash
gzcat app=notifications-api.jsonl.gz | jq -r '(.ts[0:10] | tonumber | todate) + " " + .line'
```

Count the lines and compare them with the manifest:

```bash
gzcat app=notifications-api.jsonl.gz | wc -l
```

```bash
AWS_PROFILE=platform-ops aws s3 cp "s3://<bucket>/logs/dt=2026-09-19/_manifest.json" - | jq '.objects[] | {group, lines}'
```

## Query a day again

`jq` answers most questions. When you want LogQL — label filters, `json`,
`rate()` — push the day into a throwaway Loki. It has to be a throwaway one:
pushing day-old entries into the running Loki would be rejected, and would mix
restored lines into live data.

```bash
cat > /tmp/loki-restore.yml <<'CFG'
auth_enabled: false
server:
  http_listen_port: 3100
common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h
limits_config:
  reject_old_samples: false
CFG
```

```bash
docker run -d --rm --name loki-restore -p 3111:3100 \
  -v /tmp/loki-restore.yml:/etc/loki/config.yml:ro \
  grafana/loki:2.9.8 -config.file=/etc/loki/config.yml
```

```bash
gzcat app=notifications-api.jsonl.gz \
  | jq -s -c '{streams: (group_by(.labels | tojson) | map({stream: .[0].labels, values: map([.ts, .line])}))}' \
  > /tmp/push.json
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Content-Type: application/json' \
  -XPOST http://localhost:3111/loki/api/v1/push --data-binary @/tmp/push.json
```

A 204 means the entries were accepted, not that they are queryable. A querier
only asks the ingester for the last three hours, and restored entries are older
than that, so nothing comes back until the ingester has flushed them to the
store:

```bash
curl -s -o /dev/null -XPOST http://localhost:3111/flush
```

Then query as usual, with the day as the range:

```bash
curl -s -G http://localhost:3111/loki/api/v1/query_range \
  --data-urlencode 'query={app="notifications-api"} | json | level="error"' \
  --data-urlencode 'start=1789689600000000000' \
  --data-urlencode 'end=1789776000000000000' | jq -r '.data.result[].values[][1]'
```

Point a local Grafana at `http://host.docker.internal:3111` for the same data in
Explore. Stop it with `docker rm -f loki-restore` when you are done.

## Run it by hand

On the host, as root:

```bash
sudo LOG_ARCHIVE_BUCKET=<bucket> AWS_REGION=eu-west-1 /opt/platform-ops/bin/archive-logs.sh --day 2026-09-19
```

Useful flags:

| Flag                  | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `--day <YYYY-MM-DD>`  | Export exactly this day; repeatable.                            |
| `--lookback-days <n>` | How far back to look for days with no manifest. Default 30.     |
| `--force`             | Export a day again even though its manifest is already there.   |
| `--dry-run`           | Query Loki and build the files, upload nothing, keep the files. |
| `--exclude "<g> <g>"` | Groups to skip. Default `app=cv-web`.                           |

The one-time backfill of everything Loki holds is the same script with a long
lookback:

```bash
sudo LOG_ARCHIVE_BUCKET=<bucket> AWS_REGION=eu-west-1 /opt/platform-ops/bin/archive-logs.sh --lookback-days 400
```

## When it fails

The run exits non-zero and names the day. Nothing is half-written: a day is only
marked done once its manifest is uploaded, and a day without a manifest is
exported again on the next run.

- **`Missing --bucket`** — `OPS_LOG_ARCHIVE_BUCKET` is not in `docker/.env.ops.prod`,
  so the deploy wrote a cron entry with an empty bucket. Fix the env file and
  deploy.
- **`Loki did not answer the series query`** — Loki is down or still starting.
  `sudo docker ps` and the `ComponentDown` runbook.
- **`More than 5000 entries within one millisecond`** — a log flood inside a
  single millisecond, which the export cannot split any further. Raise
  `LOG_ARCHIVE_QUERY_LIMIT`, and find out what wrote it.
- **`AccessDenied` on upload** — the instance role lost `s3:PutObject` on
  `logs/*`, or the run is not on the host. Check the `LogArchiveWrite` statement
  in `infra/terraform/aws-compose/main.tf`.
- **Nothing in the log at all** — no cron daemon. Amazon Linux 2023 ships without
  one; the deploy installs `cronie` and enables `crond`. `systemctl status crond`.
