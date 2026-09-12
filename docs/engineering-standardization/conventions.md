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

## Formatting

Prettier, with a `format` and `format:check` script at the repository root. The
`format:check` script runs in CI and must cover every file type the repository
actually contains — a glob that silently misses `.yml` is a check that passes
while the files drift.

## Frontend code layout

Next.js applications keep source under `src/`:

```
apps/<name>/src/
  app/            route handlers and pages
  components/     presentational and interactive components
  lib/            non-React helpers
  i18n/           locale resolution and message loading
  observability/  the vendored kit: metrics, RUM, feature flags
```

`trading-bot`'s operator console keeps its locale helpers in `lib/i18n/`.

## Backend code layout

NestJS applications group by feature, with cross-cutting concerns under
`common/`:

```
apps/api/src/
  common/         guards, filters, interceptors, the problem-details body
  health/         the health module
  observability/  the vendored kit, including the tracer main.ts loads
  <feature>/      one directory per bounded concern
  main.ts
  app.module.ts
```

HTTP, process and health metrics come from the kit copy in `observability/`, at
the same path in every service, so a fix carried over from the kit lands at the
same address everywhere. `notifications` keeps its own domain metrics in
`src/metrics/`.
