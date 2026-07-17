# Google OAuth Sign-In/Sign-Up — Design

**Date:** 2026-07-17
**Status:** Approved for planning

## 1. Overview & Goals

Add "Continue with Google" as an alternative to email/password on both the login page and the registration flow of `user-portal`. The goal is to cut signup friction — typing an email, choosing a password, remembering it later — down to one click, while keeping every existing anti-fraud/compliance gate (phone OTP, identity document, payment method) exactly as it is today before anyone can actually place a bid.

**In scope:**
- Google OAuth (OpenID Connect) sign-in and sign-up
- Auto-linking a Google identity to an existing password account when the verified email matches
- Letting a Google-only account set a password later, as a backup login method

**Out of scope (this spec):**
- Facebook, Apple, or any other identity provider
- Any change to the phone OTP, identity-document, or payment steps themselves
- Admin portal login (stays password-only)

## 2. User Flow (UX)

**New signup via Google:**
1. User clicks "Continue with Google" on `/account/login` or the register step.
2. Browser is redirected to Google's consent screen, approves, is redirected back.
3. Account is created with status `EMAIL_VERIFIED` (skipping `REGISTERED`). User lands in the existing "Register to Bid" wizard (`apps/user-portal/src/app/account/register-to-bid/page.tsx`), entering at the phone-OTP step instead of the account-creation step.
4. Browsing/watching lots is already unauthenticated-friendly, so a Google user can also leave after account creation and return later to continue the wizard — no change needed there.

**Returning user via Google:**
- Same button. If the verified email matches an existing account (password-based or already Google-linked), the user is logged straight in. There is no separate "sign in vs sign up" choice — the backend decides create-vs-link based on whether the email exists.

**Google-only account, adding a password later:**
- A "Set password" action appears in account settings for any user whose `passwordHash` is null. One field (new password + confirm) — no "current password" required since none exists.

**Error states surfaced to the user:**
- User cancels/denies Google consent → redirected back to the login page with a dismissable "Google sign-in was cancelled" message; no account created.
- Google reports `email_verified: false` on the id_token → redirected back with "We couldn't verify this Google account's email — please sign up with email and password instead." Sign-in is rejected; no account created or linked.
- Google/network failure during the token exchange → generic "Something went wrong signing in with Google, please try again" (mirrors the existing `SERVICE_UNAVAILABLE` handling already used in other `user-portal` proxy routes).

## 3. Architecture

### Why the redirect must originate and terminate on `user-portal`

The browser never talks to `user-auth` (port 3001) directly today. Every auth call (`login`, `refresh`, `logout`) goes through a Next.js API route on `user-portal` (port 3000), which makes a server-to-server fetch to `user-auth` and manually copies the `Set-Cookie` header onto its own response (see `apps/user-portal/src/app/api/auth/login/route.ts` and `.../refresh/route.ts`). This means the refresh-token cookie (`carat_refresh`) has always been scoped to the `user-portal` origin, even though `user-auth` is the service that creates it. If the OAuth redirect sent the browser to `user-auth` directly, Google's callback would land on the wrong origin and the cookie would be set where none of the existing refresh/logout routes can see it.

The flow below keeps the browser on `user-portal`'s origin for every hop, and reuses the exact same server-to-server cookie-forwarding pattern the existing login route already uses.

### Sequence

```
Browser                    user-portal (Next.js)              user-auth (Hono)              Google
  |                              |                                   |                          |
  |--GET /api/auth/google------->|                                   |                          |
  |                              |--generate state+PKCE verifier,    |                          |
  |                              |  store in short-lived httpOnly    |                          |
  |                              |  cookie (~10 min TTL)             |                          |
  |<--302 accounts.google.com----|                                   |                          |
  |-----------------------------------------------------------------(consent)-------------------->|
  |<---------------------------------302 back with code, state-------------------------------------|
  |--GET /api/auth/google/callback?code&state------------------------>|                          |
  |                              |--validate state == cookie value   |                          |
  |                              |--POST /api/users/auth/google------>|                          |
  |                              |  { code, codeVerifier }            |--exchange code for       |
  |                              |                                   |  tokens------------------>|
  |                              |                                   |<--id_token, access_token--|
  |                              |                                   |--verify id_token sig      |
  |                              |                                   |  via Google JWKS          |
  |                              |                                   |--reject if !email_verified|
  |                              |                                   |--upsert User (create or   |
  |                              |                                   |  auto-link by email)      |
  |                              |                                   |--issue JWT via existing   |
  |                              |                                   |  TokenService             |
  |                              |<--{accessToken,user}+Set-Cookie---|                          |
  |                              |--forward Set-Cookie (refresh)      |                          |
  |<--302 to dashboard-----------|                                   |                          |
```

Key points:
- `user-portal` never sees Google's client secret or talks to Google's token endpoint directly — it only redirects the browser and relays an authorization `code` server-to-server.
- `user-auth` gains one new endpoint, `POST /api/users/auth/google`, and one new outbound dependency (Google's token + JWKS endpoints). Use a small library (e.g. `arctic`) for the OAuth/PKCE mechanics rather than hand-rolling it.
- Everything downstream of "issue JWT" is fully reused: same `TokenService`, same cookie name/flags, same refresh/logout routes.

### New/changed endpoints

| Service | Endpoint | Purpose |
|---|---|---|
| user-portal | `GET /api/auth/google` | Builds Google auth URL, sets state/PKCE cookie, redirects browser |
| user-portal | `GET /api/auth/google/callback` | Validates state, exchanges code with user-auth, forwards refresh cookie, redirects to dashboard |
| user-auth | `POST /api/users/auth/google` | Exchanges code with Google, verifies id_token, upserts User, issues JWT |

## 4. Data Model Changes

**`apps/user-auth/src/domain/user.ts`** — extend `UserProps`:

```ts
passwordHash: string | null,   // was: string (required) — now nullable for Google-only accounts
authProvider: 'PASSWORD' | 'GOOGLE' | 'BOTH',
googleId: string | null,       // Google's stable `sub` claim, unique when set
```

- `User.create()` gains a factory path for OAuth accounts: no `passwordHash` required, `status` starts at `EMAIL_VERIFIED` instead of `REGISTERED`.
- Auto-linking sets `googleId` on an existing password account and changes `authProvider` to `BOTH`.
- A new migration adds `google_id` (unique, nullable) and `auth_provider` columns, and makes `password_hash` nullable. It must be idempotent (`ADD COLUMN IF NOT EXISTS`) and mirrored into `tests/db-init/init.sql`, per this repo's existing migration conventions.

**Login logic change:** `LoginUseCase` must reject password-login attempts with a clear "This account uses Google sign-in — no password is set" error when `passwordHash` is null, rather than letting a bcrypt compare fail on a null hash.

**No changes** to `UserStatus`, `UserRole`, phone OTP, identity document, or payment logic — those are unchanged, just entered from a different starting status for Google signups.

## 5. Security Considerations

- **CSRF protection:** a random `state` value is generated per attempt and stored in an httpOnly, `SameSite=Lax`, short-lived (~10 min) cookie on `user-portal`. The callback route rejects the request if the `state` query param doesn't match the cookie value or the cookie is missing/expired.
- **PKCE:** used even though this is a confidential (server-side) client, as defense in depth against authorization-code interception. Negligible cost with `arctic`.
- **id_token verification:** `user-auth` verifies the signature against Google's published JWKS (never trusts the token-exchange response body alone), checks `aud` matches our client ID, `iss` is `https://accounts.google.com`, and `email_verified === true` before proceeding.
- **Client secret handling:** the Google OAuth client ID/secret live only in `user-auth`'s environment, never shipped to the frontend — consistent with how the JWT signing key is already handled.
- **Account-linking trust boundary:** auto-linking by email trusts Google's `email_verified` claim as proof of ownership. This is the standard trust boundary used by most consumer platforms with social login, but is called out explicitly here since it's the one place this feature extends trust to a third party.
- **Redirect URI allow-list:** the Google Cloud Console OAuth client is configured with an exact-match redirect URI (`https://<portal-domain>/api/auth/google/callback`), not a wildcard, preventing open-redirect abuse of the flow.

## 6. Testing Approach

- **Unit tests** (co-located, per repo convention): `user.ts` domain tests for the new OAuth-account creation path and the nullable-password login rejection; a new `google-auth.use-case.test.ts` covering create / auto-link / reject-unverified-email branches against a mocked Google client.
- **Integration tests:** a `user-router` test hitting `POST /api/users/auth/google` with a mocked Google token/JWKS response, verifying the issued JWT matches the same shape/claims as password login.
- **E2E (Playwright):** since real Google consent can't be automated in CI, mock Google's OAuth endpoints (token + JWKS) at the network level and drive the full `user-portal` redirect → callback → dashboard flow, plus the "set password later" settings flow.

## 7. Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| Providers (v1) | Google only | Fastest to ship correctly; other providers can follow the same pattern later |
| Verification skip | Skip `EMAIL_VERIFIED` only | Google vouches for email ownership; phone/identity/payment gates are independent fraud controls |
| Account linking | Auto-link by verified email | Matches industry-standard trust boundary; avoids extra friction |
| Password backup | Allow setting a password later | Gives Google-only users a fallback login method |
| Flow architecture | Redirect stays on `user-portal`; `user-auth` does the token exchange | Required by the existing cookie-forwarding proxy pattern; avoids a cross-origin cookie bug |
| Button placement | Both login and register pages | One button serves both flows since the backend decides create-vs-link |
| Unverified Google email | Reject sign-in | We rely on Google's verification to skip our own email step; can't safely skip it if Google itself doesn't vouch |
| Turnstile (added 2026-07-17, post-merge check) | `POST /auth/google` and `POST /me/password` do not require a `turnstileToken` | The Cloudflare Turnstile human-check feature (PR #26) merged to `main` after this spec was first drafted, gating `/register` and `/login` behind `requireHumanVerification`. Google's own consent screen already serves as the human check for sign-up/sign-in via Google, and `/me/password` is already authenticated — adding Turnstile to either would reintroduce the friction this feature exists to remove, for no additional protection |
