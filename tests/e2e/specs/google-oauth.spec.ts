import { test, expect } from '../support/fixtures';
import { uniqueSuffix } from '../support/env';

// Selectors verified against the real markup — apps/user-portal/src/app/account/login/login-client.tsx,
// account/settings/settings-client.tsx, api/auth/google/route.ts, api/auth/google/callback/route.ts,
// account/oauth-complete/oauth-complete-client.tsx (see task-11-report.md for the full check):
// no mismatches found against the brief's guessed skeleton — 'Continue with Google' is a real <a>
// (getByRole('link', ...) resolves it), 'Set a password' is a real <h2>, and the sign-in tab ('signin')
// is login-client.tsx's default useState value, so a fresh /account/login visit shows the email/password
// inputs directly without switching tabs first.
//
// Two real deviations from the brief's guessed spec, found by actually running it against the live
// stack (see task-11-report.md for the full writeup):
//
// 1. The brief's `page.route('https://accounts.google.com/**', ...)` never fires. Proven with a minimal
//    repro: page.route() DOES intercept a direct `page.goto('https://accounts.google.com/...')`, but
//    does NOT intercept accounts.google.com when it's reached as the target of a same-origin 307
//    redirect (exactly what happens here: clicking 'Continue with Google' navigates to our own
//    same-origin /api/auth/google, which 307s to accounts.google.com) — Chromium/Playwright 1.61.1 does
//    not re-offer that redirect hop for interception once the initiating request wasn't itself
//    intercepted. Confirmed empirically (not by rewriting live services from memory): the real
//    "Missing required parameter: client_id" page from Google's actual servers rendered every time,
//    including under a catch-all `context.route('**/*', ...)` pattern and with
//    `--disable-quic`/`--disable-site-isolation-trials` Chromium launch flags (neither fixed it, ruling
//    out QUIC and Site-Isolation-process-swap theories). Fixed by intercepting our OWN
//    `/api/auth/google` request instead: `route.fetch({ maxRedirects: 0 })` performs the real request
//    (so the real state cookie is actually set via its Set-Cookie header, which is preserved), then
//    `route.fulfill()` substitutes a rewritten `Location` pointing straight at our callback — the
//    browser is never asked to navigate to accounts.google.com at all, sidestepping the interception gap
//    entirely rather than fighting it.
// 2. The brief's version generated a unique `email` but never told the mock server to issue an
//    id_token for it (`issueIdTokenFor` was never called), so it would always fall back to the mock's
//    hard-coded default email — the final password-login assertion would target the wrong account (or,
//    on a second local run against the persistent test DB, collide with an already-passworded account
//    from a prior run). Fixed by POSTing to the mock server's /control/next-id-token endpoint
//    (mock-google-server.ts) with this run's unique email before triggering the flow — necessary because
//    global-setup.ts (which starts the mock server) runs in the Playwright *runner* process while specs
//    run in a separate forked *worker* process, so the spec cannot call the in-process
//    `issueIdTokenFor` closure directly.
// 3. The brief's version asserts landing on /account/dashboard, then does a second, separate
//    `page.goto('/account/settings')` hop. That second hop is a hard navigation — a fresh page load —
//    and auth-context.tsx's AuthProvider holds `accessToken` in plain `useState` with **no**
//    localStorage/cookie rehydration on mount (confirmed by reading the file; no `refreshAccessToken()`
//    call exists anywhere on mount), so the settings page arrives logged-out and never renders the "Set
//    a password" form (`hasPassword` stays `null` since its own effect no-ops with no accessToken).
//    `register-to-bid.spec.ts`'s own header comment already documents this exact pitfall and its fix:
//    reach the target page through the *first* client-side redirect instead of a second hard `page.goto`.
//    Here that means setting `returnUrl=/account/settings` on the initial `/account/login` visit —
//    `login-client.tsx` forwards `returnUrl` straight into the Google link's href, and
//    `oauth-complete-client.tsx` calls `refreshAccessToken()` then `router.replace(returnUrl)` (a
//    client-side push, not a reload), landing on /account/settings with `accessToken` still in memory.
//
// Also: the brief's `page.request.get('/api/auth/refresh').then((r) => r.request().headers())` does not
// type-check — APIResponse has no `.request()` method — replaced with a real assertion matching
// auth.spec.ts's own established /api/auth/refresh (GET) pattern.
test('sign up with Google, then set a password from account settings', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e-google-${suffix}@carat-test.internal`;
  const mockGooglePort = process.env.MOCK_GOOGLE_PORT;
  if (!mockGooglePort) throw new Error('MOCK_GOOGLE_PORT is not set — global-setup.ts should have set it');

  // The mock Google server issues an id_token for whatever email/verified flag was last set on it;
  // seed.ts's registerAndVerifyUser pattern isn't used here since there is no password to seed —
  // the account is created entirely through the OAuth flow itself.
  await page.request.post(`http://localhost:${mockGooglePort}/control/next-id-token`, {
    data: { email, emailVerified: true },
  });

  // Intercept our own portal's redirect-issuing route (not accounts.google.com — see the file-top
  // comment for why that doesn't work) and rewrite its Location to go straight to our callback, with a
  // fake code, using the real `state` value from the real (executed-for-real) response so the real state
  // cookie set alongside it still validates.
  await page.route('**/api/auth/google?**', async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const location = response.headers()['location'];
    const state = location ? new URL(location).searchParams.get('state') : null;
    const callbackUrl = new URL('/api/auth/google/callback', page.url());
    callbackUrl.searchParams.set('code', 'fake-auth-code');
    if (state) callbackUrl.searchParams.set('state', state);
    await route.fulfill({ response, status: 302, headers: { ...response.headers(), location: callbackUrl.toString() } });
  });

  // returnUrl=/account/settings (not the default /account/dashboard) so oauth-complete-client.tsx's
  // post-login redirect is a client-side router.replace() straight to the settings page — see the
  // file-top comment's point 3 for why a second, separate page.goto('/account/settings') hop does not
  // work here.
  await page.goto(`/account/login?returnUrl=${encodeURIComponent('/account/settings')}`);
  await page.getByRole('link', { name: 'Continue with Google' }).click();

  // --- Set a password from account settings (Task 10) ---
  await expect(page).toHaveURL(/\/account\/settings/);
  await expect(page.getByRole('heading', { name: 'Set a password' })).toBeVisible();
  const passwordFields = page.locator('input[type="password"]');
  await passwordFields.nth(0).fill('Passw0rd!e2e');
  await passwordFields.nth(1).fill('Passw0rd!e2e');
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText('Password set.')).toBeVisible();

  // --- Confirm password login now works too ---
  // Sanity check that the OAuth-issued session cookie is actually present before navigating away from
  // it (the brief's original line, `page.request.get(...).then((r) => r.request().headers())`, does not
  // type-check — APIResponse has no `.request()` method — so this asserts the same intent for real,
  // matching auth.spec.ts's own /api/auth/refresh GET usage).
  const refreshResponse = await page.request.get('/api/auth/refresh');
  expect(refreshResponse.ok()).toBeTruthy();
  await page.goto('/account/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill('Passw0rd!e2e');
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/account\/dashboard/);
});
