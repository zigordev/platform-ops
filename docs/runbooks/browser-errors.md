# Browser errors rising

**Alert:** `BrowserErrorsRising` (ticket)

## What fired

Real browsers reported more than one script error for every ten page views over
the last hour, across at least twenty page views.

## Whether it matters

Usually something on the page stopped working for those visitors. Sometimes it
is noise from browser extensions, which throw inside the page they are
injected into.

## How to see

Each distinct error is logged once per ten minutes, with the source line it
came from, mapped back through the build's source maps, and the release:

```logql
{app="cv-web"} | json | event="rum.client_error"
```

```promql
sum by (error_type, release) (increase(rum_errors_total[1h]))
```

## What to do

1. **A release?** Compare the `release` label before and after a deploy. A step
   at a release is the release.
2. **Read the source line.** `source` names the file and line; the message has
   emails and digits masked, which is enough to find it.
3. **No source?** An error with no `source` came from code outside the site's
   own chunks, which is most often an extension. If that is all there is,
   silence with an end date and move on.
