import { test, expect } from '../support/fixtures';
import { retrieveEmailVerificationLink } from '../support/seed';
import { uniqueSuffix } from '../support/env';

// Selectors verified against the real markup — apps/user-portal/src/app/account/login/login-client.tsx,
// verify-email-client.tsx, api/auth/refresh/route.ts (see task-6-report.md for the full diff vs. the
// brief's guessed skeleton):
//
// - login-client.tsx's <label> elements are not associated with their <input>s (no htmlFor/id, and
//   they are siblings, not wrappers), so getByLabel(/email/i) cannot find them. Selecting by
//   input[type=...] works because only one form (sign-in XOR register) is ever mounted at a time —
//   the component renders the two forms via a ternary, never both.
// - Both the tab-switch button and the form's submit button can read "Sign In" / "Create Account" at
//   the same time, which makes getByRole('button', { name: ... }) ambiguous once the target form is
//   mounted — 'form button[type="submit"]' scopes to the actual submit button unambiguously.
// - The login route is /account/login, not /login; a successful sign-in redirects to
//   /account/dashboard (LoginClient's default returnUrl), not /account or /.
// - api/auth/refresh/route.ts only exports GET (and DELETE) — no POST handler exists, so
//   page.request.post('/api/auth/refresh') would 405. Using GET, matching auth-context.tsx's own
//   refreshAccessToken().
test('register, verify email, log in and refresh the session', async ({ page }) => {
  const suffix = uniqueSuffix();
  const email = `e2e-ui-${suffix}@carat-test.internal`;
  const password = 'Passw0rd!e2e';

  // --- Register through the real UI (login-client.tsx, register tab) ---
  await page.goto('/account/login');
  // exact: true (which also makes matching case-sensitive) disambiguates this tab-switch button
  // ("Create Account") from the sign-in form's "Create account" link with the same text otherwise.
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await page.locator('input[type="email"]').fill(email);
  const passwordFields = page.locator('input[type="password"]');
  await passwordFields.nth(0).fill(password);
  await passwordFields.nth(1).fill(password);
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  // --- Verify email via the real link a user would receive (verify-email-client.tsx) ---
  // The verification code is never returned over HTTP by user-auth (see seed.ts doc comments), so
  // it's read directly out of the DB the same way registerAndVerifyUser does, then driven through the
  // actual /account/verify-email?token=&userId= URL rather than an API call, to exercise the real
  // client component.
  const { userId, code } = await retrieveEmailVerificationLink(email);
  await page.goto(`/account/verify-email?token=${code}&userId=${userId}`);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  // verify-email-client.tsx redirects to /account/login 3s after success.
  await expect(page).toHaveURL(/\/account\/login/, { timeout: 10_000 });

  const loginResponse = page.waitForResponse((res) => res.url().includes('/api/auth/login'));

  // --- Log in through the real UI (login-client.tsx, sign-in tab, freshly mounted after the redirect) ---
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form button[type="submit"]').click();
  await loginResponse;
  await expect(page).toHaveURL(/\/account\/dashboard/);

  // --- Session refresh (api/auth/refresh/route.ts GET) ---
  // page.request shares the browser context's cookie jar, so the carat_refresh httpOnly cookie set by
  // the login response above is sent automatically.
  const refresh = await page.request.get('/api/auth/refresh');
  expect(refresh.ok()).toBeTruthy();
  const body = (await refresh.json()) as { data: { accessToken: string } };
  expect(body.data.accessToken).toBeTruthy();
});
