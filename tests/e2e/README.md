# E2E Test Suite

This package will hold the Playwright end-to-end tests that drive both the
user-portal and admin-portal against the real backend stack (Tasks 3-14 of
the coverage-gap E2E plan). This README is started in Task 2 (verifying the
backend stack boots) and will be completed in Task 14.

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
```

`build-lcov.mjs` reads:

```
SERVER_COVERAGE_DIR   # default /tmp/e2e-server-cov
CLIENT_COVERAGE_DIR   # default /tmp/e2e-client-cov
LCOV_OUT_DIR           # default ./coverage/spike
SOURCE_ROOT            # default ../../apps/user-portal
```

On a Windows host, prefer explicit Windows-style absolute paths (e.g. a
`%TEMP%`-rooted directory) for these — `/tmp/...`-style paths are resolved
inconsistently depending on whether the interpreting process is a
Git-Bash-launched shell command or a native `node.exe` child process spawned
via `child_process`; a native `node.exe` treats a leading `/` as relative to
the current drive root (e.g. `E:\tmp\...`), not the Git-Bash `/tmp` mount.

### Two-command local run

```bash
docker compose -f docker-compose.test.yml up -d --build   # then wait-for-health (see above)
pnpm --filter @carat-room/e2e test:e2e                     # after starting the portal on the host — wired in Task 6's globalSetup
```

Task 4 validated the full chain (build portal → start on host with
`NODE_V8_COVERAGE` → run one Playwright spec against it with `page.coverage`
→ stop via the IPC-based graceful shutdown → `node scripts/build-lcov.mjs`)
using a throwaway shell driver; Task 6 is responsible for wiring
`startPortal`/`stop()` into Playwright's `globalSetup`/`globalTeardown` so
`pnpm test:e2e` alone drives the whole thing.
