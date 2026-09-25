# Copy served from the repository

**Alert:** `CopyServedFromRepository` (ticket). `TolgeeExportWrongShape` is
answered on its own further down, under
[an unusable export](#an-unusable-export-is-not-an-unreachable-tolgee).

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
{app=~"cv-web|gpool-web|kini-web|trading-bot-operator-console"} | json | event="i18n.fallback" | error_name=~"FlatExport|EmptyExport"
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
- **The export came back unusable.** Tolgee answered 200 and the loader refused
  the body. `FlatExport` is dotted keys — `home.title` rather than a nested
  `home` object — where the apps read a nested export. `EmptyExport` is a 200
  the loader could pull no usable messages out of: no JSON member in the
  archive, a body that was literally `null`, or an object with no keys in it.
  Nothing is wrong with Tolgee itself in either case: the project's export
  settings, or an upgrade that changed their defaults, stopped producing what
  the loader asks for. Fix the export settings on the project. **Restarting
  Tolgee changes nothing** — it will serve the same body.
  `TolgeeExportWrongShape` watches both names whether
  or not a cached export is hiding them; the section below is its runbook.
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

## An unusable export is not an unreachable Tolgee

**Alert:** `TolgeeExportWrongShape` (ticket)

Tolgee answered 200 and the loader refused the body, so it kept the copy it
already had. The dependency is reachable; its export settings are wrong.

Two error names reach that branch, and the alert carries whichever one fired as
its `error_name` label:

| `error_name`  | The body was                                                                                                                     | The setting that produced it |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `FlatExport`  | dotted keys — `home.title` rather than a nested `home` object                                                                    | the export structure         |
| `EmptyExport` | no usable messages at all: an archive carrying no JSON member, a body that was literally `null`, or an object with no keys in it | the export format            |

Reachability is what the `tolgee` health component means, so both belong on the
**up** side of it. The precedent was already in the loader: a 400 with
`no_exported_result` reports `up` deliberately, because an empty project is a
content gap and not an unreachable dependency. These two are the same class of
fault and are strictly more reachable — the request succeeded. Reporting them
`down` raises `ComponentDown`, whose summary says the site "cannot reach" Tolgee
and whose runbook ends in restarting Tolgee, which re-serves the identical body
and fixes nothing.

They share one alert rather than two because they share everything an operator
acts on: the site keeps rendering correct copy from the repository, Tolgee is
healthy, the fix is an export setting on the project, a restart is the wrong
move, and neither repairs itself. What differs is one field on one settings
page, which the `error_name` label and the table above already name. Splitting
them would buy a second runbook row, a second entry in both Alertmanager
inhibit matchers, and a second eight-line block of `log-alert-apps` exceptions
restating the same reasons, for no decision an operator makes differently.

`EmptyExport` is **not** an emptied project. A project with nothing to export
answers 400 `no_exported_result`, which is `NoExport` and is covered further up.

An export of `{}` is `EmptyExport`. The loader counts the keys rather than
testing the body for truthiness, so an export that parsed cleanly and carries
nothing takes the same branch as one it could not parse at all: the same name,
the same `up`, the same alert, and it is not cached. There is no third row to
look for, because there is no third `error_name` — an export with no keys in it
and an archive with no JSON in it are one decision for an operator, and the fix
starts on the same settings page.

Both names belong on the **up** side in every loader — `src/i18n/remote.ts` in
each app, under `apps/web` in the three sites and `apps/operator-console` in
trading-bot. While any loader still reports `down` on one of them, an unusable
export raises `ComponentDown` alongside this alert, and this is the one of the
two that names the cause. Where every branch passes `'up'`, this is the only
signal left, which is why it ships ahead of the loaders rather than behind them.

Reporting `up` costs something, and this alert is the price. While any process
still holds a cached export the fallback returns that cache, the loader counts
`merged`, and neither `CopyServedFromRepository` — which needs `local` — nor
`ComponentDown` has anything left to fire on. The only evidence is the log line,
so the alert is a Loki rule on it:

```logql
sum by (app, environment, error_name) (
  count_over_time({job="docker-json-logs", app=~"cv-web|gpool-web|kini-web|trading-bot-operator-console"} | json | event = "i18n.fallback" | error_name =~ "FlatExport|EmptyExport" [30m])
) > 0
```

The app list is spelled out rather than matched loosely on purpose: a bare
`app=~".+"` also matches log lines that carry no `app` label at all, and the
twelve services that have dashboards are the only ones that can write this line.
The eight that render no pages are named in `docker/observability-parity.json`
with the reason each cannot.

It waits an hour on purpose. An unusable export is never urgent — the site
renders, in the right language, from the committed copy — but it is permanent:
nothing repairs an export setting on its own. So it is a ticket, and the `for:
1h` over a thirty-minute window opens one only once the bad export has survived
an hour of renders, which no Tolgee upgrade or export-settings edit in flight
lasts. One bad export holds the expression true for thirty minutes, half of what
firing needs, so a blip stays quiet.

`ServiceDown` inhibits it, as it already inhibits `CopyServedFromRepository`:
both say the copy on that site is wrong, and a site that is serving nothing is
the larger problem. The bad export is still there afterwards and the alert comes
back.

### What to do

Fix the export settings on the Tolgee project. For `FlatExport` the loader asks
for `structureDelimiter=.` and `supportArrays=true` and something on the project
— usually an upgrade that changed its defaults — stopped honouring them. For
`EmptyExport`, check the export format first: the body may not be the JSON the
loader reads at all. If the format is right, the export is coming back with no
keys in it, and the question is what that project has under the language the
site asked for — the same check as `NoExport` further up, on a project that
still has enough left to answer 200. Nothing is wrong with Tolgee in either case
and **restarting it changes nothing**. The alert clears within the hour after
the next export comes back usable.
