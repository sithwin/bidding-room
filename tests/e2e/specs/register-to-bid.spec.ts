import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, retrievePhoneOtp } from '../support/seed';

const hasStripeKey = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Selectors and route verified against the real markup — apps/user-portal/src/app/account/verify-phone/page.tsx,
// components/primitives/phone-otp-inline.tsx, app/account/register-to-bid/page.tsx,
// components/primitives/drop-zone.tsx (see task-7-report.md for the full diff vs. the brief's guessed
// skeleton):
//
// - The wizard route is `/account/register-to-bid`, not `/register-to-bid`.
// - Reaching it (and `/account/verify-phone` before it) with the client-side `accessToken` intact
//   requires a client-side (SPA) navigation — `auth-context.tsx`'s `AuthProvider` holds `accessToken`
//   in plain `useState` with no localStorage/cookie rehydration on mount, so any full `page.goto()`
//   after login arrives logged-out. `login-client.tsx` reads `returnUrl` from the query string and
//   `router.push`es it (not a full reload) on success, so `page.goto('/account/login?returnUrl=...')`
//   followed by a form submit is the only way to land on `/account/verify-phone` with the token intact.
// - `verify-phone/page.tsx` has no `<label>`/`htmlFor` association for its phone/OTP inputs — use
//   `input[type="tel"]` and `input[type="text"]` (only one of each is ever mounted, gated by `step`).
// - `register-to-bid/page.tsx`'s Step 2 (identity) fields are also unassociated inputs — selected by
//   placeholder text (`getByPlaceholder`), which is unique per field.
// - The identity file input is `DropZone`'s underlying `<input type="file" class="sr-only">`
//   (components/primitives/drop-zone.tsx) — `accept='image/jpeg,application/pdf'`, so a `.png` file
//   (as the brief guessed) would not match the accept filter; using a `.jpg` fixture instead.
// - Step 4 ("Approved") never actually shows "verified/ready to bid/complete" text on a fresh run —
//   `submitIdentityDocument()` (apps/user-auth/src/domain/user.ts) sets status to `PENDING_REVIEW`,
//   not `APPROVED_BIDDER`; only a separate admin `approve()` action does that. The real heading for an
//   unapproved user is "Under review".
test('complete register-to-bid: phone verification, identity document, then card authorisation', async ({ page }) => {
  const user = await registerAndVerifyUser();

  // --- Log in through the real UI with returnUrl set, so the client-side push after login lands on
  // verify-phone with accessToken still in memory (see header comment above). ---
  await page.goto(`/account/login?returnUrl=${encodeURIComponent('/account/verify-phone')}`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/account\/verify-phone/);

  // --- Phone step (verify-phone/page.tsx) ---
  await page.locator('input[type="tel"]').fill('+447700900000');
  await page.getByRole('button', { name: 'Send Code' }).click();

  const otpInput = page.locator('input[type="text"][inputmode="numeric"]');
  await expect(otpInput).toBeVisible();

  const otp = await retrievePhoneOtp(user.userId);
  await otpInput.fill(otp);
  await page.getByRole('button', { name: 'Verify' }).click();

  await expect(page).toHaveURL(/\/account\/register-to-bid/, { timeout: 10_000 });

  // --- Identity step (register-to-bid/page.tsx, Step2Identity) ---
  await page.getByPlaceholder('As it appears on your ID').fill('Jamie Collector');
  await page.getByPlaceholder('DD/MM/YYYY').fill('01/01/1990');
  await page.getByPlaceholder('Street address, suburb, state, postcode').fill('1 Test Street, Sydney NSW 2000');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'id.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await page.getByRole('button', { name: 'Continue' }).click();

  if (!hasStripeKey) {
    test.skip(true, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — card authorisation step skipped');
  }

  // --- Card step (register-to-bid/page.tsx, Step3Payment — Stripe CardElement, single combined iframe) ---
  const cardFrame = page.frameLocator('iframe[title="Secure card payment input frame"]');
  await cardFrame.locator('input[name="cardnumber"]').fill('4242424242424242');
  await cardFrame.locator('input[name="exp-date"]').fill('12/34');
  await cardFrame.locator('input[name="cvc"]').fill('123');
  await page.getByRole('button', { name: 'Authorise Card' }).click();

  // Adding a card does not auto-approve a bidder (only a separate admin action does — see header
  // comment); the real post-card state is "Under review", not "Approved"/"verified".
  await expect(page.getByRole('heading', { name: 'Under review' })).toBeVisible();
});
