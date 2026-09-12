# CI pipeline

## Required jobs

Every repository runs these on pull request and on push to `main`. A repository
that cannot run one states why in its README rather than quietly omitting it.

| Job                     | Gates                                                    | Currently                                                                                                                 |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `quality`               | format, lint, typecheck, build, unit tests with coverage | every repository; trading-bot splits it into `rust` and `typescript`, design-system into `components` and `accessibility` |
| `secrets-scan`          | Gitleaks over the working tree and history               | every repository                                                                                                          |
| `codeql`                | Static analysis for JS/TS                                | every repository, as its own `codeql.yml`; trading-bot adds Rust                                                          |
| `sast`                  | Semgrep                                                  | every repository                                                                                                          |
| `compose-validation`    | Every compose manifest renders                           | notifications and trading-bot; gpool and kini as a step in `quality`; platform-ops through `check-compose.sh`             |
| `integration`           | The app against its real dependencies                    | notifications; gpool and kini as `integration-e2e`; trading-bot against Postgres only                                     |
| `web-smoke`             | The built image serves its own content                   | cv, sity                                                                                                                  |
| `security-supply-chain` | Prod audit, SBOM, Trivy image scan                       | cv, gpool, kini, notifications, sity; trading-bot scans its images in `image-supply-chain`                                |
| `contract-drift`        | Generated client matches the live spec                   | gpool and kini, inside `integration-e2e`                                                                                  |

sity's jobs are on its draft branch and reach `main` when that branch lands.

## What each job is actually for

**quality** is the cheap gate. It must include tests — a quality job that lints
and builds but never runs a test is a spell-checker.

**secrets-scan** runs over history, not just the diff. A secret committed three
months ago and deleted last week is still in the pack file and still leaked.

**integration** is the job that catches what unit tests cannot: a migration that
does not apply, a Kafka consumer that never joins its group, a query that is
valid SQL and wrong. `notifications` runs its consumer against real Kafka,
Postgres and SMTP; `gpool` brings up the whole compose stack and probes it. Both
are worth copying.

**contract-drift** regenerates the web client from the running API's OpenAPI
document and fails if the result differs from what is committed. It is the single
best idea in the estate and runs in gpool and kini.

## Coverage

Coverage is uploaded as an artefact everywhere, and only notifications fails when
it drops. A
threshold that nobody enforces is a number, not a gate. Each repository sets a
floor at the coverage it currently has — not an aspirational figure — and raises
it deliberately.

## Deploy

Deploy runs only from `main`, only after CI passes, and is driven by
`release-please` tags rather than by pushing. Images go to ECR; a bundle lands in
S3; SSM drives the compose deploy on the shared host.

`trading-bot` and `sity` have no deploy workflow and no production compose
manifest.
