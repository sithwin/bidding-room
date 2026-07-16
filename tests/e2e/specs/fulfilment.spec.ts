import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone, seedFulfilmentForUser } from '../support/seed';

// Selectors/routes verified against the real markup — apps/user-portal/src/app/account/fulfilments/[id]/page.tsx,
// apps/user-portal/src/app/api/shipping/fulfilments/[id]/address/route.ts (proxies to shipping's
// `POST /api/shipping/fulfilments/:id/choose-ship`), apps/user-portal/src/app/api/shipping/fulfilments/[id]/collection-slot/route.ts
// (proxies to `choose-collect`), and the shipping domain itself
// (apps/shipping/src/domain/fulfilment.ts, apps/shipping/src/presentation/shipping-router.ts):
//
// - **The brief's Step-2 scenario ("choose a shipping address then switch to a collection slot" on the
//   *same* fulfilment) is impossible against the real domain model, not just a selector guess.**
//   `Fulfilment.chooseShip`/`chooseCollect` (fulfilment.ts:80-98) both throw `'Fulfilment method already
//   chosen'` the moment `method !== null` — a fulfilment accepts exactly one method choice, ever, and
//   the router surfaces that as a 409 `CONFLICT` (shipping-router.ts:143-145/174-176). This is clearly
//   intentional business behaviour (you don't ship *and* collect the same lot), not a bug, so per this
//   task's constraints it is not worked around by "trying anyway and swallowing the 409" — this spec
//   instead seeds two independent fulfilments (via `seedFulfilmentForUser`, called twice) and exercises
//   the ship branch on one and the collect branch on the other, which is what the real UI/domain actually
//   supports. The 409-on-reuse behaviour itself is asserted directly as its own case below.
// - The option toggle is two plain `<button>`s ("Ship to me" / "Collect in person", page.tsx:83-89) that
//   flip local `option` state — **not** radio inputs as the brief guessed; `getByRole('radio', ...)`
//   matches nothing on this page.
// - Neither form's `<input>`/`<select>` has an `id`/`htmlFor` pairing with its `<label>` (page.tsx:93-146
//   — labels are plain sibling text, not `<label htmlFor>`), so `getByLabel` cannot find any of them.
//   `react-hook-form`'s `register(field)` does set `name={field}` on every control, so this spec targets
//   `input[name=...]`/`select[name=...]` instead, using the exact field names the real shipping router
//   expects (`fullName`, `line1`, `city`, `postcode`, `country` / `location`, `date`, `timeSlot` —
//   page.tsx:18-21, 24-28; shipping-router.ts:120, 155).
// - Submit buttons are "Confirm Shipping Address" / "Confirm Collection Slot" (not "save|confirm
//   address"/"choose slot|book slot" as the brief guessed) and the success toast text is "Address saved.
//   We'll be in touch with tracking details." / "Collection slot booked. We'll confirm by email."
//   (page.tsx:52, 69) — not "address saved|dispatch"/"collection booked|slot confirmed". The toast
//   (components/primitives/toast.tsx) also self-dismisses after 4s, so the assertion runs immediately
//   after the click rather than waiting.
// - There is no legitimate way in this environment to reach a real fulfilment record through the actual
//   Stripe Checkout browser flow — `STRIPE_SECRET_KEY` is a non-functional placeholder here (see
//   invoice-checkout.spec.ts/browse-and-bid.spec.ts's header comments for the same root cause).
//   `seedFulfilmentForUser` (support/seed.ts) instead drives every other step through real endpoints and,
//   for only the final "Stripe calls our webhook" leg, POSTs a `checkout.session.completed` event to the
//   real `POST /api/payments/webhooks/stripe` endpoint, signed with the shared test `STRIPE_WEBHOOK_SECRET`
//   this environment's payment container actually boots with (`docker-compose.test.yml`'s
//   `whsec_test` default) — the same "known test fixture secret, not a real Stripe payment" approach
//   Stripe's own webhook-testing docs recommend, not a database shortcut. See seed.ts's doc comments on
//   `simulatePaymentReceivedWebhook` for the full chain.
// - Reaching the fulfilment-detail page with the client-side `accessToken` intact after login requires the
//   same `returnUrl` pattern every other authenticated spec in this suite uses (auth.spec.ts,
//   register-to-bid.spec.ts, browse-and-bid.spec.ts, invoice-checkout.spec.ts) — a plain `page.goto()`
//   after login arrives logged-out.

test('choose a shipping address for a fulfilment', async ({ page }) => {
  const user = await registerAndVerifyUser();
  await verifyPhone(user.accessToken);
  const { fulfilmentId } = await seedFulfilmentForUser(user);

  const fulfilmentPath = `/account/fulfilments/${fulfilmentId}`;
  await page.goto(`/account/login?returnUrl=${encodeURIComponent(fulfilmentPath)}`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(fulfilmentPath.replace(/[/[\]]/g, '\\$&')));

  // "Ship to me" is the default-selected option, so the address form is already visible.
  await expect(page.getByRole('heading', { name: 'Delivery Options' })).toBeVisible();

  await page.locator('input[name="fullName"]').fill('Ada Lovelace');
  await page.locator('input[name="line1"]').fill('1 Test Street');
  await page.locator('input[name="city"]').fill('London');
  await page.locator('input[name="postcode"]').fill('SW1A 1AA');
  await page.locator('input[name="country"]').fill('United Kingdom');
  await page.getByRole('button', { name: 'Confirm Shipping Address' }).click();

  await expect(page.getByText("Address saved. We'll be in touch with tracking details.")).toBeVisible();

  // The real domain forbids choosing a second method once one is set (fulfilment.ts:80-98) — confirm the
  // API itself enforces this rather than just asserting the happy path above.
  const secondAttempt = await page.request.post(`/api/shipping/fulfilments/${fulfilmentId}/collection-slot`, {
    headers: { authorization: `Bearer ${user.accessToken}` },
    data: { location: 'sydney-cbd', date: '2027-01-01', timeSlot: '09:00-11:00' },
  });
  expect(secondAttempt.status()).toBe(409);
});

test('book a collection slot for a fulfilment', async ({ page }) => {
  const user = await registerAndVerifyUser();
  await verifyPhone(user.accessToken);
  const { fulfilmentId } = await seedFulfilmentForUser(user);

  const fulfilmentPath = `/account/fulfilments/${fulfilmentId}`;
  await page.goto(`/account/login?returnUrl=${encodeURIComponent(fulfilmentPath)}`);
  await page.locator('input[type="email"]').fill(user.email);
  await page.locator('input[type="password"]').fill(user.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(fulfilmentPath.replace(/[/[\]]/g, '\\$&')));

  await page.getByRole('button', { name: 'Collect in person' }).click();

  const collectionDate = new Date(Date.now() + 3 * 86_400_000).toISOString().split('T')[0];
  await page.locator('select[name="location"]').selectOption('melbourne-cbd');
  await page.locator('input[name="date"]').fill(collectionDate);
  await page.locator('select[name="timeSlot"]').selectOption('11:00-13:00');
  await page.getByRole('button', { name: 'Confirm Collection Slot' }).click();

  await expect(page.getByText("Collection slot booked. We'll confirm by email.")).toBeVisible();
});
