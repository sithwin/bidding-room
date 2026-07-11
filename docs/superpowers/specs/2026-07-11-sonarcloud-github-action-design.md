# SonarCloud Analysis via GitHub Actions — Design

## Purpose

Add static analysis (bugs, vulnerabilities, code smells, duplication) and test-coverage
reporting to every pull request against `main`, using SonarCloud, so regressions are caught
before merge rather than discovered later.

## Scope

- One SonarCloud project covering the whole monorepo (not one project per app/package).
- Quality Gate result blocks the PR's CI check on failure.
- Test coverage (LCOV) is wired in and fed to Sonar so it can evaluate "coverage on new code".
- Fork PRs are handled gracefully (skipped, not failed) since they don't receive repo secrets.

## Prerequisites (manual, outside this repo's code)

These steps happen in the SonarCloud UI/account and are **not** part of the implementation
plan — they must be done once, by a human with admin access, before or alongside the PR that
adds this workflow:

1. Sign in to SonarCloud with GitHub, import the `sithwin` organisation, then import the
   `bidding-room` repository as a project.
2. In the new project's **Administration → Analysis Method**, turn **off** "Automatic
   Analysis". CI-based analysis (this design) and Automatic Analysis conflict — if both are
   on, SonarCloud silently ignores the CI-submitted report.
3. Generate a token (My Account → Security → Generate Token) and add it as a GitHub repo
   secret named `SONAR_TOKEN`.
4. After this lands and is green once on `main`, add the `ci` job as a required status check
   in GitHub branch protection settings for `main`.

## Components

### 1. `sonar-project.properties` (repo root, new file)

```properties
sonar.projectKey=sithwin_bidding-room
sonar.organization=sithwin
sonar.sources=apps,packages
sonar.exclusions=**/dist/**,**/node_modules/**,**/migrations/**,**/coverage/**,**/*.config.ts
sonar.tests=apps,packages
sonar.test.inclusions=**/*.test.ts
sonar.javascript.lcov.reportPaths=apps/*/coverage/lcov.info,packages/*/coverage/lcov.info
```

Exact exclusion globs may be adjusted during implementation if they miss generated output
(e.g. Next.js `.next/`), but the shape (exclude build output, node_modules, migrations,
coverage, config files) is fixed.

### 2. Shared coverage config: `vitest.shared.ts` (repo root, new file)

Exports a single `coverage` options object (provider `v8`, reporters `['lcov', 'text']`,
reasonable default excludes for `*.test.ts`/`*.config.ts`). Every existing
`apps/*/vitest.config.ts` and `packages/*/vitest.config.ts` (12 files) imports this object and
spreads it into its own `test.coverage` field, rather than duplicating the same coverage block
12 times.

Each app's own `vitest.config.ts` keeps its existing per-service settings (e.g. catalogue's
`fileParallelism: false`) untouched — only the `coverage` field is added.

### 3. Dependency

Add `@vitest/coverage-v8` as a root `devDependency` (pnpm workspace root), matching the
existing `vitest` version already used across the monorepo.

### 4. `turbo.json`

Add `"coverage/**"` to the `test` task's `outputs` array so per-app coverage output is part of
Turbo's cache/output collection:

```json
"test": {
  "dependsOn": ["^build"],
  "outputs": ["coverage/**"]
}
```

### 5. `.github/workflows/ci.yml` (extend existing job, not a new workflow)

- Change the `actions/checkout@v4` step to include `fetch-depth: 0` (Sonar needs full git
  history for blame-based "new code" detection).
- After the existing `pnpm turbo test` step (which now also emits `coverage/lcov.info` per
  app/package via the shared coverage config), add:

```yaml
- name: SonarCloud Scan
  if: github.event.pull_request.head.repo.full_name == github.repository
  uses: SonarSource/sonarqube-scan-action@v5
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
  with:
    args: >
      -Dsonar.qualitygate.wait=true
```

The `if` guard skips the step entirely for pull requests from forks (no `SONAR_TOKEN`
available to them), so those PRs still pass CI on build/lint/test without a spurious Sonar
failure. `-Dsonar.qualitygate.wait=true` makes the scan step itself poll for and fail on a
Quality Gate failure, so no separate quality-gate-check action is needed.

## Data flow

```
PR opened/updated
  → ci job: checkout (full history) → install → build → lint → test (emits lcov per app)
  → [same-repo PRs only] SonarCloud scan step uploads sources + lcov, waits for Quality Gate
  → Quality Gate pass/fail → step succeeds/fails → ci job succeeds/fails → PR check reflects it
```

## Error handling / edge cases

- **Fork PRs**: Sonar step skipped via `if` guard; rest of CI still runs and gates merge on
  build/lint/test as before. Documented as a known limitation — fork contributors don't get
  Sonar feedback on their PR, only after merge to `main` (push-to-main analysis, same
  workflow, no `if` guard needed since `push` events on `main` always have secrets).
- **Missing `SONAR_TOKEN` secret** (e.g. before the manual prerequisite is done): the scan step
  fails with an auth error. This is expected until the prerequisite steps are completed; the
  PR that adds this workflow should note in its description that `SONAR_TOKEN` must exist
  before merge, or the `ci` job will start failing on every PR.
- **First run / no baseline on `main`**: SonarCloud computes "new code" against the configured
  new-code definition (default: previous version / 30 days). Nothing repo-specific to
  configure for this beyond project creation.

## Testing / verification

- No new application behaviour — nothing to unit test. Verification is: open a PR after
  implementation, confirm the `ci` job runs the Sonar step, uploads lcov, and the SonarCloud
  project dashboard shows analysis results and a Quality Gate status.
- Confirm existing `pnpm turbo test` still passes locally/CI with coverage instrumentation
  enabled (coverage instrumentation must not change test outcomes).

## Out of scope

- Per-app/per-package Sonar projects.
- SonarQube self-hosted server setup.
- Adding the Sonar check to GitHub branch protection rules (manual prerequisite step 4 above).
- Any change to lint or test *behaviour* — this only adds reporting/coverage collection.
