# Edge SLIs

Two alerts describe what a visitor actually got, measured where the request
arrives rather than inside the application.

They exist because nothing else sees this. A Next.js page render emits no
request metric of its own; the external uptime probe runs every five minutes
from GitHub and only asks for the health endpoint; and `up` says whether
Prometheus could scrape a service, not whether anyone could use it.

## Where the numbers come from

Caddy's own metrics carry no host label — server, handler, code and method
only — so a per-site number cannot come from them. The access log does carry
the host, so the ingress logs every request as JSON, Loki records three series
from those lines, and its ruler remote-writes them into Prometheus:

| Series                        | What it is                          |
| ----------------------------- | ----------------------------------- |
| `edge:requests:rate5m`        | requests per second, by host        |
| `edge:requests_5xx:rate5m`    | failed requests per second, by host |
| `edge:latency_p95_seconds:5m` | 95th percentile duration, by host   |

The rules are in `docker/loki/rules/fake/edge-slis.yml`. They are evaluated by
Loki, so if they stop producing, the ruler is where to look:

```bash
curl -s http://localhost:3100/prometheus/api/v1/rules | jq '.data.groups[] | select(.name=="edge")'
```

## EdgeErrorRatioHigh

**What fired.** More than one request in twenty to a site failed at the edge,
for ten minutes, while the site was taking real traffic (the gate is 0.05
requests a second, the same one the estate's other SLO alerts use).

**Whether it matters.** Yes. These are requests that reached the ingress and
came back 5xx. Someone was using the site and it did not work.

**How to see.** In Grafana, Explore, Loki:

```
{service="central-ingress"} | json | status >= 500 | line_format "{{.request_host}} {{.status}} {{.request_uri}}"
```

**What to do.** In the order these are usually true:

1. The upstream is down or restarting — a 502 from Caddy means it could not
   reach the container. `ServiceDown` for that service usually fires first and
   suppresses this one; if it has not, check `docker ps` on the host.
2. The application is failing on one route. The `request_uri` in the query
   above says which, and the app's own logs say why.
3. A deploy is in progress. Caddy answers 502 for the seconds between the old
   container stopping and the new one passing its healthcheck.

## EdgeLatencyHigh

**What fired.** The 95th percentile of requests to a site was over two seconds
for fifteen minutes.

**Whether it matters.** Usually. Two seconds at the edge is a page that feels
broken. But check the traffic first: on a quiet site a handful of slow
requests can carry the percentile, which is why the alert has the same traffic
gate.

**How to see.**

```
quantile_over_time(0.95, {service="central-ingress"} | json | label_format host=request_host | unwrap duration [5m]) by (host)
```

Then find the slow requests themselves:

```
{service="central-ingress"} | json | duration > 2 | line_format "{{.duration}} {{.request_host}}{{.request_uri}}"
```

**What to do.**

1. Compare with the application's own `http_request_duration_seconds`. If the
   app is fast and the edge is slow, the time is being spent in TLS, the
   network, or a large response body.
2. Look for one slow route rather than a slow site. A single expensive
   endpoint moves the percentile for everything.
3. The host is shared. Check `HostMemoryPressure` and the container metrics
   before blaming the application.
