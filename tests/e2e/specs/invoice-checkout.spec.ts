import { test, expect } from '../support/fixtures';
import {
  registerAndVerifyUser,
  verifyPhone,
  approveBidder,
  seedLot,
  seedAuction,
  placeBidDirect,
  closeAuctionAndAwaitInvoice,
} from '../support/seed';
import { SERVICE_URLS } from '../support/env';

// Selectors/routes verified against the real markup — apps/user-portal/src/app/account/invoices/[id]/page.tsx
// (the actual invoice-detail UI; `InvoiceDetail.tsx` in the same directory is dead code — never imported by
// page.tsx or anywhere else in the app, confirmed by grepping the whole user-portal `src` tree — see
// task-9-report.md), apps/user-portal/src/app/api/account/invoices/[id]/route.ts,
// apps/user-portal/src/app/api/payments/invoices/[id]/checkout/route.ts:
//
// - There is no admin/public "close this auction now" endpoint (confirmed by reading
//   apps/auction-engine/src/presentation/auction-router.ts in full) — an auction only closes when its
//   BullMQ `close-auction` timer job fires (apps/auction-engine/src/infrastructure/bullmq-timer-scheduler.ts,
//   `delay = max(0, endAt - now)`). This spec schedules the auction with a short `endAt` (a few seconds out)
//   so the real timer closes it during the test, rather than trying to force a close.
// - Bidding through the real UI is still blocked by the Stripe-card gate documented at length in
//   browse-and-bid.spec.ts's header comment. auction-engine's own bid endpoint
//   (`POST /api/auctions/:lotId/bids`, auction-router.ts:184) has no such gate — only
//   `verificationStatus === 'APPROVED_BIDDER'` is required — so the winning bid here is placed directly
//   against that real endpoint (`placeBidDirect` in seed.ts), the same "drive the real API, skip the blocked
//   UI step" pattern `seedLot`/`seedAuction` already use.
// - `payment`'s `auction-closed-consumer.ts` only creates an invoice when `reserveMet` — true whenever the
//   winning bid amount is >= `reservePrice`. `seedAuction`'s default `reservePrice` is `0` (unset), so any
//   positive bid clears it; no override needed.
// - The invoice-detail page's h1 is literally "Invoice" and the total row is labelled "Total due" (not
//   "Amount due" as the brief guessed) — `/invoice|amount due/i` still matches via "Invoice".
// - Two buttons on the page match a loose `/pay|checkout/i` name filter: "Pay {CUR} {amount} with saved
//   card" and "Pay by card or bank transfer" — Playwright's strict mode rejects an ambiguous locator, so
//   this spec targets the second button by its exact, real text (the one that drives
//   `POST /api/payments/invoices/:id/checkout`, i.e. the Stripe Checkout redirect path this task covers).
// - Reaching the invoice-detail page with the client-side `accessToken` intact after login requires the same
//   `returnUrl` pattern used by every other authenticated spec in this suite (auth.spec.ts,
//   register-to-bid.spec.ts, browse-and-bid.spec.ts) — a plain `page.goto()` after login arrives logged-out.
test('view a won-lot invoice and start Stripe checkout', async ({ page }) => {
  const admin = await registerAndVerifyUser({ role: 'ADMIN' });
  const { lotId } = await seedLot(admin.accessToken, { estimatedValue: 500 });

  const winner = await registerAndVerifyUser();
  await verifyPhone(winner.accessToken);
  await approveBidder(admin.accessToken, winner.userId);
  // approveBidder updates verificationStatus server-side, but the JWT issued at registration/login
  // above was minted before that change and still carries the old status. auction-engine's bid
  // endpoint reads verificationStatus straight from the JWT claim (auction-router.ts:186), so a fresh
  // login is required to pick up APPROVED_BIDDER — otherwise placeBidDirect below 403s with
  // "Phone verification required to bid" even though the user is, in fact, approved.
  const winnerLoginRes = await fetch(`${SERVICE_URLS.userAuth}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: winner.email, password: winner.password, turnstileToken: 'e2e-test-token' }),
  });
  const winnerLoginBody = (await winnerLoginRes.json()) as { data: { accessToken: string } };
  const winnerBidToken = winnerLoginBody.data.accessToken;

  // Schedule with a short endAt so the real BullMQ close-auction timer fires during this test, rather
  // than waiting up to an hour (seedAuction's default window).
  // autoExtendWindowMinutes must be 0: the domain's anti-sniping rule extends endAt by
  // autoExtendDurationMinutes whenever a bid lands within autoExtendWindowMinutes of the current endAt
  // (auction-aggregate.ts's placeBid, `TimerExtended`) — the default 5-minute window would otherwise
  // engulf this whole short-endAt test auction (any bid is "close to closing") and push the real close
  // job 5 more minutes into the future every time, which is exactly what happened on first attempt here
  // (confirmed via GET /api/auctions/:lotId showing status stuck at CLOSING well past the original endAt).
  const now = Date.now();
  await seedAuction(admin.accessToken, lotId, {
    startAt: new Date(now).toISOString(),
    endAt: new Date(now + 8_000).toISOString(),
    autoExtendWindowMinutes: 0,
    autoExtendDurationMinutes: 0,
  });

  // Winning bid placed directly against auction-engine's real bid API — see header comment on why the
  // portal UI cannot be used for this in this environment.
  await placeBidDirect(winnerBidToken, lotId, 1_000);

  const { invoiceId } = await closeAuctionAndAwaitInvoice(admin.accessToken, lotId, winner.userId);

  await page.goto(`/account/login?returnUrl=${encodeURIComponent(`/account/invoices/${invoiceId}`)}`);
  await page.locator('input[type="email"]').fill(winner.email);
  await page.locator('input[type="password"]').fill(winner.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/account/invoices/${invoiceId}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // AccountShell's nav also contains an "Invoices & Payments" link, so a loose /invoice/i text locator
  // is ambiguous (Playwright strict mode) — target the page's own h1 specifically.
  await expect(page.getByRole('heading', { name: 'Invoice', exact: true })).toBeVisible();
  await expect(page.getByText('AUD 1,000', { exact: true })).toBeVisible();

  const [checkoutRequest] = await Promise.all([
    page.waitForRequest((r) => r.url().includes('/api/payments/invoices/') && r.url().includes('/checkout')),
    page.getByRole('button', { name: 'Pay by card or bank transfer' }).click(),
  ]);
  expect(checkoutRequest).toBeTruthy();

  // Never complete a real Stripe payment. If a live checkout session was created, the page navigates to
  // checkout.stripe.com and this assertion stops there; if session creation itself failed (this
  // environment's STRIPE_SECRET_KEY is a non-functional placeholder — see browse-and-bid.spec.ts's Bug 1
  // for the same root cause on a different endpoint), the page stays on /account/invoices/ instead. Either
  // way, the redirect *attempt* — the real POST to the checkout endpoint asserted above — is what this
  // spec covers; it never proceeds to an actual Stripe payment.
  await expect(page).toHaveURL(/checkout\.stripe\.com|\/account\/invoices\//);
});
