# Pool socket refusing connections

**Alerts:** `PoolSocketOriginRefused` (ticket), `PoolSocketRefusingConnections` (ticket)

## What fired

kini's live pool socket refused connections. The socket pushes pool and match
updates to the pools page. It admits a browser only when the handshake carries
a signed-in session and, for a browser, comes from an origin listed in
`AUTH_CORS_ORIGINS`. An admitted socket joins its user's room and a room for
each active team, and only those teams' updates reach it.

- `PoolSocketOriginRefused`: at least one refusal in fifteen minutes because
  the page opening the socket was on another origin.
- `PoolSocketRefusingConnections`: refusals for carrying no session, faster
  than one every five seconds for ten minutes.

## Whether it matters

A refused socket receives nothing, so neither alert means data went anywhere.

An origin refusal is one of two things. Either a page on another site tried to
open the socket with a visitor's cookies, and the check stopped it, or
`AUTH_CORS_ORIGINS` no longer lists the origin kini is served from, and every
visitor is being refused. In that second case live updates are gone for
everyone, and nothing else says so: the pools page still loads and refreshes.

A steady stream of session refusals is not visitors. A signed-out browser on
the pools page is refused once and does not retry. It is a script probing the
socket, or a client stuck reconnecting.

## How to see

```promql
sum by (outcome, reason) (increase(kini_websocket_connections_total[1h]))
```

`outcome` is `accepted` or `rejected`; `reason` is `none`, `no_session` or
`bad_origin`. The **Socket connections** panel on `service-kini-api` is the
same query, next to **Socket clients over time**.

```logql
{app="kini-api"} | json | event="ws.connection_rejected"
```

An origin refusal is logged at warn with the origin it refused; a session
refusal is logged at info with nothing else.

```logql
{service="central-ingress"} | json | request_uri=~"/socket.io/.*"
```

The edge log shows who is opening the socket, and how often.

## What to do

1. **The refused origin is kini's own?** Compare `AUTH_CORS_ORIGINS` in
   `kini/docker/.env.app.prod` with the address the site is served from,
   scheme included. Fix it and deploy kini.
2. **The refused origin is some other site?** The check did its job. Note the
   origin; repeated attempts from one site are worth a look at the edge log.
3. **Session refusals at a steady rate?** The edge log query above shows
   whether one address is hammering the socket. The refusal already stops it,
   and the rate falls back when the client gives up.
