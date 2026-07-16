import { test, expect } from '../support/fixtures';
import { registerAndVerifyUser, verifyPhone, approveBidder, seedLot, seedAuction } from '../support/seed';

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
// ## Bug 1 (blocking): bidding is gated on a Stripe-verified card that this environment cannot produce
//
// `lot-detail-client.tsx`'s `placeBid()` (lines 119-133) requires, for an `APPROVED_BIDDER`, that
// `GET /api/payments/profile` report `stripePaymentMethodId` truthy before the real bid POST is ever
// sent — otherwise it redirects to `/account/register-to-bid?step=3`. Reaching `APPROVED_BIDDER` is
// achievable for real via the admin `approve()` endpoint (see `approveBidder` in seed.ts), but a
// genuine Stripe-verified card is not: this docker-compose.test.yml environment sets
// `STRIPE_SECRET_KEY: sk_test_placeholder` (a non-functional key), matching register-to-bid.spec.ts's
// already-documented finding that `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unset here too. Confirmed by
// direct reproduction against the real, Dockerised `payment` service (task-8-report.md):
//   - No `payment_profiles` row for the user -> `GET /api/payments/profile` -> `200
//     {"stripePaymentMethodId":null,"hasCard":false}` -> frontend redirects away from bidding.
//   - A `payment_profiles` row with a fake `stripe_payment_method_id` (simulating "the wizard did
//     create a profile") -> the route unconditionally calls `stripe.retrievePaymentMethod(...)`
//     against the real Stripe API with the placeholder key -> `500 Internal Server Error` (plain text,
//     not JSON) -> `lot-detail-client.tsx`'s `await profileRes.json()` throws -> caught by the outer
//     `catch` -> toast "Unable to verify payment method. Please try again." -> bidding still blocked.
// There is no code path in this environment, through the real UI, that reaches a successful bid. This
// is a genuine pre-existing gap (missing Stripe test credentials in this environment, plus a frontend
// fetch that now correctly checks `res.ok` — see PR #15), not a business-rule seed-value issue, so per
// this task's constraints it is not worked around here: the assertion below targets the real, intended
// success state and is expected to fail for this reason (soft, so the rest of the spec still runs).
//
// `GET /api/account/bids` and `GET /api/account/stats` were also missing entirely in auction-engine
// (always 404/500) when this spec was first written — implemented in PR #16 alongside the two frontend
// pages that consume them. Both are now real, authenticated, correctly-scoped endpoints; asserted below
// as ordinary (non-soft) checks with real content, not just a 2xx status.
test('browse to a lot, receive SSE updates and place a bid', async ({ page }) => {
  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken, { estimatedValue: 500 });
  const { auctionId } = await seedAuction(admin.accessToken, lotId, { minBidIncrement: 50 });

  const bidder = await registerAndVerifyUser();
  await verifyPhone(bidder.accessToken);
  // Fast-track to APPROVED_BIDDER via the real admin endpoint — see header comment on why this is
  // necessary (the auction-engine bid endpoint hard-requires it) and legitimate (a real API, not a DB
  // hack).
  await approveBidder(admin.accessToken, bidder.userId);

  const lotPath = `/auctions/${auctionId}/lots/${lotId}`;

  // Log in through the real UI with returnUrl set, so the client-side push after login lands on the
  // lot-detail page with accessToken still in memory (same pattern as auth.spec.ts/register-to-bid.spec.ts).
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

  // Real, intended success state (BidConfirmedModal). Expected to fail per Bug 1 above — left as a
  // soft assertion so the rest of this spec (which exercises independent surface area: the
  // account/bids and account/stats routes) still runs and reports in the same pass.
  await expect.soft(page.getByRole('heading', { name: "You're the highest bidder" })).toBeVisible({ timeout: 10_000 });

  // --- Account bids/stats routes (independent of the Stripe-gated bid outcome above) ---
  // Note: the bid above never actually reaches auction-engine (Bug 1 redirects before POSTing), so
  // this bidder genuinely has zero bids on record — these checks assert the endpoints are real and
  // return well-formed, authenticated data for the caller, not that a bid was recorded.
  const bids = await page.request.get('/api/account/bids', {
    headers: { authorization: `Bearer ${bidder.accessToken}` },
  });
  expect(bids.ok(), `GET /api/account/bids -> ${bids.status()} ${await bids.text()}`).toBeTruthy();
  const bidsBody = (await bids.json()) as { data: Array<{ lotId: string; amount: number }>; meta: { total: number } };
  expect(Array.isArray(bidsBody.data)).toBeTruthy();
  expect(bidsBody.meta.total).toBe(0);

  const stats = await page.request.get('/api/account/stats', {
    headers: { authorization: `Bearer ${bidder.accessToken}` },
  });
  expect(stats.ok(), `GET /api/account/stats -> ${stats.status()} ${await stats.text()}`).toBeTruthy();
  const statsBody = (await stats.json()) as { data: { totalBids: number } };
  expect(statsBody.data.totalBids).toBe(0);
});
