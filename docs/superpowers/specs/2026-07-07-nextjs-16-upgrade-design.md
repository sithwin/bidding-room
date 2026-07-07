# Next.js 16 / React 19 Upgrade — Design

**Date**: 2026-07-07
**Status**: Approved

## Overview

Upgrade `admin-portal` and `user-portal` from Next.js 14.2.4 / React 18.3.1 to Next.js 16.2.x / React 19.2. The two apps are upgraded sequentially, each on its own branch off `main`, so lessons learned from the first upgrade inform the second and neither blocks the other's merge.

## Current State

| App | Next.js | React | Notes |
|---|---|---|---|
| `user-portal` | 14.2.4 | 18.3.1 | Uses `images.domains` (deprecated in v16) |
| `admin-portal` | 14.2.4 | 18.3.1 | Has `middleware.ts` + co-located `middleware.test.ts` |

CI (`ci.yml`, `integration-tests.yml`) currently pins `node-version: 20`. Next.js 16 requires Node ≥20.9.0.

Neither app has an ESLint config or `eslint` dependency installed despite a `lint` script existing — pre-existing gap, out of scope for this upgrade.

## Why Next.js 16 (not 15)

Next.js 16 is the current stable major (16.2.7 as of June 2026). Jumping straight to 16 via the official codemod avoids a second migration cycle through 15's temporary sync/async compatibility layer, which is removed entirely in 16.

## Migration Path

**Sequencing**: admin-portal first, user-portal second — not in parallel.

1. Branch `upgrade/admin-portal-nextjs-16` off `main`.
2. Upgrade admin-portal, test and verify it end-to-end.
3. Merge admin-portal's PR into `main` independently.
4. Branch `upgrade/user-portal-nextjs-16` off `main` (not off the admin-portal branch), applying lessons learned from step 2.
5. Upgrade user-portal, test, verify, merge independently.

Each branch/PR stands alone — abandoning or resetting one has no effect on `main` or the other app, since nothing merges until that app's upgrade is verified.

## Per-App Migration Steps

Applied identically to both apps (in sequence, not parallel):

1. Run `npx @next/codemod@canary upgrade latest` inside the app directory. This bumps `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, and auto-migrates:
   - Sync `params` / `searchParams` in page/layout/route files → `await`-based access (18 files across both apps).
   - Sync `cookies()` / `headers()` calls → `await`-based access (5 files across both apps).
   - `middleware.ts` → `proxy.ts`, `export function middleware` → `export function proxy`.
   - `next.config.mjs` flag renames (e.g. `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`) if present.
2. Manual fix (codemod does not touch test files): rename `middleware.test.ts` → `proxy.test.ts` in admin-portal, updating imports/references to match the renamed `proxy` export.
3. Manual fix (not covered by this codemod pass per Next.js docs): in user-portal's `next.config.mjs`, convert `images: { domains: ['pub-placeholder.r2.dev'] }` to `images: { remotePatterns: [{ protocol: 'https', hostname: 'pub-placeholder.r2.dev' }] }`.
4. Turbopack becomes the default for `next dev` and `next build` in v16. Neither app has a custom `webpack()` config in `next.config.mjs`, so no build-breaking conflict is expected — no `--webpack` opt-out needed.
5. Bump CI `node-version` from `20` to `20.9` (or a pinned `20.x` ≥20.9) in `.github/workflows/ci.yml` and `.github/workflows/integration-tests.yml`.

Not in scope: enabling React Compiler (`reactCompiler: true`) or Cache Components (`cacheComponents: true`) — both are new opt-in features in v16, unrelated to version compatibility.

## Testing / Verification

Per app, before merging its branch:

- `pnpm turbo build --filter=<app>` passes (Turbopack, default in v16).
- `pnpm turbo test --filter=<app>` passes.
- Manual smoke test of auth-gated routes relying on the renamed `proxy`:
  - admin-portal: `/admin/*` redirect-to-login / redirect-to-dashboard logic.
  - user-portal: `/account/dashboard`, `/account/bids`, `/account/watchlist`, `/account/won`, `/account/invoices/*`, `/account/fulfilments/*`, `/account/register-to-bid` redirect-if-no-refresh-token logic.
- Manual check of pages that had sync `params`/`cookies()`/`headers()` prior to migration, confirming the codemod's `await`-based output compiles and renders correctly:
  - user-portal: `/auctions/[auctionId]`, `/auctions/[auctionId]/lots/[lotId]`, `/account/invoices/[id]`, `/account/fulfilments/[id]`.
  - admin-portal: `/admin/invoices/[id]`, `/admin/lots/[id]`, `/admin/auctions/[lotId]`, `/admin/users/[id]`, `/admin/fulfilments/[id]`, plus the 5 files using `cookies()`/`headers()` (`api/auth/route.ts`, `api/admin/[...path]/route.ts`, `lib/admin-api.ts`, `lib/auth.ts`, and one more identified during migration).

## Rollback / Error Handling

If the codemod output is broken or build/tests fail, the branch is abandoned or reset — `main` remains untouched throughout, since nothing merges until that app's upgrade is fully verified locally and in CI. No production rollback risk.

## Out of Scope

- ESLint configuration (pre-existing gap, unrelated to this upgrade).
- React Compiler and Cache Components adoption.
- Any other apps in the monorepo (only `user-portal` and `admin-portal` use Next.js).
