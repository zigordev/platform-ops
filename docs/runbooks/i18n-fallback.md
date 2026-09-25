# Copy served from the repository

**Alert:** `CopyServedFromRepository` (ticket)

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
{app=~"cv-web|gpool-web|kini-web"} | json | event="i18n.fallback"
```

`source` in that log line is `cached` or `local`: `cached` is the milder case
this alert deliberately ignores.

Why the fallback happened is in `error.name` — `FlatExport`, `NoExport`,
`EmptyExport`, `HttpError`, or the name of the fetch error for a timeout or a
refused connection:

```logql
{app=~"cv-web|gpool-web|kini-web"} | json | event="i18n.fallback" | error_name="FlatExport"
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
  serve the same body.
- **A container restarted during an outage.** The alert clears once the process
  gets one successful export.

## A wrong-shape export is not an unreachable Tolgee

Today it is reported as one, and that is wrong. `FlatExport` and `EmptyExport`
go through the same fallback as a timeout, which reports the `tolgee` component
`down`. So a Tolgee that is up, answering 200 and merely misconfigured raises
`ComponentDown` — whose summary says the site "cannot reach" Tolgee — and
degrades cv, gpool and kini alongside it. An operator who follows that alert
restarts a healthy Tolgee and fixes nothing.

The precedent already in this loader points the other way. A 400 with
`no_exported_result` reports the component **up**, deliberately, because an
empty project is a content gap and not an unreachable dependency. A wrong-shape
export is the same kind of fault and is strictly more reachable than an empty
one: the request succeeded. `up` is the correct answer, and the signal belongs
in the `FlatExport` log line above, next to `NoExport`.

Two things are owed for that, neither of them in this repository:

- cv, gpool and kini should pass `'up'` on the `FlatExport` and `EmptyExport`
  branches of `apps/web/src/i18n/remote.ts`, as the `NoExport` branch already
  does.
- Once they do, nothing in Prometheus catches a wrong-shape export while a
  process still holds a cached copy: the fallback returns the cache, the loader
  counts `merged`, and neither this alert nor `ComponentDown` fires. That is the
  same blind spot `cached` already has, and closing it means a Loki rule on
  `error_name="FlatExport"` rather than a health component.

Until both land, treat a `tolgee` `ComponentDown` on cv, gpool or kini as
ambiguous and read the log line before touching Tolgee.
