# Human Verification (Turnstile) on Sign-up and Login — Design

**Date:** 2026-07-11
**Status:** Approved
**Scope:** user-portal sign-up and login forms; user-auth `/register` and `/login` endpoints

## Problem

The registration and login endpoints have no bot protection. `POST /api/users/register`
(user-auth, port 3001) can be scripted to flood the platform with fake accounts, and the
login endpoint is open to credential-stuffing bots.

## Decision Summary

| Decision | Choice |
|----------|--------|
| Mechanism | Cloudflare Turnstile (managed/invisible mode) |
| Enforcement point | user-auth service (presentation-layer middleware) |
| Scope | Both sign-up (register) and login |
| Outage behaviour | **Fail open** — Cloudflare unreachable ⇒ allow, log warning |
| Invalid token | Reject with `400 CAPTCHA_FAILED` |

## Architecture

The check is boundary validation, so it lives in the presentation layer — the use cases
(`RegisterUseCase`, `LoginUseCase`) are untouched and remain reusable by internal flows
such as `admin-create-user`, which must never require a captcha.

```
login-client.tsx (Turnstile widget → turnstileToken in body)
  → Next.js proxy /api/auth/register | /api/auth/login (forwards body unchanged)
    → user-auth presentation middleware (verifies token via HumanVerifier)
      → RegisterUseCase | LoginUseCase (unchanged)
```

## Components

### Frontend — apps/user-portal

- `login-client.tsx`: render a Turnstile widget (via `@marsidev/react-turnstile`) on both
  the **Sign In** and **Create Account** tabs. Managed mode — invisible for most users.
- The token is included as `turnstileToken` in the JSON body of both `handleLogin` and
  `handleRegister`.
- Submit buttons stay disabled until a token exists.
- Error slots: "Please complete the verification" when no token; server `CAPTCHA_FAILED` /
  `CAPTCHA_REQUIRED` messages render in the existing `serverError` slot.
- Tokens are single-use: the widget is reset after every failed submit.
- Site key from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.

### Proxies — apps/user-portal/src/app/api/auth/{register,login}/route.ts

- No logic change; they already forward the full JSON body. Verify the login proxy does.

### Backend — apps/user-auth

- `src/application/human-verifier.ts` (port):
  `interface HumanVerifier { verify(token: string, remoteIp?: string): Promise<boolean> }`
- `src/infrastructure/turnstile/turnstile-verifier.ts`: implements the port; POSTs
  `secret`, `response`, `remoteip` to
  `https://challenges.cloudflare.com/turnstile/v0/siteverify` with a 3-second timeout.
  - Cloudflare responds `success: false` ⇒ return `false` (reject).
  - Network error / timeout / non-JSON response ⇒ **return `true`** (fail open) and log
    a warning with the error code — never the token value.
- `src/presentation/user-router.ts`: Hono middleware applied to `POST /register` and
  `POST /login` only:
  - Missing/empty `turnstileToken` ⇒ `400 { error: { code: 'CAPTCHA_REQUIRED', message: 'Human verification is required.' } }`
  - Verifier returns `false` ⇒ `400 { error: { code: 'CAPTCHA_FAILED', message: 'Human verification failed. Please try again.' } }`
  - Otherwise pass through; `turnstileToken` is stripped before the DTO reaches the use case.
- Composition root `src/main.ts` constructs `TurnstileVerifier` from
  `TURNSTILE_SECRET_KEY` and injects it into the router factory.

## Configuration

| Variable | Where | Dev/test value |
|----------|-------|----------------|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | user-portal | `1x00000000000000000000AA` (always passes) |
| `TURNSTILE_SECRET_KEY` | user-auth | `1x0000000000000000000000000000000AA` (always passes) |

- `TURNSTILE_SECRET_KEY` is required: user-auth fails fast on boot if unset.
- Both variables are added to `docker-compose.yml` and `docker-compose.test.yml`
  user-auth/user-portal blocks (env-name drift lesson: names must match `process.env`
  reads exactly).

## Error Handling

| Condition | Result |
|-----------|--------|
| No `turnstileToken` in body | `400 CAPTCHA_REQUIRED` |
| Cloudflare says token invalid/expired | `400 CAPTCHA_FAILED` |
| Cloudflare unreachable / timeout | Allow through; log warning |
| `TURNSTILE_SECRET_KEY` unset at boot | Service exits with config error |

## Testing

- **Router tests** (user-auth): fake `HumanVerifier` — cases: missing token, verifier
  rejects, verifier passes, admin routes unaffected.
- **TurnstileVerifier unit tests**: mocked `fetch` — success, `success: false`,
  network error (asserts fail-open `true`), timeout.
- **Frontend**: register/login handler tests assert `turnstileToken` is sent and that
  `CAPTCHA_FAILED` renders; then drive the real form in the browser with the test site
  key before marking the plan step complete (browser-verification lesson).
- **Integration tests** (`docker-compose.test.yml`): use always-pass test keys so
  existing register/login integration flows keep working; add one test posting
  register without a token expecting `400 CAPTCHA_REQUIRED`.

## Out of Scope

- Rate limiting (separate piece of work, previously discussed).
- Captcha on password reset / OTP endpoints.
- Admin portal login (admin service is a separate surface).
