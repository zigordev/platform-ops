# CSP violations seen

**Alert:** `CspViolationsSeen` (ticket)

## What fired

Browsers reported at least one violation of cv's content security policy in the
last hour, labelled with the directive that was broken. The policy is
report-only, so nothing was blocked; something ran or loaded that the policy
does not allow.

## Whether it matters

It is the evidence needed before the policy can be enforced. Now and then it is
more than that: an inline script nobody wrote is what an injection looks like.

## How to see

```logql
{app="cv-web"} | json | event="csp.violation"
```

Each line carries the `directive`, what was `blocked` (a keyword such as
`inline` or `eval`, or an origin, never a full URL), the `source` file and line
when the browser gave one, and the `page`.

```promql
sum by (directive) (increase(csp_violations_total[1d]))
```

## What to do

1. **Blocked an origin you added on purpose?** Allow it in the policy in
   `apps/web/next.config.js`.
2. **Blocked `inline` or `eval` from the site's own chunks?** A dependency or a
   change started doing it; fix it at the source rather than widening the
   policy.
3. **Blocked something from an extension** (`chrome-extension` and the like)?
   That is the visitor's browser, not the site. Silence with an end date.
4. **An inline script nobody can explain** is the one to take seriously.
