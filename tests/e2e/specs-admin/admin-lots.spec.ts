import { test, expect } from '../support/fixtures.admin';
import { registerAndVerifyUser, seedCategory, seedAuction, seedLot } from '../support/seed';
import { runA11yScan } from '../support/a11y';
import { SERVICE_URLS } from '../support/env';

async function loginAsAdmin(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

/**
 * A freshly `seedAuction`-scheduled lot's `start-auction` BullMQ job (delay
 * 0, but still processed asynchronously by the worker) may not have
 * transitioned the lot from SCHEDULED to LIVE yet immediately after seeding
 * — same race `placeBidDirect` in support/seed.ts already documents and
 * retries around. The admin lots edit page reads this status via a live
 * lookup to auction-engine (`GET /api/auctions/:lotId`), so this test must
 * wait for it to actually report LIVE before navigating, or the "is this
 * lot's auction live" check on the edit page will see SCHEDULED and skip
 * the confirmation dialog entirely.
 */
async function waitForAuctionLive(lotId: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${SERVICE_URLS.auction}/api/auctions/${lotId}`);
    if (res.ok) {
      const body = (await res.json()) as { data: { status: string } };
      if (body.data.status === 'LIVE') {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Auction for lot ${lotId} did not become LIVE within ${timeoutMs}ms`);
}

test.describe('admin lots', () => {
  test('creating a lot with missing required fields shows field errors, not a crash', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/lots/new');
    await runA11yScan(page);
    await page.getByRole('button', { name: 'Create Lot' }).click();

    await expect(page.getByText('Title is required')).toBeVisible();
    await expect(page.getByText('Description is required')).toBeVisible();
    // 'Select a category' also appears as the combobox's own placeholder
    // text, so scope to the field-error paragraph it renders in to avoid a
    // strict-mode ambiguity between the two matches.
    await expect(page.getByRole('paragraph').filter({ hasText: 'Select a category' })).toBeVisible();
  });

  test('creates a lot through the real form and it appears in the list', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const lotTitle = `E2E UI Lot ${Date.now()}`;
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/lots/new');
    await page.getByLabel('Title').fill(lotTitle);
    await page.getByLabel('Description').fill('A fine example lot, created end-to-end.');
    await page.getByRole('combobox', { name: 'Category' }).click();
    await page.getByRole('option', { name: category.name }).click();
    await page.getByRole('combobox', { name: 'Condition' }).click();
    await page.getByRole('option', { name: 'EXCELLENT' }).click();
    await page.getByLabel('Estimated Value').fill('750');
    await page.getByRole('button', { name: 'Create Lot' }).click();

    // No success message exists in this UI — router.push('/admin/lots') on
    // success is the only observable signal, so the proof of success is the
    // new lot actually showing up in the resulting list.
    await expect(page).toHaveURL(/\/admin\/lots$/);
    await expect(page.getByRole('cell', { name: lotTitle })).toBeVisible();
  });

  test('edits a lot and the change is reflected back in the list', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    // description is required, not optional: the edit form's Zod schema
    // (LotFormSchema) validates every field on every submit, not just the
    // one being changed, so a lot seeded without one fails client-side
    // validation and never navigates away.
    const { lotId } = await seedLot(admin.accessToken, {
      categoryId: category.categoryId,
      description: 'A lot seeded for the edit spec.',
      estimatedValue: 200,
    });
    const updatedTitle = `E2E Edited Lot ${Date.now()}`;
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/lots/${lotId}`);
    await runA11yScan(page);
    await page.getByLabel('Title').fill(updatedTitle);
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page).toHaveURL(/\/admin\/lots$/);
    await expect(page.getByRole('cell', { name: updatedTitle })).toBeVisible();
  });

  test('editing a lot with a LIVE auction requires confirming through the AlertDialog', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    // description is required by the edit form's schema — see the same note
    // in the previous test.
    const { lotId } = await seedLot(admin.accessToken, {
      categoryId: category.categoryId,
      description: 'A lot seeded for the live-auction edit spec.',
      estimatedValue: 300,
    });
    const now = Date.now();
    // Started now, ends far in the future, so the lot is LIVE by the time the spec navigates to it.
    await seedAuction(admin.accessToken, lotId, {
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + 60 * 60 * 1000).toISOString(),
    });
    await waitForAuctionLive(lotId);
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/lots/${lotId}`);
    await page.getByLabel('Estimated Value').fill('350');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByRole('heading', { name: "This lot's auction is currently live" })).toBeVisible();
    await expect(page.getByText('Bidders are actively bidding on this lot right now. Save changes anyway?')).toBeVisible();
    await page.getByRole('button', { name: 'Save Anyway' }).click();

    await expect(page).toHaveURL(/\/admin\/lots$/);
  });
});
