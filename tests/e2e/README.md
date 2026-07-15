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
