# Conventions

## Runtime

**Node 24 LTS**, pinned once in `.nvmrc` and declared in every `package.json`:

```json
"engines": { "node": ">=24 <25", "npm": ">=10" }
```

Every Dockerfile builds on `node:24-alpine`, so the runtime CI tests is the
runtime that ships. `notifications` narrows npm to `>=11 <12`.

No repository carries a `.node-version`. A second pin is a second answer: version
managers that read it select whatever it says, and three of them still said Node
20 long after everything else had moved to 24.

Dependabot does not propose base-image majors: every `docker` entry ignores
`version-update:semver-major`. Its Node 26 updates were merged into four
repositories on 2026-09-07 while CI kept testing 24, so a new Node major now
arrives as a deliberate change to `.nvmrc`, `engines` and the Dockerfiles
together.

Rust code pins its toolchain in `rust-toolchain.toml`.

## Package layout

Every repository is an npm workspace root with `"workspaces": ["apps/*"]`.
Applications live in `apps/<name>`, never at the repository root.

One name runs through all four places an application is addressed: the directory,
the package name, the compose service and the ECR repository. `apps/web` is
`@cv/web` is `cv_web` is `cv/prod/web`. A web UI is called `web`; a named surface
keeps its name, as `trading-bot`'s `operator-console` does, but keeps it in all
four.

## Test runner

**Vitest** in every repository, the three Nest APIs included. Nest needs the SWC
plugin rather than Vitest's default esbuild transform, because esbuild does not
emit the decorator metadata dependency injection reads. Rust uses `cargo test`.

Every workspace defines `test`, even if it only echoes that there are none —
`npm run test --workspaces --if-present` must never fail because a workspace
forgot to declare the script.

## Commits

Conventional commits, enforced by commitlint on `commit-msg`:

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`. Subject in lower case, no trailing period, body lines
wrapped at 100 characters.

`release-please` derives versions and changelogs from these, so a sloppy commit
message becomes a wrong changelog entry.

## Versions

Before 1.0: `feat` is a minor, `fix` is a patch, and a breaking change is what
makes it 1.0.0. Repositories that set `bump-patch-for-minor-pre-major` drop it —
that setting is why gpool read 0.1.71 while kini, the same age and further along,
read 0.7.0.

Which commit types cut a release is a per-repository choice with a consequence
worth stating plainly: **platform-ops and gpool list `refactor` as a visible
changelog section, so a refactor there publishes a release and deploys.** The
others use release-please's default and release only on `feat` and `fix`. Before
merging to a repository in the first group, know whether you want a deploy.

## Translations

Tolgee is the authoring surface; git is the source of truth. One direction:

1. author in local Tolgee,
2. `npm run local:up` pulls the snapshots into `apps/web/messages/*.json`,
3. review them in a pull request like any other change,
4. merging runs `Promote Prod Translations`, which pushes the committed snapshots
   into production Tolgee.

The applications merge Tolgee **over** the committed bundle at runtime, so
without step 4 the two drift and the staler side wins silently. On 16 September
local Tolgee was still serving three strings git had superseded weeks earlier,
and a `local:up` would have pulled them all back over the repository.

A product with no translator in the loop may bundle its messages and skip Tolgee
entirely — kini and `trading-bot`'s console do — but that is a decision to write
down, not a gap to leave implied.

## Schema changes

Numbered SQL files with the runner notifications uses, for every service on plain
`pg`: gpool, notifications and the control-plane. kini keeps TypeORM migrations,
because its entities depend on them. Four services with four mechanisms, one of
which had no migration history at all, is how a schema change becomes a
deployment risk.

## Formatting

Prettier, with a `format` and `format:check` script at the repository root, and
one `.prettierrc` shared byte-for-byte across the estate. No per-application
copy: kini carried one in `apps/api/` that happened to agree, which is worse than
disagreeing, because it would have drifted without anyone noticing.

The `format:check` script runs in CI and must cover every file type the
repository actually contains — a glob that silently misses `.yml` is a check that
passes while the files drift.

Generated files are excluded, and both exclusions were bought the hard way:

- `CHANGELOG.md` is written by release-please, which does not format its output,
  so globbing it makes every release pull request red on a file nobody edits.
- `apps/web/src/lib/api/generated.ts` in gpool and kini is written verbatim by
  the contract generator, and CI regenerates it and diffs it. Formatting it fails
  that diff inside the slowest job, looking exactly like an API contract change.
  A `.prettierignore` holds the line.

## Frontend code layout

Next.js applications keep source under `src/`:

```
apps/<name>/src/
  app/            route handlers and pages
  components/     presentational and interactive components
  lib/            non-React helpers
  i18n/           locale resolution and message loading
  observability/  the kit: metrics, RUM, feature flags
```

`trading-bot`'s operator console keeps its locale helpers in `lib/i18n/`.

## Backend code layout

NestJS applications group by feature, with cross-cutting concerns under
`common/`:

```
apps/api/src/
  common/         guards, filters, interceptors, the problem-details body
  health/         the health module
  observability/  the kit, including the tracer main.ts loads
  <feature>/      one directory per bounded concern
  main.ts
  app.module.ts
```

HTTP, process and health metrics come from the kit in `observability/`, at the
same path in every service, so a fix lands at the same address everywhere.
`notifications` keeps its own domain metrics in `src/metrics/`.

**The kit is still hand-copied, and is decided to become a tagged package** —
published and pinned the way design-system is, so a change arrives as a version
bump in a reviewable pull request. Until that lands, copies drift with nothing
reporting it: `feature-flags.ts` is behind in every repository but cv, and
`http-metrics.middleware.ts` in all three Nest APIs.
