# Host disk

**Alerts:** `HostDiskFillingUp` (ticket, <15%) · `HostDiskCritical` (page, <5%)
· `HostFilesystemWillFillIn24h` (ticket)

## What fired

A filesystem is running out of space, or is on a trajectory to within a day.

## Whether it matters

This is not hypothetical. A full disk has taken this estate down twice: Tolgee's
embedded Postgres could not write, which broke translations, which broke a
product's startup. Both times the cause was Docker build cache.

On 2026-09-21 it was images instead: the disk was 94% full, with 54 GB in
images no container used. Every release leaves its previous image behind, and
nothing had ever removed them.

`HostFilesystemWillFillIn24h` exists because a threshold alone tells you at 85%
and again at 95% and never tells you _how fast_. A slow leak and a runaway log
look identical at a single point in time.

## How to see

```promql
host:filesystem_avail:ratio
```

That recording rule is deduplicated by device, so one physical disk is one
result even when it is mounted in several places — `/var/lib` and
`/var/lib/docker` are the same `/dev/vda1`.

On the host:

```bash
docker system df
```

## What prunes on its own

The ops deploy installs `/etc/cron.d/platform-ops-image-prune`. Every weekday at
10:45 host time (UTC), inside the power window, it runs
`/opt/platform-ops/bin/prune-images.sh`, which removes the images no container
uses once they were built more than a week ago. Each run logs its start and the
free space afterwards to `/var/log/platform-ops-image-prune.log`.

If the disk fills anyway, check that it ran:

```bash
sudo tail -20 /var/log/platform-ops-image-prune.log
```

## What to do

In the order that reclaims the most for the least risk:

1. **Build cache.**

   ```bash
   docker builder prune -af
   ```

2. **Unused images and stopped containers.** `--filter until=48h` keeps the
   last two days' builds, so a rollback to one of them needs no pull.

   ```bash
   docker image prune -af --filter until=48h && docker container prune -f
   ```

3. **Old releases.** The deploy keeps the last five under
   `/opt/platform-ops/releases`; if pruning has been failing, they accumulate.

4. **Logs.** Compose is configured for 10MB × 3 files per container, so this
   should be bounded — if logs are large, something is not using that config.

Never `docker volume prune` while investigating. Volumes are where the databases
live.
