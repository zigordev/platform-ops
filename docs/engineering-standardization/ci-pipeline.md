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

Job display names are the required-check contexts in each ruleset, so **renaming a
job and updating the ruleset are one change**. Rename the job alone and every pull
request in that repository blocks on a context that will never report again.

A check that exists but is not required is decoration: trading-bot's five
`Image SBOM + Trivy` jobs ran red through two merges before they were added to its
ruleset on 15 September.

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

Three jobs, same ids and names in every deployable repository: `build-and-push`,
`deploy-app`, `post-deploy-smoke`. The smoke job needs `DEPLOY_HEALTHCHECK_URL`
in the `production` environment; unset, it skips, which reads as a pass.

**Evidence travels with the image, bound to the digest, never the tag.** A tag can
be repointed after signing. The digest is resolved from ECR rather than from a
local `docker inspect`, because a re-deploy of an existing immutable tag skips the
build and leaves nothing local to inspect — that defect broke the manual deploy
path in three repositories until it was fixed on 12 September. gpool attaches the
fullest set and is the one to copy: Trivy on the pushed image, an SBOM
attestation, a cosign signature and SLSA provenance.

`trading-bot` and `sity` have no deploy workflow and no production compose
manifest.

## Translations

A repository whose application reads Tolgee at runtime also runs
`Promote Prod Translations` on pushes to `main` that touch its message files, so
committed snapshots reach production Tolgee. Without it, git and Tolgee drift and
the staler side wins at runtime. It needs `TOLGEE_SYNC_API_URL` as a variable and
`TOLGEE_SYNC_API_KEY` as a secret on the `production` environment.
