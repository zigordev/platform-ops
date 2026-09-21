# Core Web Vitals regressed

**Alert:** `CoreWebVitalsRegressed` (ticket)

## What fired

For a UI with at least twenty page views an hour, the 75th percentile of one
Core Web Vital has been worse than "good" over six hours. The `vital` label says
which: LCP past 2.5 seconds, INP past 200 milliseconds, or CLS past 0.1. Those
are the boundaries Google draws between "good" and "needs improvement", and p75
is the percentile it grades on.

This is measured in real browsers, from the RUM beacons the UIs send — not from
CI, not from a synthetic run on a fast machine with a warm cache.

## Whether it matters

Not urgently, and not never. Nothing is broken; the site is slower to become
useful than it should be, for a quarter of real visits. It is a ticket, and it
is the kind of ticket that is worth doing.

## How to see

The alert's own query, per UI:

```promql
histogram_quantile(0.75, sum by (job, le) (rate(rum_performance_seconds_bucket{metric_name="LCP"}[6h])))
```

The other vitals, which usually move together:

```promql
histogram_quantile(0.75, sum by (job, metric_name, le) (rate(rum_performance_seconds_bucket[6h])))
```

CLS is a score rather than a duration, so it has its own histogram:

```promql
histogram_quantile(0.75, sum by (job, le) (rate(rum_layout_shift_score_bucket[6h])))
```

A poor value names the element behind it, once per ten minutes per element:

```logql
{app="cv-web"} | json | event="rum.vital_poor"
```

`target` is a CSS selector for the LCP element, the element an interaction hit
for INP, or the element that shifted most for CLS.

## What to do

1. **Compare against a deploy.** A step change at a release is a bundle that
   grew, an image that lost its dimensions, or a font that started blocking.
2. **LCP is usually an image or a font.** Check that the LCP element has explicit
   dimensions and that webfonts use `display=swap`.
3. **INP is usually hydration** or a synchronous handler on the critical path.
4. **Confirm with the e2e performance suite** rather than a local reload — the
   cv UI has one under `apps/ui/e2e/performance.spec.ts` and it is the closest
   thing to a repeatable measurement.

If the regression is real and the fix is not small, close the alert with a
silence that has an end date and an issue behind it.
