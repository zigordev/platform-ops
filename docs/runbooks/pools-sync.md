# Pool sync

**Alerts:** `PoolsSyncSchedulerDead`, `PoolsSyncRunFailed`, `PoolsSyncFeedBroken`
(ticket)

## What fired

kini builds its quiniela pools out of six upstream feeds it does not control:

| Source                | What it is                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `eduardo_losilla`     | Two pages on eduardolosilla.es, scraped out of HTML: the tickets page and the scrutiny page    |
| `eduardo_losilla_api` | `api.eduardolosilla.es/jornada`, asked once per jornada for the match detail                   |
| `selae_notices`       | The "avisos de interés" index on loteriasyapuestas.es, where the official documents are linked |
| `selae_composition`   | The official composition PDF for a jornada — the fourteen matches and the draw date            |
| `selae_jackpots`      | The official jackpot RSS feed                                                                  |
| `selae_results`       | The official results RSS feed, plus the result page each item links to                         |

A scheduled run walks all six, Mondays at 08:00. Every one of them can also be
walked on demand: `GET /available-pools/jackpot` syncs when it has no jackpot to
show.

- `PoolsSyncSchedulerDead`: no run has **completed** in eight days. The cron is
  weekly, so eight days means at least one Monday came and went with nothing.
- `PoolsSyncRunFailed`: a run started and threw before it finished.
- `PoolsSyncFeedBroken`: one named feed produced three or more problems in a
  day. Three is the line between a blip and a page that has changed shape — a
  changed page fails on every document the run tries.

`ServiceDown` for kini-api inhibits all three: a service that is not running
cannot sync.

All three read `increase()` over a window, and Prometheus adds a counter's
pre-restart total back in when the process restarts inside that window. So a
kini-api restart inflates these counts for the length of the window — eight
days, two hours, one day. Read `process_start_time_seconds{job="kini-api"}`
before you believe a number, and expect `PoolsSyncSchedulerDead` to stay silent
for eight days after a deploy even if the scheduler really has stopped. Until
kini publishes the time of its last successful sync there is no reading that
survives a restart.

## Whether it matters

Not immediately, and that is the point. Nothing is 5xx, health still says `ok`,
and the site keeps serving the pools the last good run wrote. The symptom a
person sees is a jornada that never appears, a jackpot stuck at last week's
figure, or results that never fill in. Nothing generic can see any of that,
which is why these rules exist.

## How to see

```promql
sum by (source, problem) (increase(kini_pools_sync_problems_total[7d]))
sum by (outcome) (increase(kini_pools_sync_runs_total[30d]))
```

The **Upstream feeds and their problems** table on `service-kini-api` is the
same query with the feed names spelled out. kini creates every source against
every problem at zero when it starts, so the table lists all of them from the
first scrape onwards. A zero is the absence of a problem, not proof that the
feed was read: nothing counts a successful fetch. `problem` is one of three:

- `failed` — the fetch or the parse threw. The log line carries the reason.
- `empty` — the feed answered, and there was nothing in it.
- `unmapped` — a document parsed, but held no usable pool: no draw date, or
  fewer than fourteen matches.

```logql
{app="kini-api"} | json | event=~"pools_sync.failed|pools_sync.empty|pools_sync.unmapped"
```

Each line names the `source` and the `url` it was reading. Only
`pools_sync.failed` carries a `reason`; `empty` and `unmapped` have nothing to
say beyond the URL, which is the fastest thing to open in a browser anyway.

## What to do

1. **Scheduler dead, and nothing in the logs?** Check that
   `EDUARDO_LOSILLA_SYNC_ENABLED` is not `false` — the scheduled run returns
   immediately when it is, without logging or counting anything. Then confirm
   the process has actually been up across a Monday: a container that restarts
   more often than weekly can miss the window.
2. **One feed failing, the rest fine?** Open its URL. A 404 or a redirect means
   the upstream moved the page, and the URL is configurable —
   `SELAE_QUINIELA_NOTICES_URL`, `SELAE_QUINIELA_JACKPOT_RSS_URL`,
   `SELAE_QUINIELA_RESULTS_RSS_URL`, `EDUARDO_LOSILLA_QUINIELA_TICKET_URL` and
   `EDUARDO_LOSILLA_QUINIELA_RESULTS_URL` all point at their defaults in code.
3. **`unmapped` on `selae_composition`?** The PDF still downloads and still
   parses; it no longer holds what the parser looks for. That is a parser
   change in `selae-quiniela.parser.ts`, not a configuration one.
4. **Everything failing at once?** Usually the network out of the container
   rather than six upstreams at the same moment. Both hosts are plain public
   HTTPS and are fetched with no credentials.
5. **A run failed as a whole (`source="all"`)?** The reason on that one log line
   is the exception that stopped the run; the individual feeds may all be fine.
