# Tempo memory

**Alerts:** `TempoMemoryNearLimit` (ticket), `TempoMemoryGcThrashing` (ticket)

## The three numbers

Tempo is the only container in either stack with a memory limit, and it is held
by three numbers that have to stay in this order:

| Number       | Where                          | Value   | Enforced by                                 |
| ------------ | ------------------------------ | ------- | ------------------------------------------- |
| `GOMEMLIMIT` | `docker/compose.ops.*.yml`     | 900 MiB | the Go runtime, softly — it collects harder |
| alert        | `docker/prometheus/alerts.yml` | 942 MiB | nothing; it is the warning                  |
| `mem_limit`  | `docker/compose.ops.*.yml`     | 1 GiB   | the kernel, hard — reclaim, then a kill     |

The alert sits between the other two on purpose. Below `GOMEMLIMIT` the runtime
is _entitled_ to the memory, so an alert there would fire on correct behaviour.
Above `mem_limit` there is nothing left to warn about. That leaves a band 42 MiB
wide, which is narrow, and it is narrow because `GOMEMLIMIT` was set close to
the cap deliberately.

`npm run check:alerts` fails if any of that ordering breaks: if the two
environments disagree, if `GOMEMLIMIT` is written in a unit Go does not take, if
`GOMEMLIMIT` is not below `mem_limit`, if the alert divides by something other
than `mem_limit`, or if its threshold lands on either side of the band instead
of inside it. Change one of the three numbers and the
check tells you which of the others has to move.

## Which alert fired, and what it means

`GOMEMLIMIT` did not remove the old failure mode, it added an earlier one. The
two alerts are the two modes, and they are meant to be read together.

- **`TempoMemoryGcThrashing` alone.** The runtime is doing its job: it is
  refusing to grow and paying for it in CPU. Resident memory should be flat at
  or below 900 MiB. This is the cost of the headroom, not a failure — but on a
  two-vCPU prod host shared with 22 other containers it is a cost somebody else
  is also paying, so it is worth a ticket.
- **`TempoMemoryNearLimit` alone.** Memory is growing outside the Go heap,
  because the runtime is holding its own line and something still is not. Look
  at page cache and at anything mapped, not at the heap.
- **Both.** The runtime lost. Its garbage collector is capped at 50% of CPU by
  design, and once it hits that cap it stops defending the limit and lets the
  heap grow past it. From there the kernel is back in charge and the old
  behaviour resumes.

## Telling the CPU cost apart from the kernel's

The distinction the two alerts encode is visible directly:

```promql
rate(go_gc_duration_seconds_count{job="tempo"}[10m])
```

Roughly 0.07/s — about four collections a minute — was the peak of the retained
window. Tens a second is a runtime fighting the limit.

```promql
process_resident_memory_bytes{job="tempo"}
go_memstats_sys_bytes{job="tempo"} - go_memstats_heap_released_bytes{job="tempo"}
```

The second expression is roughly what `GOMEMLIMIT` counts: everything the
runtime holds, minus what it has already handed back. If that line is pinned
just under 900 MiB while the first is high, the runtime is holding the line. If
it is above 900 MiB, it has given up.

The kernel's side of it is not in Prometheus — there is no cAdvisor scrape in
either environment, so `process_resident_memory_bytes` is the only memory series
Tempo has, and it is the process's own figure rather than what the cgroup is
charged:

```bash
docker exec platform-ops-local-tempo-1 sh -c \
  'cat /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.events'
```

A `max` counter that is climbing means the kernel is holding the cgroup at its
ceiling by reclaiming. `oom_kill` is the one that means reclaim lost. Measured
on 2026-09-24 the process reported 282.9 MiB resident at the same moment its
cgroup was charged 338.4 MiB — about 20% more, because the cgroup also counts
page cache. That gap is why the alert reads low, and why 942 MiB of resident
memory is closer to the 1 GiB ceiling than it looks.

`memory.stat` splits the charge into `anon` and `file`. Only the `file` half is
cheaply reclaimable. The local Docker VM has swap and prod does not — nothing in
this repository configures any — so the same pressure that local absorbs by
swapping is, in prod, reclaim with only page cache to take.

## What to do

1. **Separate a spike from a level.** Compaction is the spiky part, roughly one
   block every four minutes. Both alerts wait — fifteen minutes and twenty — so
   a burst that falls back is already excluded.
2. **Check the generator registry.** `tempo_metrics_generator_registry_active_series`
   against `registry.stale_duration` in `docker/tempo/config.yml`, which is 2h
   rather than the 15m default. That setting multiplies how long every series is
   held and is the single largest lever on this container's memory. Lowering it
   is the first thing to try, and it costs recording-rule accuracy, not traces.
3. **Check retention and the block window.** More blocks awaiting compaction
   means more open at once.
4. **Move the numbers, not one number.** All three live in this repository and
   `npm run check:alerts` will not let them drift apart. Production is one
   t3.large with 8 GiB and nothing else capped, so every megabyte given to Tempo
   is a megabyte the kernel can no longer give ClickHouse — see
   [host-memory.md](host-memory.md).

Restarting Tempo reclaims the memory, replays the write-ahead log from the
`tempo-data` volume, and loses only the block that was open at the time, which
replays without its `meta.json` and is dropped, plus the generator registry,
which starts again from empty. Spans pushed during the restart are refused at
the collector. It is a stopgap, and the alert will be back.

## What these numbers do not rest on

Prometheus holds about 2.9 days of Tempo samples, not the fourteen or thirty a
`[14d]` or `[30d]` query appears to cover — those windows return the same answer
as `[3d]` because there is nothing older to return. Every peak quoted here is a
three-day peak.

Inside that window, and with the old 512 MiB cap suppressing all of it:

- what `GOMEMLIMIT` would have counted peaked at 1018.3 MiB — 113% of the 900 MiB
  it is now being given, and within 6 MiB of the new 1 GiB cap. That is one
  five-second sample, on 2026-09-22 at 07:50 UTC; the next highest five-minute
  peak in the window is 750.3 MiB. Sample at less than the 5s scrape interval or
  this peak is missed entirely;
- `go_memstats_next_gc_bytes` peaked at 1091.5 MiB, meaning the runtime intended
  to let the heap grow past the new 1 GiB cap before collecting, which is the
  reason `GOMEMLIMIT` is set at all;
- resident memory peaked at only 563.1 MiB, because the cgroup was holding it
  down.

So 900 MiB is expected to bind in normal operation rather than only under
stress: the runtime has already been past it once inside three days, which is
the moment `TempoMemoryGcThrashing` exists to show. The true ceiling is still
unknown — it is above everything that has been measured, not near it.
