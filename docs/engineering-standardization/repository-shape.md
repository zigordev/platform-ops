# Repository shape

## Required layout

```
<repo>/
  apps/<name>/            one directory per deployable
    Dockerfile            beside the app it builds, never at the repo root
  docker/
    compose.app.local.yml
    compose.app.prod.yml
    .env.app.local.example
  docs/
    local-first-start.md  how to run it on a laptop, from nothing
    cloud-first-deploy.md how it reaches production
  scripts/
    local-stack.sh        the shared body, identical in every repository
    local-stack.config.sh what differs: compose files, secrets, database, Tolgee
    openbao-run.mjs       the boot-time secret wrapper
    precommit-gitleaks.sh
    audit-prod-gate.mjs   with audit-allowlist.json beside it
    check-licences.mjs
    prepare-husky.mjs
  .husky/
    pre-commit
    commit-msg
  commitlint.config.js
  package.json
```

Where the layout is not met yet: kini's `openbao-run.mjs` lives in
`apps/api/scripts/`, and notifications' wrapper is a shell script rather than the
shared `.mjs` one.

## The npm script surface

These names are the interface. Anyone moving between repositories should not
have to read `package.json` to find out how to start something.

| Script                      | Does                                             |
| --------------------------- | ------------------------------------------------ |
| `local:up`                  | Brings the app up against the shared platform    |
| `local:down`                | Stops it                                         |
| `local:reset`               | Stops it and discards its local state            |
| `local:token`               | Mints a scoped OpenBao token and installs it     |
| `lint`                      | Lints every workspace                            |
| `typecheck`                 | Typechecks every workspace                       |
| `build`                     | Builds every workspace                           |
| `test`                      | Runs every workspace's tests                     |
| `format` / `format:check`   | Writes / verifies formatting                     |
| `ci:quality:local`          | lint + typecheck + build + test, as CI runs them |
| `test:secrets:gitleaks`     | Secret scan                                      |
| `precommit:checks`          | What the pre-commit hook runs                    |
| `audit` / `audit:prod:gate` | Dependency audit, and the gate CI uses           |

`local:up`, `local:dev`, `local:down` and `local:reset` run
`scripts/local-stack.sh up|dev|down|reset`. That body is byte-identical in every
repository; everything that differs — the compose files, the OpenBao path and
required keys, the database service, whether the Tolgee step pushes before it
pulls — is declared in `scripts/local-stack.config.sh` beside it. The npm name is
the contract, the config block is the repository, and the body is shared.

`audit-prod-gate.mjs` and `check-licences.mjs` are shared the same way: one body
everywhere, with the accepted advisories in `scripts/audit-allowlist.json`.

Gaps today: trading-bot's two Node apps have no ESLint config, so `lint` runs
the Rust linter and nothing else for them; platform-ops installs husky with
`prepare: husky` rather than the shared `prepare-husky.mjs`.

## Husky must be installed, not merely present

A `.husky/` directory with hooks in it proves nothing. If `prepare` has not run,
`core.hooksPath` is unset and **every hook is silently skipped** — commits pass
with no lint, no typecheck, no commitlint, and no secret scan, while the
repository looks fully gated.

This is not hypothetical: it was true of `cv` for its entire history, and eight
commits were made under it before anyone noticed.

Verify, do not assume:

```bash
git config core.hooksPath   # must print .husky
```

If it prints nothing, run `npm install` to trigger `prepare`.

## Secrets never live in the repository

`docker/.env.app.local` holds the OpenBao token and is gitignored in every
repository. The example file beside it is committed and contains no values.

Generated artefacts — PDFs, coverage, SBOMs, build output — are gitignored too. A
committed build artefact goes stale against the source that claims to produce it.
