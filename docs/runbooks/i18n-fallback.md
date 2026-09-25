# Copy served from the repository

**Alert:** `CopyServedFromRepository` (ticket). `TolgeeExportWrongShape` is
answered on its own further down, under
[a wrong-shape export](#a-wrong-shape-export-is-not-an-unreachable-tolgee).

## What fired

A page on cv, gpool or kini was rendered using the message files committed in
the repository, with nothing from Tolgee in it.

Each site counts every message load by where the copy came from, as
`<product>_i18n_messages_total{source=...}`:

| `source`         | Means                                                        |
| ---------------- | ------------------------------------------------------------ |
| `merged`         | The committed files, with Tolgee's export layered over them  |
| `remote`         | Tolgee only, with no committed files for that locale         |
| `local`          | The committed files alone — Tolgee contributed nothing       |
| `default_locale` | The locale has no copy at all, so the default one was served |

`merged` is the healthy case. It is also what a Tolgee outage looks like for as
long as a process still holds a cached export, because the fallback returns that
cache and the loader still sees two sources. So `merged` says nothing about
Tolgee being reachable; only `local` does.

## Whether it matters

Visitors are reading the copy as it was when the image was built. Nothing is
broken on the page — the site renders, translated, in the right language — but
every edit made in Tolgee since that build is invisible, and it will stay
invisible until Tolgee answers again.

Reaching `local` takes two things at once: Tolgee answered with nothing, and the
process had no cached export to fall back on. In practice that is a render in a
process that has never had a successful export — a container that started during
an outage, a project with no translations, or missing Tolgee configuration.

**This is not the alert for a failed promotion.** A promotion that fails leaves
prod Tolgee up and serving yesterday's copy, so every render still counts
`merged` and nothing here fires. `CopyServedFromRepository` cannot cover it and
is not meant to: stale-but-answering is indistinguishable from healthy at the
running site.

The signal comes from the promotion itself. `promote-prod-translations.yml` in
cv, gpool and kini retries the push, and a promotion that still fails opens or
comments on one issue titled `Prod translations: promotion to Tolgee failing`,
labelled `i18n`, in the repository whose copy did not land. The issue closes
itself when a later promotion succeeds. If the wording on a site is stale while
this runbook's queries look healthy, that issue is where to look.

## How to see

Which sites, and what they are counting:

```promql
sum by (job, source) (increase({__name__=~"(cv|gpool|kini)_i18n_messages_total"}[15m]))
```

Whether Tolgee itself is the cause:

```promql
service_component_up{component="tolgee"}
```

The log line each fallback writes, with the locale and the error:

```logql
{app=~"cv-web|gpool-web|kini-web|trading-bot-operator-console"} | json | event="i18n.fallback"
```

All four applications run the same loader and write the same line. Only the
three web sites are scraped in production; trading-bot's console is shipped
locally only, so in prod that fourth selector matches nothing.

`source` in that log line is `cached` or `local`: `cached` is the milder case
this alert deliberately ignores.

Why the fallback happened is in `error.name` — `FlatExport`, `NoExport`,
`EmptyExport`, `HttpError`, or the name of the fetch error for a timeout or a
refused connection:

```logql
{app=~"cv-web|gpool-web|kini-web|trading-bot-operator-console"} | json | event="i18n.fallback" | error_name="FlatExport"
```

## What to do

In the order they are usually true:

- **Tolgee is down.** `service_component_up{component="tolgee"}` is 0 for every
  site, and `ComponentDown` is firing beside this. Bring Tolgee back; the sites
  recover on their own within the minute the cache TTL allows.
- **One site only.** Tolgee is up and this site cannot reach it or is not
  configured for it. Check `TOLGEE_API_URL`, `TOLGEE_PROJECT_ID` and
  `TOLGEE_API_KEY` in that service's environment — any one of the three unset
  or blank makes the loader skip Tolgee before it fetches, so it counts `local`
  on every render and writes no `i18n.fallback` line at all.
- **The project is empty for that locale.** Tolgee answers `no_exported_result`
  with a 400, which the loader treats as Tolgee being up with nothing to give.
  The log line carries `NoExport`. Check the language tags: they are
  short BCP 47 across the estate (`en`, `es`), and a language named anything
  else exports nothing under the name the site asks for.
- **The export came back in the wrong shape.** Tolgee answered 200 with a body
  of dotted keys — `home.title` rather than a nested `home` object — and the
  loader refused it, because the apps read a nested export. The log line carries
  `FlatExport`. Nothing is wrong with Tolgee itself: the project's export
  settings, or an upgrade that changed their defaults, stopped honouring the
  `structureDelimiter=.` and `supportArrays=true` the loader asks for. Fix the
  export format on the project. **Restarting Tolgee changes nothing** — it will
  serve the same body. `TolgeeExportWrongShape` watches this case whether or
  not a cached export is hiding it; the section below is its runbook.
- **A container restarted during an outage.** The alert clears once the process
  gets one successful export.

## A list the export could not be laid over

This one raises no alert and does not reach this dashboard, but it is the other
way Tolgee copy fails to appear. cv, gpool and kini merge the export over the
committed copy entry by entry, and a list is only merged when both sides have
the same number of entries. When they differ the committed list is kept whole —
a half-translated list would otherwise be served with entries missing — and the
loader writes one line naming it:

```logql
{app=~"cv-web|gpool-web|kini-web"} | json | event="i18n.list_length_mismatch"
```

The line carries `key`, `committed` and `remote`. It means the list in Tolgee
and the list in the repository have drifted apart: push the committed copy to
Tolgee, then pull. It is written **once per process per key**, so a quiet log
does not mean the drift is gone — a process that has already reported it stays
quiet until it restarts.

## A wrong-shape export is not an unreachable Tolgee

**Alert:** `TolgeeExportWrongShape` (ticket)

Tolgee answered 200 and the body came back as dotted keys — `home.title` rather
than a nested `home` object — so the loader refused it and kept the copy it
already had. The dependency is reachable; its export settings are wrong.

Reachability is what the `tolgee` health component means, so a wrong-shape
export belongs on the **up** side of it. The precedent was already in the
loader: a 400 with `no_exported_result` reports `up` deliberately, because an
empty project is a content gap and not an unreachable dependency. A wrong-shape
export is the same class of fault and is strictly more reachable — the request
succeeded. Reporting it `down` raises `ComponentDown`, whose summary says the
site "cannot reach" Tolgee and whose runbook ends in restarting Tolgee, which
re-serves the identical body and fixes nothing.

This alert ships before the loaders do. Until cv, gpool, kini and trading-bot's
operator console pass `'up'` on their `FlatExport` branch — `src/i18n/remote.ts`
in each, under `apps/web` in the three sites and `apps/operator-console` in
trading-bot — a wrong-shape export still raises `ComponentDown` alongside this
alert, and this is the one of the two that names the cause. Once they land, it
is the only signal left.

Reporting `up` costs something, and this alert is the price. While any process
still holds a cached export the fallback returns that cache, the loader counts
`merged`, and neither `CopyServedFromRepository` — which needs `local` — nor
`ComponentDown` has anything left to fire on. The only evidence is the log line,
so the alert is a Loki rule on it:

```logql
sum by (app, environment) (
  count_over_time({job="docker-json-logs", app=~"cv-web|gpool-web|kini-web|trading-bot-operator-console"} | json | event = "i18n.fallback" | error_name = "FlatExport" [30m])
) > 0
```

It waits an hour on purpose. A wrong-shape export is never urgent — the site
renders, in the right language, from the committed copy — but it is permanent:
nothing repairs an export setting on its own. So it is a ticket, and the `for:
1h` over a thirty-minute window opens one only once the wrong shape has survived
an hour of renders, which no Tolgee upgrade or export-settings edit in flight
lasts. One bad export holds the expression true for thirty minutes, half of what
firing needs, so a blip stays quiet.

`ServiceDown` inhibits it, as it already inhibits `CopyServedFromRepository`:
both say the copy on that site is wrong, and a site that is serving nothing is
the larger problem. The wrong shape is still there afterwards and the alert
comes back.

### What to do

Fix the export format on the Tolgee project. The loader asks for
`structureDelimiter=.` and `supportArrays=true`, and something on the project —
usually an upgrade that changed its defaults — stopped honouring them. Nothing
is wrong with Tolgee itself and **restarting it changes nothing**. The alert
clears within the hour after the next export comes back nested.

### What this does not cover

`EmptyExport` — a 200 whose body held no messages at all — reaches the same
fallback and will have the same blind spot, and this rule does not watch it. It
still reports the component `down`, so `ComponentDown` still answers for it,
ambiguously. When that branch moves to `up` as well, widen the `error_name`
matcher above to take both names and say so here.
