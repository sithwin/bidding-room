# SonarCloud GitHub Action Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SonarCloud static analysis and coverage reporting to every PR against `main`, blocking merge on a failed Quality Gate.

**Architecture:** One SonarCloud project for the whole monorepo. Every workspace package's `vitest.config.ts` gains a shared `coverage` config (LCOV output); the existing `ci.yml` job runs tests with coverage, then a Sonar scan step uploads sources + coverage and waits on the Quality Gate.

**Tech Stack:** Vitest 1.6 + `@vitest/coverage-v8`, Turborepo, `SonarSource/sonarqube-scan-action@v5`, SonarCloud.

## Global Constraints

- `@vitest/coverage-v8` version must match each package's existing `vitest` version: `^1.6.0`.
- SonarCloud project key: `sithwin_bidding-room`; organization: `sithwin`.
- Sonar step must not run (and must not fail CI) on fork pull requests, since they don't receive repo secrets.
- No behavioural change to lint/build/test — this only adds reporting/coverage collection.
- `sonar.qualitygate.wait=true` is how the Quality Gate blocks the PR — no separate quality-gate-check action.

## Manual Prerequisites (not part of this plan's tasks — must be done by a human with SonarCloud/GitHub admin access)

1. Import the `sithwin` GitHub org and the `bidding-room` repo into SonarCloud.
2. In the project's Administration → Analysis Method, turn **off** "Automatic Analysis".
3. Generate a token and add it as the GitHub repo secret `SONAR_TOKEN`.
4. After this plan's changes are merged and green once, add the `ci` job as a required status check in branch protection for `main`.

Until step 3 is done, the Sonar step in `ci.yml` will fail with an auth error on every PR — call this out when opening the PR for this plan.

---

### Task 1: Shared vitest coverage config, wired into every vitest project

**Files:**
- Create: `vitest.shared.ts` (repo root)
- Modify: `apps/admin/vitest.config.ts`
- Modify: `apps/admin-portal/vitest.config.ts`
- Modify: `apps/auction-engine/vitest.config.ts`
- Modify: `apps/catalogue/vitest.config.ts`
- Modify: `apps/notification-service/vitest.config.ts`
- Modify: `apps/payment/vitest.config.ts`
- Modify: `apps/shipping/vitest.config.ts`
- Modify: `apps/user-auth/vitest.config.ts`
- Modify: `apps/user-portal/vitest.config.ts`
- Modify: `packages/db-migrate/vitest.config.ts`
- Modify: `packages/shared-types/vitest.config.ts`
- Modify: `packages/test-db/vitest.config.ts`

**Interfaces:**
- Produces: `coverage` (named export from `vitest.shared.ts` at repo root) — a `V8` provider coverage options object with `reporter: ['lcov', 'text']`. Every `vitest.config.ts` imports it as `import { coverage } from '../../vitest.shared'` and assigns it to `test.coverage`.

- [ ] **Step 1: Create the shared coverage config**

Create `vitest.shared.ts`:

```ts
export const coverage = {
  provider: 'v8' as const,
  reporter: ['lcov', 'text'] as const,
  exclude: ['**/*.test.ts', '**/*.config.ts', '**/dist/**', '**/node_modules/**'],
};
```

- [ ] **Step 2: Wire it into `apps/admin/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
    coverage,
  },
});
```

- [ ] **Step 3: Wire it into `apps/admin-portal/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    coverage,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 4: Wire it into `apps/auction-engine/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
    coverage,
  },
});
```

- [ ] **Step 5: Wire it into `apps/catalogue/vitest.config.ts`**

Replace the full file with the same content as Step 4 (identical existing config).

- [ ] **Step 6: Wire it into `apps/notification-service/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage,
  },
});
```

- [ ] **Step 7: Wire it into `apps/payment/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    // PGlite serves a single connection — repository test files must not run concurrently
    fileParallelism: false,
    coverage,
  },
});
```

- [ ] **Step 8: Wire it into `apps/shipping/vitest.config.ts`**

Replace the full file with the same content as Step 4 (identical existing config).

- [ ] **Step 9: Wire it into `apps/user-auth/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    coverage,
  },
});
```

- [ ] **Step 10: Wire it into `apps/user-portal/vitest.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], globals: true, coverage },
  resolve: { alias: { '@': resolve(__dirname, './src') } },
});
```

- [ ] **Step 11: Wire it into `packages/db-migrate/vitest.config.ts`, `packages/shared-types/vitest.config.ts`, `packages/test-db/vitest.config.ts`**

Replace each of the three files with:

```ts
import { defineConfig } from 'vitest/config';
import { coverage } from '../../vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage,
  },
});
```

- [ ] **Step 12: Commit**

```bash
git add vitest.shared.ts apps/*/vitest.config.ts packages/db-migrate/vitest.config.ts packages/shared-types/vitest.config.ts packages/test-db/vitest.config.ts
git commit -m "test: add shared vitest coverage config to all workspace projects"
```

---

### Task 2: Install coverage provider, enable `--coverage` on every test script, cache coverage output in Turbo

**Files:**
- Modify: `apps/admin/package.json`
- Modify: `apps/admin-portal/package.json`
- Modify: `apps/auction-engine/package.json`
- Modify: `apps/catalogue/package.json`
- Modify: `apps/notification-service/package.json`
- Modify: `apps/payment/package.json`
- Modify: `apps/shipping/package.json`
- Modify: `apps/user-auth/package.json`
- Modify: `apps/user-portal/package.json`
- Modify: `packages/db-migrate/package.json`
- Modify: `packages/shared-types/package.json`
- Modify: `packages/test-db/package.json`
- Modify: `turbo.json`

**Interfaces:**
- Consumes: `coverage` from Task 1's `vitest.shared.ts` (already wired into each `vitest.config.ts`; this task makes each package actually invoke coverage collection and installs the provider it needs).
- Produces: `<package>/coverage/lcov.info` in every one of the 12 workspaces after `pnpm turbo test` runs — consumed by Task 3's `sonar-project.properties` and Task 4's CI step.

- [ ] **Step 1: Install `@vitest/coverage-v8` in every workspace that has a `vitest.config.ts`**

Run from repo root:

```bash
pnpm --filter @carat-room/admin --filter @carat-room/admin-portal --filter @carat-room/auction-engine --filter @carat-room/catalogue --filter @carat-room/notification-service --filter @carat-room/payment --filter @carat-room/shipping --filter @carat-room/user-auth --filter @carat-room/user-portal --filter @carat-room/db-migrate --filter @carat-room/shared-types --filter @carat-room/test-db add -D @vitest/coverage-v8@^1.6.0
```

Expected: pnpm reports 12 packages updated; each package's `package.json` now has `"@vitest/coverage-v8": "^1.6.0"` under `devDependencies`, matching its existing `"vitest": "^1.6.0"`.

- [ ] **Step 2: Enable coverage on every `test` script**

In each of the 12 `package.json` files listed above, change:

```json
"test": "vitest run",
```

to:

```json
"test": "vitest run --coverage",
```

(`packages/db-migrate/package.json` has no `test:watch` line — only change its `test` script, leave everything else as-is. Same for any other file lacking `test:watch`.)

- [ ] **Step 3: Cache coverage output in Turbo**

In `turbo.json`, change the `test` task from:

```json
"test": {
  "dependsOn": ["^build"]
},
```

to:

```json
"test": {
  "dependsOn": ["^build"],
  "outputs": ["coverage/**"]
},
```

- [ ] **Step 4: Verify coverage output is produced**

Run:

```bash
pnpm install
pnpm turbo test --filter=@carat-room/user-auth
ls apps/user-auth/coverage/lcov.info
```

Expected: the `ls` command prints the file path (no "No such file" error) — confirms the v8 provider ran and emitted LCOV.

- [ ] **Step 5: Run the full test suite to confirm no regressions from coverage instrumentation**

```bash
pnpm turbo test
```

Expected: same pass/fail outcome as before this task (coverage instrumentation must not change test results) — all suites that passed before still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/*/package.json packages/db-migrate/package.json packages/shared-types/package.json packages/test-db/package.json turbo.json pnpm-lock.yaml
git commit -m "test: enable coverage collection across all vitest projects"
```

---

### Task 3: Add `sonar-project.properties`

**Files:**
- Create: `sonar-project.properties` (repo root)

**Interfaces:**
- Consumes: `coverage/lcov.info` paths produced by Task 2, one per workspace under `apps/*/coverage/` and `packages/*/coverage/`.
- Produces: the properties file read by the Sonar scan action added in Task 4 (no explicit interface — the scanner discovers this file by convention at the repo root).

- [ ] **Step 1: Create the properties file**

```properties
sonar.projectKey=sithwin_bidding-room
sonar.organization=sithwin
sonar.sources=apps,packages
sonar.exclusions=**/dist/**,**/node_modules/**,**/migrations/**,**/coverage/**,**/*.config.ts,**/.next/**
sonar.tests=apps,packages
sonar.test.inclusions=**/*.test.ts
sonar.javascript.lcov.reportPaths=apps/*/coverage/lcov.info,packages/*/coverage/lcov.info
```

- [ ] **Step 2: Commit**

```bash
git add sonar-project.properties
git commit -m "chore: add SonarCloud project configuration"
```

---

### Task 4: Wire the Sonar scan into CI

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `SONAR_TOKEN` repo secret (created via the Manual Prerequisites above — not present in this repo yet), `sonar-project.properties` from Task 3, and the `coverage/lcov.info` files produced during `pnpm turbo test` per Task 2.

- [ ] **Step 1: Add a `push` trigger for `main` alongside the existing `pull_request` trigger**

Change the top of `.github/workflows/ci.yml` from:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
```

to:

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

(Needed so merges to `main` also submit a Sonar baseline analysis, not just PRs.)

- [ ] **Step 2: Fetch full git history for Sonar's blame-based new-code detection**

Change:

```yaml
      - uses: actions/checkout@v4
```

to:

```yaml
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
```

- [ ] **Step 3: Add the Sonar scan step after the existing test step**

Change:

```yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm lint
      - run: pnpm turbo test
```

to:

```yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo build
      - run: pnpm lint
      - run: pnpm turbo test
      - name: SonarCloud Scan
        if: github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository
        uses: SonarSource/sonarqube-scan-action@v5
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        with:
          args: >
            -Dsonar.qualitygate.wait=true
```

The `if` guard runs the scan on every push to `main` and on same-repo pull requests, but skips it for fork pull requests (which don't receive `SONAR_TOKEN`), so those PRs still pass CI on build/lint/test alone.

- [ ] **Step 4: Confirm the final file is valid YAML**

```bash
python -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml'))" || node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/ci.yml','utf8'))"
```

Expected: no output / no error (either command succeeds — use whichever interpreter is available; this just parses the YAML for syntax errors).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add SonarCloud scan step with quality gate enforcement"
```

---

### Task 5: End-to-end verification and prerequisite checklist

**Files:** none (verification only)

**Interfaces:** none — this task confirms Tasks 1–4 work together.

- [ ] **Step 1: Confirm the Manual Prerequisites are complete**

Check that:
- The `sithwin` org and `bidding-room` repo are imported into SonarCloud.
- "Automatic Analysis" is turned off for the project.
- `SONAR_TOKEN` exists as a repo secret (`gh secret list` should show it, if you have permission to run this).

If any of these are missing, note it explicitly in the PR description for this plan's changes — the `ci` job will fail on the Sonar step until they're done.

- [ ] **Step 2: Open a PR with all four prior tasks' commits**

```bash
git push -u origin HEAD
gh pr create --title "Add SonarCloud analysis to CI" --body "Adds coverage collection and a SonarCloud quality-gate check to the ci workflow. Requires SONAR_TOKEN secret and SonarCloud project setup (see docs/superpowers/specs/2026-07-11-sonarcloud-github-action-design.md prerequisites) before this will pass."
```

- [ ] **Step 3: Confirm the `ci` job runs and the Sonar step executes**

In the GitHub Actions run for the PR, confirm:
- `pnpm turbo test` step succeeds.
- `SonarCloud Scan` step runs (not skipped, since this is a same-repo PR) and either passes (Quality Gate green) or fails with a Quality Gate/analysis result (not a token/auth error — an auth error means Step 1's prerequisites are incomplete).

- [ ] **Step 4: Confirm the SonarCloud dashboard shows results**

Open the project on sonarcloud.io and confirm the dashboard shows the analysis (bugs/vulnerabilities/code smells/duplication/coverage %) for the branch just analysed.

- [ ] **Step 5: Add `ci` as a required status check**

Once the PR is green, go to GitHub repo Settings → Branches → branch protection rule for `main`, and add `ci` to the required status checks list (if not already required). This is a manual GitHub UI step — no CLI command is prescribed here since it depends on the existing branch protection rule's configuration.

## Plan Self-Review

**Spec coverage:**
- Prerequisites (SonarCloud org/project, disable Automatic Analysis, `SONAR_TOKEN`, branch protection) → Manual Prerequisites section + Task 5 Steps 1 and 5.
- `sonar-project.properties` content → Task 3.
- Shared coverage config, avoid 12x duplication → Task 1.
- `@vitest/coverage-v8` dependency → Task 2 Step 1.
- `turbo.json` `coverage/**` output → Task 2 Step 3.
- `ci.yml` `fetch-depth: 0` → Task 4 Step 2.
- `ci.yml` Sonar scan step with `qualitygate.wait=true` → Task 4 Step 3.
- Fork-PR guard → Task 4 Step 3's `if` condition.
- Push-to-main baseline analysis (spec's edge-case note) → Task 4 Step 1.
- Verification / no behaviour change to tests → Task 2 Steps 4–5.

No spec requirement is without a covering task.

**Placeholder scan:** no TBD/TODO; every step has literal file contents or literal commands; no "similar to Task N" back-references — full content repeated each time (Task 1 Steps 5 and 8 explicitly say to reuse the same shown block from Step 4 for two identically-configured files, since the underlying config is byte-for-byte identical, not because content was omitted).

**Type/name consistency:** `coverage` is exported once from `vitest.shared.ts` (Task 1 Step 1) and imported by the same name (`import { coverage } from '../../vitest.shared'`) in every subsequent config in Tasks 1 and consumed conceptually (not re-imported) by Task 2's `--coverage` flag and Task 3's `lcov.reportPaths`. Package names used in Task 2's `pnpm --filter` command match the `name` field read directly from each `package.json` (`@carat-room/admin`, etc.), not directory names.

## Notes From Execution

- **`user-auth` DB-repository tests need the correct test Postgres to emit coverage.** `apps/user-auth/src/infrastructure/db/postgres-token-repository.test.ts` and `postgres-user-repository.test.ts` default to `postgres://postgres:postgres@localhost:5432/users_test`, which doesn't exist in the dev compose stack (`docker-compose.yml`); the real test Postgres is `docker-compose.test.yml`'s container on port 5433. Until CI's test step launches the correct compose file for `user-auth`, its `coverage/lcov.info` may be silently absent from the Sonar upload for that workspace — Task 4/5 should confirm this before treating a green Sonar run as covering `user-auth`.
- **Pre-existing schema drift, out of scope:** `postgres-token-repository.test.ts`'s inline `CREATE TABLE IF NOT EXISTS users` is missing the `identity_document_key` column that `postgres-user-repository.test.ts`'s copy (and the real migration) has, causing order-dependent failures when both run against a shared real Postgres. Discovered during Task 2; not fixed (unrelated to this plan) — worth a follow-up ticket.
- **Sonar step was unreachable given this repo's pre-existing CI test failures.** `ci.yml`'s existing `pnpm turbo test` step already fails in CI independent of this plan (`user-auth` needs a Postgres CI never provisions; `notification-service` has a React 18/19 version mismatch; `user-portal` has a pre-existing pagination-text test failure) — none caused by this plan. Since the Sonar step originally had no `always()`/`failure()` clause, it was implicitly gated on the test step succeeding, so it would never run in CI as long as those pre-existing failures stood. Fixed post-Task-4 (commit `91d010c`) by changing the step's `if:` to `(success() || failure()) && (...)` so it runs regardless of the test step's outcome.
- **Coverage-gate fairness risk, not resolved in code:** workspaces that never emit `coverage/lcov.info` (any workspace whose tests currently fail, plus `packages/shared-auth`/`packages/shared-events` which have no vitest config at all despite being under `sonar.sources=packages`) will be scored by SonarCloud as 0% covered rather than "no data." This can fail a "coverage on new code" Quality Gate unfairly for those workspaces. Not fixed here — tune the Quality Gate's coverage-on-new-code settings in the SonarCloud UI, or get those workspaces' tests green/covered, as follow-up work.
- **`ci.yml`'s `node-version: '20'` broke `pnpm install` in the actual first CI run** (real run, not this sandbox) — the repo's pinned `packageManager: pnpm@11.8.0` requires Node ≥22.13 (uses `node:sqlite`), unrelated to this plan (Dockerfiles were already on `node:22-alpine` from separate work; the two GitHub Actions workflows hadn't been updated to match). Fixed post-merge-readiness by bumping `ci.yml` and `integration-tests.yml` to `node-version: '24'` (commit `0c240bf`), matching the local dev Node version.
- **`SonarSource/sonarqube-scan-action@v5` was flagged by GitHub as deprecated with a known security vulnerability** after the PR was opened (real CI run, not caught by static review since it's a runtime GitHub Actions marketplace advisory, not a diffable code issue). Bumped to `@v6`, which also required quoting the `args` value (`"-Dsonar.qualitygate.wait=true"` instead of bare `-Dsonar.qualitygate.wait=true`) since v6 was rewritten to prevent command injection and no longer parses bash-style unquoted args the same way. The plan text above (Task 4) still shows `@v5` and the unquoted arg as originally written and reviewed — this note is the record of the subsequent version bump, not a correction to re-run Task 4's review against.
