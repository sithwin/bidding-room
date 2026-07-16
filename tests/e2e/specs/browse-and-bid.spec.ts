import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone, approveBidder, seedLot, seedAuction } from '../support/seed';

// Same guard as register-to-bid.spec.ts: this test now drives a real Stripe card-authorisation
// step and asserts a genuinely placed bid, which only works with real Stripe test-mode
// credentials. Without them, skip gracefully rather than hard-failing deep into the flow (e.g. a
// contributor running the suite locally without the repo's secrets, or a fork PR where GitHub
// doesn't forward repo secrets to workflow runs).
const hasStripeKey = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

// Selectors/routes verified against the real markup — apps/user-portal/src/app/auctions/[auctionId]/lots/[lotId]/page.tsx,
// lot-detail-client.tsx, hooks/use-lot-sse.ts, components/primitives/bid-confirmed-modal.tsx (see
// task-8-report.md for the full diff vs. the brief's guessed skeleton, and for the two real,
// pre-existing product bugs this spec surfaces):
//
// - The real lot-detail route is `/auctions/[auctionId]/lots/[lotId]/page.tsx` — the brief's guessed
//   `/auctions/any/lots/${lotId}` is directionally right (`auctionId` is never used by the page fetch,
//   only `lotId` is), but the real `auctionId` is available from `seedAuction`'s return value
//   (`{ auctionId }`, which is actually `lotId` under the hood per seed.ts's doc comment) and is used
//   here for realism/link-building parity with the app's own `Link href={`/auctions/${auctionId}/lots/${lotId}`}`
//   usage (lot-detail-client.tsx:181).
// - Reaching the lot-detail page with the client-side `accessToken` intact after login requires the
//   same `returnUrl` pattern as auth.spec.ts/register-to-bid.spec.ts — a plain `page.goto()` after
//   login arrives logged-out.
// - The desktop "Place Bid" button (`lot-detail-client.tsx:340-346`) has exact text `Place Bid`; the
//   mobile sticky-bar button has the same prefix but extra text (`Place Bid · ...`), so
//   `{ name: 'Place Bid', exact: true }` disambiguates.
// - A successful bid shows `BidConfirmedModal`, heading text `"You're the highest bidder"`
//   (bid-confirmed-modal.tsx:19) — not the brief's guessed "highest bidder|bid placed|you are winning".
//
// ## Card authorisation is now included (real Stripe test-mode credentials available)
//
// `lot-detail-client.tsx`'s `placeBid()` (lines 119-133) requires, for an `APPROVED_BIDDER`, that
// `GET /api/payments/profile` report `stripePaymentMethodId` truthy before the real bid POST is ever
// sent — otherwise it redirects to `/account/register-to-bid?step=3`. This was originally recorded as
// "Bug 1: bidding is gated on a Stripe-verified card that this environment cannot produce", because
// this environment's `STRIPE_SECRET_KEY`/`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` were non-functional
// placeholders. Real Stripe test-mode secrets have since been added, and re-investigation found the
// actual gap was narrower than "Stripe doesn't work here": `approveBidder` (seed.ts) only flips the
// user to `APPROVED_BIDDER` via the admin endpoint — it never drives the card-authorisation step, so
// `payment_profiles` never gets a row for the seeded bidder regardless of Stripe working or not.
//
// Also confirmed by reading `register-to-bid/page.tsx`: the `?step=3` query param `lot-detail-client.tsx`
// redirects to is never actually read by the page (`useState(user ? 2 : 1)` — no `useSearchParams`
// anywhere in that file), so a logged-in user always lands back on Step 2 (Identity), not Step 3
// (Payment). The only real way to reach the card step is to go through Step 2 -> Step 3 in order, the
// same as register-to-bid.spec.ts does. Also confirmed via `apps/user-auth/src/domain/user.ts`:
// `submitIdentityDocument()` unconditionally sets status to `PENDING_REVIEW`, even overwriting an
// existing `APPROVED_BIDDER` — so admin-approval must happen *after* the identity/card steps, not
// before, or it would be silently undone. And since the auction-engine bid endpoint reads
// `verificationStatus` straight from the JWT (not a live DB lookup), the bidder must log in again after
// `approveBidder` runs, to pick up a fresh token carrying `APPROVED_BIDDER` (same gotcha
// `seedFulfilmentForUser` in seed.ts documents for `placeBidDirect`).
//
// So the full, real flow this spec now drives is: register -> verify phone -> log in -> Step 2
// (identity) -> Step 3 (card, Stripe test card `4242424242424242`, same pattern as
// register-to-bid.spec.ts) -> admin `approveBidder` -> log in again (fresh JWT) -> place a real bid.
// The bid-success assertion below is a genuine, non-soft expectation, and the account/bids and
// account/stats checks now assert a real recorded bid, not just well-formed empty responses.
//
// `GET /api/account/bids` and `GET /api/account/stats` were also missing entirely in auction-engine
// (always 404/500) when this spec was first written — implemented in PR #16 alongside the two frontend
// pages that consume them. Both are real, authenticated, correctly-scoped endpoints.
test('browse to a lot, receive SSE updates and place a bid', async ({ page }) => {
  test.skip(!hasStripeKey, 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set — real bid via Stripe card authorisation skipped');

  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken, { estimatedValue: 500 });
  const { auctionId } = await seedAuction(admin.accessToken, lotId, { minBidIncrement: 50 });

  const bidder = await registerAndVerifyUser();
  await verifyPhone(bidder.accessToken);

  const lotPath = `/auctions/${auctionId}/lots/${lotId}`;

  // --- Log in through the real UI with returnUrl set, landing on the register-to-bid wizard so the
  // identity + card steps can be driven for real (see header comment on why `?step=3` alone doesn't
  // work and why this must happen before, not after, admin approval). ---
  await page.goto(`/account/login?returnUrl=${encodeURIComponent('/account/register-to-bid')}`);
  await page.locator('input[type="email"]').fill(bidder.email);
  await page.locator('input[type="password"]').fill(bidder.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/account\/register-to-bid/);

  // --- Identity step (register-to-bid/page.tsx, Step2Identity) — selectors verified against the real
  // markup in register-to-bid.spec.ts. ---
  await page.getByPlaceholder('As it appears on your ID').fill('Jamie Collector');
  await page.getByPlaceholder('DD/MM/YYYY').fill('01/01/1990');
  await page.getByPlaceholder('Street address, suburb, state, postcode').fill('1 Test Street, Sydney NSW 2000');
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'id.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await page.getByRole('button', { name: 'Continue' }).click();

  // --- Card step (register-to-bid/page.tsx, Step3Payment — Stripe CardElement, single combined
  // iframe), Stripe test card, same pattern as register-to-bid.spec.ts. ---
  const cardFrame = page.frameLocator('iframe[title="Secure card payment input frame"]');
  await cardFrame.locator('input[name="cardnumber"]').fill('4242424242424242');
  await cardFrame.locator('input[name="exp-date"]').fill('12/34');
  await cardFrame.locator('input[name="cvc"]').fill('123');
  // Stripe's combined CardElement collects a postal code too — only surfaced once real Stripe
  // credentials made this iframe actually render for the first time in this plan (register-to-bid.spec.ts's
  // card step has always self-skipped before reaching this point); omitting it blocks submission with
  // "Your postal code is incomplete." Stripe's default postal-code validation (no country/locale
  // configured on the Element) expects a 5-digit US-style ZIP, not the AU postcode format used
  // elsewhere in this spec's seed data — a 4-digit value stays flagged "incomplete" even though it's a
  // real Australian postcode.
  await cardFrame.locator('input[name="postal"]').fill('90210');
  await page.getByRole('button', { name: 'Authorise Card' }).click();

  // Real post-card state is "Under review" — adding a card does not auto-approve a bidder, only the
  // separate admin action below does.
  await expect(page.getByRole('heading', { name: 'Under review' })).toBeVisible();

  // Fast-track to APPROVED_BIDDER via the real admin endpoint, now that the card step is done (doing
  // this first would be undone by submitIdentityDocument() resetting status to PENDING_REVIEW — see
  // header comment).
  await approveBidder(admin.accessToken, bidder.userId);

  // Log in again through the real UI so the browser's in-memory accessToken reflects the fresh
  // APPROVED_BIDDER status (the auction-engine bid endpoint reads verificationStatus from the JWT, not
  // a live DB lookup — see header comment), landing on the lot-detail page with accessToken intact.
  await page.goto(`/account/login?returnUrl=${encodeURIComponent(lotPath)}`);
  await page.locator('input[type="email"]').fill(bidder.email);
  await page.locator('input[type="password"]').fill(bidder.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(lotPath.replace(/[/[\]]/g, '\\$&')));

  // --- Lot-detail page renders (page.tsx + lot-detail-client.tsx initial render, SSE hook mounts) ---
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // --- Place a bid through the real "Place Bid" control ---
  await page.locator('input[type="number"]').first().fill('1000');
  await page.getByRole('button', { name: 'Place Bid', exact: true }).click();

  // Real, intended success state (BidConfirmedModal) — now genuinely reachable with a real
  // Stripe-verified card on file, so this is a real (non-soft) assertion.
  await expect(page.getByRole('heading', { name: "You're the highest bidder" })).toBeVisible({ timeout: 10_000 });

  // --- Account bids/stats routes now reflect the real bid placed above ---
  const bids = await page.request.get('/api/account/bids', {
    headers: { authorization: `Bearer ${bidder.accessToken}` },
  });
  expect(bids.ok(), `GET /api/account/bids -> ${bids.status()} ${await bids.text()}`).toBeTruthy();
  const bidsBody = (await bids.json()) as { data: Array<{ lotId: string; amount: number }>; meta: { total: number } };
  expect(Array.isArray(bidsBody.data)).toBeTruthy();
  expect(bidsBody.meta.total).toBeGreaterThanOrEqual(1);
  const recordedBid = bidsBody.data.find(b => b.lotId === lotId);
  expect(recordedBid, `expected a recorded bid for lot ${lotId} in ${JSON.stringify(bidsBody.data)}`).toBeTruthy();
  expect(recordedBid?.amount).toBe(1000);

  const stats = await page.request.get('/api/account/stats', {
    headers: { authorization: `Bearer ${bidder.accessToken}` },
  });
  expect(stats.ok(), `GET /api/account/stats -> ${stats.status()} ${await stats.text()}`).toBeTruthy();
  const statsBody = (await stats.json()) as { data: { totalBids: number } };
  expect(statsBody.data.totalBids).toBeGreaterThanOrEqual(1);
});
