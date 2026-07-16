# E2E Test Suite

This package holds the Playwright end-to-end tests that drive the
user-portal against the real backend stack (Tasks 3-14 of the coverage-gap
E2E plan, `docs/superpowers/plans/2026-07-12-coverage-gap-e2e.md`). This
README was started in Task 2 (verifying the backend stack boots) and is
completed here in Task 14.

## Two-command local run

Once the backend stack is booted and healthy (see "Boot the backend stack"
below) **and** `user-portal` has been built with the real service URLs (see
"Important — building the portal with the right service URLs" above — this
is a one-time build step, not part of the two-command run itself), the E2E
suite — portal start, five flows, client + server V8 coverage capture — is
exactly two commands:

```bash
docker compose -f docker-compose.test.yml up -d --build   # + wait for health (see below)
pnpm --filter @carat-room/e2e test:e2e
```

`test:e2e` runs Playwright's `globalSetup` (Task 5), which **starts** the
already-built `user-portal` on the host (port 3000, production build via
`next start` — see "Coverage mode" below; `globalSetup` does not run `next
build` itself), runs all specs under `tests/e2e/specs/`, then stops the
portal via a graceful IPC-based shutdown so both server- and client-side V8
coverage are flushed. To turn the raw V8 dumps into the lcov report
SonarCloud reads, run one more command afterwards:

```bash
PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report
```

This writes `tests/e2e/coverage/user-portal/lcov.info`. This third command is
listed in `sonar.javascript.lcov.reportPaths` and CI's own pipeline (Task 12),
but is not part of the "two-command" run the plan and CLAUDE.md refer to —
that phrase is specifically the boot + `test:e2e` pair above.

## Boot the backend stack

The backend stack (`user-auth`, `catalogue`, `auction-engine`, `payment`,
`notification`, `shipping`, plus `postgres`, `redis`, `rabbitmq`) is defined
in `docker-compose.test.yml` at the repo root. These are the exact commands
verified to build and boot the stack to a fully healthy state (Task 2):

```bash
# 1. Build all workspace packages/apps first (not strictly required to boot
#    the Docker stack, but confirms the monorepo TypeScript project graph is
#    sound before building images from it).
pnpm install --frozen-lockfile
pnpm turbo build

# 2. Build and start the backend stack
docker compose -f docker-compose.test.yml up -d --build
```

**Known intermittent flake:** on first boot, one or more services (commonly
`auction-engine`, `user-auth`, `notification`, `payment`, `shipping`) can
exit(1) or report `unhealthy` because they raced Postgres/RabbitMQ's own
startup. A retry recovers it every time observed so far:

```bash
docker compose -f docker-compose.test.yml restart auction-engine  # or whichever service is unhealthy
docker compose -f docker-compose.test.yml up -d                   # no --build needed, just restarts exited containers
```

**Important — building the portal with the right service URLs:** the user-portal's
`apps/user-portal/src/lib/service-config.ts` exports each backend URL as
`process.env.X ?? 'fallback'`. Next 16's Turbopack constant-folds these at
*build* time, and `AUCTION_ENGINE_URL`'s fallback is the Docker-only hostname
`http://auction-engine:3003` (the other four fallbacks already default to
`localhost`, so this only bites `AUCTION_ENGINE_URL`). If the portal is built
before these vars are set, every auction-engine call fails with
`ENOTFOUND auction-engine` at runtime even though the backend stack is healthy.

Also: **`pnpm turbo build --filter=user-portal` does not forward arbitrary env
vars** — `turbo.json` has no `env` allowlist for the `build` task, so Turborepo's
default strict env mode silently strips vars like `AUCTION_ENGINE_URL` even if
they're exported in the shell. Build the portal directly through pnpm instead:

```bash
export USER_SERVICE_URL=http://localhost:3001 \
       CATALOGUE_SERVICE_URL=http://localhost:3002 \
       AUCTION_ENGINE_URL=http://localhost:3003 \
       PAYMENT_SERVICE_URL=http://localhost:3004 \
       SHIPPING_SERVICE_URL=http://localhost:3006
pnpm --filter user-portal build   # NOT `pnpm turbo build --filter=user-portal`
```

```bash
# 3. Wait for every service to report healthy (same loop used in
#    .github/workflows/integration-tests.yml). Requires `jq`; if `jq` is not
#    installed, see the Node fallback below.
timeout 180 bash -c '
  while docker compose -f docker-compose.test.yml ps --format json |
    jq -r "select(.Health != \"healthy\" and .Health != \"\") | .Service" | grep -q .; do
    sleep 5
  done' && sleep 10
```

### `jq`-free fallback (Windows / Git Bash hosts without `jq`)

```bash
timeout 180 bash -c '
  while docker compose -f docker-compose.test.yml ps --format json |
    node -e "let d=\'\''\'\'';process.stdin.on(\"data\",c=>d+=c);process.stdin.on(\"end\",()=>{const lines=d.trim().split(\"\n\").filter(Boolean);const bad=lines.map(l=>JSON.parse(l)).filter(o=>o.Health && o.Health!==\"healthy\");if(bad.length){bad.forEach(o=>console.log(o.Service));process.exit(0)}process.exit(1)})" | grep -q .; do
    sleep 5
  done' && sleep 10
```

### Smoke-check every service's `/health` endpoint

```bash
for p in 3001 3002 3003 3004 3005 3006; do
  echo -n "port $p: "; curl -fsS "http://localhost:$p/health" && echo; done
```

Expected (host ports 3001-3006 map to user-auth, catalogue, auction-engine,
payment, notification, shipping respectively):

```
port 3001: {"status":"ok","service":"user-auth"}
port 3002: {"status":"ok","service":"catalogue"}
port 3003: {"status":"ok","service":"auction-engine"}
port 3004: {"status":"ok","service":"payment"}
port 3005: {"status":"ok"}
port 3006: {"status":"ok","service":"shipping"}
```

### Tear down

```bash
docker compose -f docker-compose.test.yml down -v
```

## CI wiring (Task 12)

The `ci` job in `.github/workflows/ci.yml` runs the full E2E suite (with
coverage) between `pnpm turbo test` and the SonarCloud scan step, so a
failing E2E spec fails the job before Sonar runs — the same pattern
`integration-tests.yml` already uses for `STRIPE_SECRET_KEY` /
`STRIPE_WEBHOOK_SECRET`.

**Required repo secret:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be added
under repo Settings -> Secrets and variables -> Actions, alongside the
existing `SONAR_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`
secrets. It is passed to the `Run E2E suite with coverage` step and forwarded
by `global-setup.ts` into the host-launched user-portal's environment. If the
secret is absent, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` resolves to an empty
string, `lot-detail-client.tsx`'s Stripe card step in Flow 2 self-skips, and
the CI job still passes — it is not required for the suite to succeed, only
for that one card-entry step to actually exercise Stripe Elements.

### Full-credentials secrets (added during Task 12 follow-up — see `.superpowers/sdd/progress.md`'s Task 12 entry for the full bug chain)

Getting CI to actually exercise the Stripe card-authorisation step and the
identity-document upload (rather than self-skip) required six repo secrets
in total. `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` are
real Stripe **test-mode** keys; the four `R2_*` secrets are real Cloudflare
R2 test-bucket credentials (`user-auth`'s identity-document upload step in
`register-to-bid.spec.ts` needs a working R2 bucket to store the uploaded
file against):

| Secret | Used by |
|---|---|
| `STRIPE_SECRET_KEY` | `payment-service` (already required by `integration-tests.yml`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | host-launched `user-portal` build + runtime (Task 7/8 card steps) |
| `R2_ACCOUNT_ID` | `user-auth` (identity-document upload, Task 7) |
| `R2_ACCESS_KEY_ID` | `user-auth` |
| `R2_SECRET_ACCESS_KEY` | `user-auth` |
| `R2_BUCKET_NAME` | `user-auth` — **note:** `catalogue` reads the equivalent bucket name from a differently-named env var (`R2_BUCKET`), a pre-existing cross-service naming inconsistency in production code that is out of this plan's scope; the test config only accommodates it, matching each service's real var name |

Without all six secrets present, `register-to-bid.spec.ts` (identity-document
+ card authorisation) and `browse-and-bid.spec.ts` (card authorisation before
bidding) each self-skip their credential-gated steps via a `hasStripeKey`-style
guard and still pass — this is the expected, intentional local-run mode
without secrets. With all six present (as in CI run `29496584658`, the last
fully green run on this branch/PR), both specs run their real card-entry and
document-upload steps against live Stripe test-mode and R2 test-bucket APIs.

## Fixes required to get the stack booting (Task 2)

The backend service Dockerfiles (`catalogue`, `user-auth`, `auction-engine`,
`payment`, `notification-service`, `shipping`) had several build/boot
blockers, none of which were behavioural — see the Task 2 report
(`.superpowers/sdd/task-2-report.md`) for full detail:

- No root `.dockerignore` existed, so `COPY apps/<service>/ ...` copied the
  host's locally-built `node_modules` into the Linux build context,
  corrupting `tsc` module resolution inside the container.
- Each service's Dockerfile ran `pnpm --filter <service> build` directly,
  which does not build the service's workspace dependencies
  (`@carat-room/shared-types` etc.) first, causing `TS2307` errors. Switched
  to `pnpm exec turbo run build --filter=<service>`, which resolves the
  dependency graph (`turbo.json` was not previously copied into the build
  context either).
- The runtime image stage only copied the root `node_modules` and the
  service's `dist/`, flattening the directory structure. pnpm's workspace
  linking uses relative symlinks (e.g.
  `apps/<service>/node_modules/@carat-room/shared-auth -> ../../../../packages/shared-auth`)
  that depend on the original directory depth being preserved, and workspace
  packages are symlinked directly to `packages/<pkg>` (not the `.pnpm`
  store), so `packages/` and each service's own `node_modules/` also had to
  be copied into the runtime image, and the working directory changed to
  `/app/apps/<service>`.
- The runtime image never copied `apps/<service>/migrations/`, so
  `@carat-room/db-migrate` failed with `ENOENT` on boot for every service
  that runs migrations (`catalogue`, `user-auth`, `auction-engine`,
  `payment`, `shipping`).
- `docker-compose.test.yml`'s `notification` service had
  `TWILIO_ACCOUNT_SID: test-sid`, an invalid fixture value — the Twilio SDK
  requires the SID to start with `AC`, so the service crashed on boot before
  the HTTP server even started. Changed to a well-formed dummy SID
  (`AC` + 32 zeros).

## Coverage pipeline (Task 4 — coverage spike)

The portal under test (`user-portal` or `admin-portal`) runs **on the host**,
not in Docker — only the six backend services run in Docker. Playwright
drives the host-launched portal against the Dockerised backend stack, and we
collect coverage from both sides: server-side V8 coverage from the portal's
Node process (`NODE_V8_COVERAGE`) and client-side V8 coverage from the
browser (`page.coverage`), merging both into a single lcov report via
`monocart-coverage-reports`.

### Coverage mode: production build (`next start`)

**Chosen mode: production build.** `productionBrowserSourceMaps: true` (set
on both portals) turned out to be sufficient — Step 7 of the Task 4 brief
(grep the generated lcov's `SF:` lines for
`apps/user-portal/src/app/api/catalogue/auctions/route.ts` and
`apps/user-portal/src/app/page.tsx`) passed on the **first** production build,
with real per-line/per-function coverage data (`FN:`, `FNDA:`, `DA:` records),
not just bare `SF:` headers. The `next dev` fallback described in the brief
(Step 8) was **not needed**. This means every later task (5–11) should launch
portals with `pnpm --filter <app> build` beforehand and `next start`, exactly
as `support/portal.ts` does today.

### A Windows-specific pitfall in `startPortal`/`stop()` (read this before changing `portal.ts`)

The brief's starter code for `support/portal.ts` spawns
`pnpm --filter <app> exec next start -p <port>` and stops it with
`child.kill('SIGTERM')`. Verified empirically on this Windows host, **two**
things about that approach silently drop the coverage dump:

1. **Process-hop signal loss.** `pnpm exec` (and, on Windows, the shell
   wrapper needed to resolve `pnpm.cmd`) inserts one or two extra process
   hops between the spawned child and the actual `next start` server. A
   signal delivered to the immediate child never reaches the real server
   process, which is orphaned and never gets a chance to flush coverage.
   **Fix**: `startPortal` now `fork()`s a small bootstrap
   (`support/portal-child.cjs`) that `require()`s Next's CLI entry
   (`next/dist/bin/next`) directly, in-process — no shell, no `pnpm exec`, no
   extra hop. There is exactly one child process to manage, and `fork()`
   gives it an IPC channel for free.
2. **`child.kill('SIGTERM')` is forceful on Windows — always, even
   self-directed.** Node's own docs already say this for cross-process
   signals ("on Windows... the process will be killed forcefully and
   abruptly, similar to `SIGKILL`"), but it is easy to assume a
   *self*-directed `process.kill(process.pid, 'SIGTERM')` inside the child is
   just a local JS event and therefore safe. It is not: on this Windows host,
   `process.kill(process.pid, 'SIGTERM')` goes through the same OS-level
   `uv_kill()` path and forcibly terminates the process before any
   `'SIGTERM'` listener runs — verified with a minimal repro (see Task 4
   report). **Fix**: the parent (`portal.ts`) sends an IPC `'shutdown'`
   message instead of an OS signal; `portal-child.cjs` responds by calling
   `process.emit('SIGTERM')`, which invokes the same `process.on('SIGTERM',
   ...)` listeners (Next.js's own graceful-shutdown handler,
   `apps/*/node_modules/next/dist/server/lib/start-server.js`) synchronously,
   in-process, without ever touching the OS signal layer. This is portable —
   it is the identical code path on POSIX — so it is used unconditionally
   rather than branching on `process.platform`.

`PortalHandle.stop()` still falls back to `child.kill('SIGTERM')` if the IPC
channel isn't connected, which is a correct graceful stop on POSIX but is
**not** guaranteed to flush coverage on Windows; the IPC path is the
primary and preferred mechanism on every OS.

### Env vars for host portals

```
NODE_V8_COVERAGE=<server coverage dir>   # set internally by startPortal(), from opts.coverageDir
USER_SERVICE_URL=http://localhost:3001
CATALOGUE_SERVICE_URL=http://localhost:3002
AUCTION_ENGINE_URL=http://localhost:3003
PAYMENT_SERVICE_URL=http://localhost:3004
SHIPPING_SERVICE_URL=http://localhost:3006
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<optional — see "Full-credentials secrets" above; empty string self-skips card steps>
```

None of these need to be exported by hand for a local run — `global-setup.ts`
sets the five `*_SERVICE_URL` vars itself (Task 5) and forwards whatever
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is present in the shell (or an empty
string) into the host-launched portal's environment. Export
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (and, for the Docker-side Stripe/R2 calls,
`STRIPE_SECRET_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` before `docker compose ... up`) only
if you want the card-authorisation and identity-upload steps to actually run
instead of self-skip.

`build-lcov.mjs` (generalised in Task 11 to merge coverage per portal) reads:

```
PORTAL                 # default user-portal — selects which portal's coverage to merge
SERVER_COVERAGE_DIR    # default {os.tmpdir()}/e2e-cov/<portal>/server
CLIENT_COVERAGE_DIR    # default {os.tmpdir()}/e2e-cov/<portal>/client
LCOV_OUT_DIR            # default ./coverage/<portal>
```

`SOURCE_ROOT` is no longer an env var — the script derives it as
`apps/<portal>/src` from `PORTAL` directly, so it can't drift from
`sourceFilter`'s own root.

The `os.tmpdir()`-based defaults already avoid the Windows path pitfall
below by construction (they match whatever `global-setup.ts`/`fixtures.ts`
resolve `os.tmpdir()` to on the running host), so overriding
`SERVER_COVERAGE_DIR`/`CLIENT_COVERAGE_DIR` should rarely be necessary. If
you do override them on a Windows host, prefer explicit Windows-style
absolute paths (e.g. a `%TEMP%`-rooted directory) — `/tmp/...`-style paths
are resolved inconsistently depending on whether the interpreting process is
a Git-Bash-launched shell command or a native `node.exe` child process
spawned via `child_process`; a native `node.exe` treats a leading `/` as
relative to the current drive root (e.g. `E:\tmp\...`), not the Git-Bash
`/tmp` mount.

### Two-command local run

See "Two-command local run" near the top of this file for the exact commands
and required env vars/secrets. Task 4 validated the full chain (build portal
→ start on host with `NODE_V8_COVERAGE` → run one Playwright spec against it
with `page.coverage` → stop via the IPC-based graceful shutdown → `node
scripts/build-lcov.mjs`) using a throwaway shell driver; Task 6 wired
`startPortal`/`stop()` into Playwright's `globalSetup`/`globalTeardown` so
`pnpm test:e2e` alone drives the whole thing, and Task 14 verified the full
CI-equivalent local pipeline end-to-end (see "Local pipeline verification
(Task 14)" below).

## Local pipeline verification (Task 14)

The full CI-equivalent pipeline was run once locally, on Windows, matching
`.github/workflows/ci.yml`'s step order:

```bash
pnpm install --frozen-lockfile && pnpm turbo build && pnpm lint && pnpm turbo test
docker compose -f docker-compose.test.yml up -d --build   # + health wait, one restart of
                                                            # auction-engine needed — the
                                                            # documented intermittent race
export USER_SERVICE_URL=http://localhost:3001 CATALOGUE_SERVICE_URL=http://localhost:3002 \
       AUCTION_ENGINE_URL=http://localhost:3003 PAYMENT_SERVICE_URL=http://localhost:3004 \
       SHIPPING_SERVICE_URL=http://localhost:3006
pnpm --filter user-portal build   # NOT `pnpm turbo build --filter=user-portal` — see the
                                    # AUCTION_ENGINE_URL pitfall documented above; the plain
                                    # `pnpm turbo build` run moments earlier bakes in the
                                    # Docker-only fallback and must be corrected before test:e2e
pnpm --filter @carat-room/e2e exec playwright install chromium
pnpm --filter @carat-room/e2e test:e2e
PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report
docker compose -f docker-compose.test.yml down -v
```

**Results:**

- `pnpm install --frozen-lockfile`, `pnpm turbo build`, `pnpm lint` — all
  green.
- `pnpm turbo test` — green (20/20 packages), but only after starting a
  throwaway Postgres container on host port 5432 with
  `POSTGRES_USER=postgres POSTGRES_PASSWORD=postgres POSTGRES_DB=users_test`
  (matching `ci.yml`'s `postgres` service container). Without it,
  `user-auth`'s two `PostgresUserRepository`/`PostgresTokenRepository`
  integration tests fail with `ECONNREFUSED ::1:5432` — this is the
  pre-existing Phase-4 debt already recorded in
  `docs/superpowers/SESSION-SUMMARY.md` ("2 `PostgresUserRepository`
  integration tests need a live Postgres on :5432"), not a regression from
  this plan. `docker-compose.test.yml`'s Postgres runs on host port 5433, not
  5432, so it does not substitute for this.
- Backend stack boot — green after one `docker compose ... restart
  auction-engine` (the documented intermittent startup race: `auction-engine`
  connected to RabbitMQ before the broker had fully finished its own startup,
  logged `Error: connect ECONNREFUSED <ip>:5672`, and sat in
  `health: starting` until restarted). All 9 containers (6 services +
  Postgres + Redis + RabbitMQ) reported `healthy` after the restart, and the
  `/health` smoke-check on ports 3001–3006 returned 200 with the expected
  service names.
- `pnpm --filter @carat-room/e2e test:e2e` — green: **5 passed, 2 skipped, 0
  failed**. The two skips are `browse-and-bid.spec.ts` and
  `register-to-bid.spec.ts`'s Stripe-card/identity-document steps, which
  self-skip via their `hasStripeKey` guard (Task 12 fix) because this shell
  had none of the six full-credentials secrets set (see "Full-credentials
  secrets" above) — this is the expected, documented local-run mode without
  secrets. All five other flows (auth, both fulfilment specs, invoice
  checkout, the coverage spike) passed against the real stack.
- `PORTAL=user-portal pnpm --filter @carat-room/e2e coverage:report` —
  green: `[user-portal] mapped src files: 67` (matches Task 11's report),
  producing `tests/e2e/coverage/user-portal/lcov.info` (189 `SF:` entries).
- `docker compose -f docker-compose.test.yml down -v` — all containers and
  volumes removed.

**Mode:** this was the no-secrets local run (Stripe/R2 credentials not
present in this shell). The full-credentials run — all five flows
unconditionally exercising every step including real Stripe card
authorisation and R2 identity-document upload — was already proven green in
CI run
[`29496584658`](https://github.com/sithwin/bidding-room/actions/runs/29496584658)
(Task 12's follow-up work); re-proving it locally was not required for this
task and was skipped since the real secrets were not available in this
shell.

## Quality Gate verification (Task 14)

CI run `29496584658` (commit `c1cb608`, the most recent CI run on this
branch/PR — draft PR #17, `test/coverage-gap-e2e-v2` → `main`) is fully
green end to end: build, the "Rebuild user-portal with real service URLs"
step, lint, 164 unit tests, all 7 E2E specs run for real (including a
genuine completed Stripe card authorisation and a real recorded bid), lcov
coverage generation, and the SonarCloud Scan step. The scan's log line is
unambiguous:

```
QUALITY GATE STATUS: PASSED - View details on https://sonarcloud.io/dashboard?id=sithwin_bidding-room&pullRequest=17
EXECUTION SUCCESS
```

Because the step runs with `-Dsonar.qualitygate.wait=true`, a failing gate
would have exited non-zero and failed the job — it did not.

Querying the SonarCloud public API directly for PR 17's `project_status`
confirms the same result and gives the per-condition detail (5 of the 6
`Sonar way` conditions were evaluated and are all `OK`; `new_coverage` was
not evaluated for **this PR-diff's** gate because `new_lines_to_cover` is
`0` for the diff between this branch and `main` — nearly all
coverage-relevant production-code changes surfaced during this plan's
execution were already extracted into separate fix PRs (#11–#16) and merged
straight to `main` along the way, per `.superpowers/sdd/progress.md`, so
this branch's remaining diff against `main` is now almost entirely
test/config/doc files that Sonar correctly does not count as lines needing
coverage).

**Important nuance, reported plainly per the Global Constraints — do not
paper over this:** `main`'s *own* rolling quality gate (the actual target
named in this plan's goal: "raise new-code coverage from 44.4% to ≥ 80% on
`main`") is **currently `ERROR`**, not green:

```
new_coverage: 62.7% (threshold: ≥ 80%) — FAILING
new_lines_to_cover: 709, new_uncovered_lines: 282 (30-day new-code period)
```

This is expected, not a defect in this plan's work: `main`'s 30-day
new-code period already includes the six fix PRs (#11–#16) merged during
this plan's execution, but **not yet** this branch's own contribution — the
Playwright E2E lcov report (`tests/e2e/coverage/user-portal/lcov.info`,
registered in `sonar.javascript.lcov.reportPaths` by Task 11) that measures
real coverage against many of those same 282 currently-uncovered lines.
`main` will not reflect that coverage until PR #17 itself merges — which,
per the plan's own stated workflow and this task's brief, happens **after**
Task 14 and a whole-branch review, not as part of this task. This task's
scope (per the brief's explicit adjustment) was to confirm this branch/PR's
own SonarCloud analysis gate passes cleanly before that merge — confirmed
above — not to merge to `main` or independently verify `main`'s post-merge
number.
