import { test, expect } from '../support/fixtures.admin';
import {
  registerAndVerifyUser,
  seedCategory,
  seedLot,
  seedAuction,
  approveBidder,
  placeBidDirect,
} from '../support/seed';
import { runA11yScan } from '../support/a11y';
import { SERVICE_URLS } from '../support/env';
import { loginAsAdmin } from '../support/admin-auth';

test.describe('admin auctions', () => {
  test('schedule form rejects an end date before the start date', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const { lotId } = await seedLot(admin.accessToken, { categoryId: category.categoryId, estimatedValue: 400 });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/auctions/new?lotId=${lotId}`);
    await runA11yScan(page);

    await page.locator('#startAt').fill('2030-01-02T10:00');
    await page.locator('#endAt').fill('2030-01-01T10:00');
    await page.getByRole('button', { name: 'Schedule Auction' }).click();

    await expect(page.getByText('End date must be after start date')).toBeVisible();
  });

  test('schedules a real auction and it appears in the auctions list', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const lotTitle = `E2E Auction Lot ${Date.now()}`;
    const { lotId } = await seedLot(admin.accessToken, {
      title: lotTitle,
      categoryId: category.categoryId,
      estimatedValue: 500,
    });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/auctions/new?lotId=${lotId}`);
    const start = new Date(Date.now() + 60_000);
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await page.locator('#startAt').fill(toLocalDateTimeInputValue(start));
    await page.locator('#endAt').fill(toLocalDateTimeInputValue(end));
    await page.getByRole('button', { name: 'Schedule Auction' }).click();

    await expect(page).toHaveURL(/\/admin\/auctions$/);
    await expect(page.getByRole('cell', { name: lotTitle })).toBeVisible();
  });

  test('views a live auction detail page with real bid history', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const bidder = await registerAndVerifyUser({ role: 'BIDDER' });
    await approveBidder(admin.accessToken, bidder.userId);
    // approveBidder updates verificationStatus server-side, but the JWT issued at
    // registration/login above was minted before that change and still carries the old status.
    // auction-engine's bid endpoint reads verificationStatus straight from the JWT claim
    // (auction-router.ts:186), so a fresh login is required to pick up APPROVED_BIDDER —
    // otherwise placeBidDirect below 403s with "Phone verification required to bid" even though
    // the user is, in fact, approved (same gotcha invoice-checkout.spec.ts documents).
    const bidderLoginRes = await fetch(`${SERVICE_URLS.userAuth}/api/users/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: bidder.email, password: bidder.password, turnstileToken: 'e2e-test-token' }),
    });
    const bidderLoginBody = (await bidderLoginRes.json()) as { data: { accessToken: string } };
    const bidderToken = bidderLoginBody.data.accessToken;
    const category = await seedCategory(admin.accessToken);
    const { lotId } = await seedLot(admin.accessToken, { categoryId: category.categoryId, estimatedValue: 600 });
    const now = Date.now();
    await seedAuction(admin.accessToken, lotId, {
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    await placeBidDirect(bidderToken, lotId, 650);
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/auctions/${lotId}`);
    await expect(page.getByText('LIVE')).toBeVisible();
    // '£650' appears twice: the live-stats summary card and the bid-history
    // table row below it — scope to the summary paragraph to avoid a
    // strict-mode ambiguity between the two matches.
    await expect(page.getByRole('paragraph').filter({ hasText: '£650' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bid History' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '£650' })).toBeVisible();
  });

  test('cancels a scheduled auction through the confirm dialog', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const lotTitle = `E2E Cancel Auction Lot ${Date.now()}`;
    const { lotId } = await seedLot(admin.accessToken, {
      title: lotTitle,
      categoryId: category.categoryId,
      estimatedValue: 200,
    });
    const now = Date.now();
    await seedAuction(admin.accessToken, lotId, {
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/auctions');
    const row = page.getByRole('row').filter({ hasText: lotTitle });
    await row.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'Cancel auction?' })).toBeVisible();
    await expect(page.getByText('This will end the auction immediately. All bids will be void.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel Auction' }).click();

    await expect(row).toHaveCount(0);
  });
});

/** `<input type="datetime-local">` needs `YYYY-MM-DDTHH:mm`, local time, no seconds/timezone. */
function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
