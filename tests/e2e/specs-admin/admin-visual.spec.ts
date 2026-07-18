import { test, expect } from '../support/fixtures.admin';
import {
  registerAndVerifyUser,
  seedCategory,
  seedLot,
  seedAuction,
  approveBidder,
  placeBidDirect,
  closeAuctionAndAwaitInvoice,
  seedFulfilmentForUser,
  chooseCollectMethod,
  seedValuationEnquiry,
} from '../support/seed';
import { SERVICE_URLS } from '../support/env';

/**
 * `approveBidder` mutates `verificationStatus` server-side but the caller's
 * `accessToken` was minted before that change and still carries the old
 * claim — auction-engine's bid endpoint reads `verificationStatus` straight
 * off the JWT (auction-router.ts:197), not a fresh DB lookup, so it 403s
 * ("Phone verification required to bid") until the user logs in again. Same
 * gotcha every other seeding chain in this suite documents (see
 * admin-invoices.spec.ts, admin-auctions.spec.ts); the brief's draft for
 * this spec omitted it and 403'd on first run.
 */
async function reloginForFreshToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${SERVICE_URLS.userAuth}/api/users/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, turnstileToken: 'e2e-test-token' }),
  });
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

test.describe('admin visual regression @visual', () => {
  test('every admin page renders a stable layout', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const { lotId } = await seedLot(admin.accessToken, { categoryId: category.categoryId, estimatedValue: 500 });

    const bidder = await registerAndVerifyUser({ role: 'BIDDER' });
    await approveBidder(admin.accessToken, bidder.userId);
    const now = Date.now();
    await seedAuction(admin.accessToken, lotId, {
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    const bidderToken = await reloginForFreshToken(bidder.email, bidder.password);
    await placeBidDirect(bidderToken, lotId, 550);

    const buyer = await registerAndVerifyUser();
    const { fulfilmentId } = await seedFulfilmentForUser(buyer);
    await chooseCollectMethod(buyer.accessToken, fulfilmentId, {
      location: 'Mayfair Showroom',
      date: '2030-01-15',
      timeSlot: '10:00-12:00',
    });

    await seedValuationEnquiry();

    // Second lot/auction/close cycle purely to get a real invoice id for the
    // invoice-detail screenshot — reuses the same short-auction pattern as
    // Task 11/14. Uses a fresh timestamp rather than the outer `now`: by this
    // point `seedFulfilmentForUser`'s poll-heavy chain (closeAuctionAndAwaitInvoice,
    // the webhook, awaitFulfilmentForLotAndUser) has already burned well past
    // the 8s window, so reusing `now` schedules an auction whose `endAt` is
    // already in the past and 409s with AUCTION_NOT_ACTIVE on the very first
    // bid attempt — confirmed by running the brief's original draft.
    const { lotId: invoiceLotId } = await seedLot(admin.accessToken, { categoryId: category.categoryId, estimatedValue: 300 });
    const invoiceWinner = await registerAndVerifyUser();
    await approveBidder(admin.accessToken, invoiceWinner.userId);
    const invoiceAuctionStart = Date.now();
    await seedAuction(admin.accessToken, invoiceLotId, {
      startAt: new Date(invoiceAuctionStart).toISOString(),
      endAt: new Date(invoiceAuctionStart + 8_000).toISOString(),
      autoExtendWindowMinutes: 0,
      autoExtendDurationMinutes: 0,
    });
    const invoiceWinnerToken = await reloginForFreshToken(invoiceWinner.email, invoiceWinner.password);
    await placeBidDirect(invoiceWinnerToken, invoiceLotId, 350);
    const { invoiceId } = await closeAuctionAndAwaitInvoice(admin.accessToken, invoiceLotId, invoiceWinner.userId);

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    const screenshotOptions = {
      animations: 'disabled' as const,
      maxDiffPixelRatio: 0.01,
      // Masks every relative/absolute date-like cell (table `td`s and
      // detail-page `dd`s render via `toLocaleDateString`/`toLocaleString`,
      // which always contain '/') and the live-poll stats. Verified against
      // the real page components (apps/admin-portal/src/app/admin/**) before
      // writing this list, not assumed:
      //  - auction-detail's `AuctionLiveStats` (SWR, refreshInterval 5000)
      //    renders a "Time Remaining" card as plain `<p>Xm</p>` text (no
      //    '/', so the td/dd masks miss it) computed from
      //    `Date.now()` at render time — genuinely non-deterministic
      //    between the baseline run and any later run, masked by regex.
      //  - reports page's Auction Results tab defaults its `From`/`To`
      //    `<input type="date">` fields to `today`/`30 days ago`, which
      //    drifts day-to-day versus a committed baseline.
      //  - every seeded lot/category/enquirer title and email embeds
      //    `uniqueSuffix()` (`${process.pid}-${counter}`, support/env.ts) so
      //    it is a *different* string on every single run — confirmed by an
      //    actual local re-run against a freshly rebuilt DB (not just a
      //    theoretical concern): the lots-list, categories, users-list,
      //    invoices-list and reports "Winner"/"Lot" columns, and every
      //    detail-page `<h1>` that falls back to the seeded title, all
      //    diffed on nothing but that text. Masked by the two literal
      //    prefixes/patterns the seed helpers always use
      //    (`E2E ...` — seedCategory/seedLot/seedValuationEnquiry — and
      //    `@carat-test.internal` — registerAndVerifyUser), rather than
      //    switching every seed call to a fixed literal, which would
      //    reintroduce the unique-email/slug collisions `uniqueSuffix` exists
      //    to prevent.
      mask: [
        page.locator('td:has-text("/")'),
        page.locator('dd:has-text("/")'),
        page.locator('p').filter({ hasText: /^\d+m$/ }),
        page.locator('input[type="date"]'),
        page.getByText(/E2E /),
        page.getByText(/@carat-test\.internal/),
      ],
    };

    const pages: Array<{ name: string; path: string }> = [
      { name: 'dashboard', path: '/admin/dashboard' },
      { name: 'lots-list', path: '/admin/lots' },
      { name: 'lots-new', path: '/admin/lots/new' },
      { name: 'lot-detail', path: `/admin/lots/${lotId}` },
      { name: 'categories', path: '/admin/categories' },
      { name: 'auctions-list', path: '/admin/auctions' },
      { name: 'auctions-new', path: '/admin/auctions/new' },
      { name: 'auction-detail', path: `/admin/auctions/${lotId}` },
      { name: 'users-list', path: '/admin/users' },
      { name: 'users-new', path: '/admin/users/new' },
      { name: 'user-detail', path: `/admin/users/${bidder.userId}` },
      { name: 'invoices-list', path: '/admin/invoices' },
      { name: 'invoice-detail', path: `/admin/invoices/${invoiceId}` },
      { name: 'fulfilments-list', path: '/admin/fulfilments' },
      { name: 'fulfilment-detail', path: `/admin/fulfilments/${fulfilmentId}` },
      { name: 'enquiries', path: '/admin/enquiries' },
      { name: 'reports', path: '/admin/reports' },
    ];

    for (const { name, path } of pages) {
      await test.step(name, async () => {
        await page.goto(path);
        await expect(page.locator('main')).toHaveScreenshot(`${name}.png`, screenshotOptions);
      });
    }
  });
});
