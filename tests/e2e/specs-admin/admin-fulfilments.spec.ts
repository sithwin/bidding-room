import { test, expect } from '../support/fixtures.admin';
import {
  registerAndVerifyUser,
  seedFulfilmentForUser,
  chooseShipMethod,
  chooseCollectMethod,
} from '../support/seed';
import { runA11yScan } from '../support/a11y';

async function loginAsAdmin(page: import('@playwright/test').Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}

test.describe('admin fulfilments', () => {
  test('lists a fulfilment and marks a collection as collected', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const buyer = await registerAndVerifyUser();
    const { fulfilmentId } = await seedFulfilmentForUser(buyer);
    await chooseCollectMethod(buyer.accessToken, fulfilmentId, {
      location: 'Mayfair Showroom',
      date: '2030-01-15',
      timeSlot: '10:00-12:00',
    });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/fulfilments');
    await expect(page.getByText('PENDING_DISPATCH')).toBeVisible();

    await page.goto(`/admin/fulfilments/${fulfilmentId}`);
    await runA11yScan(page);
    await expect(page.getByText('Mayfair Showroom')).toBeVisible();
    await page.getByRole('button', { name: 'Mark Collected' }).click();

    await expect(page.getByText('COLLECTED')).toBeVisible();
  });

  test('marks a shipment as dispatched with carrier and tracking number', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const buyer = await registerAndVerifyUser();
    const { fulfilmentId } = await seedFulfilmentForUser(buyer);
    await chooseShipMethod(buyer.accessToken, fulfilmentId, {
      fullName: 'E2E Test Buyer',
      line1: '1 Test Street',
      city: 'London',
      postcode: 'SW1A 1AA',
      country: 'GB',
    });
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto(`/admin/fulfilments/${fulfilmentId}`);
    await expect(page.getByText('1 Test Street')).toBeVisible();
    await page.getByLabel('Carrier').fill('DHL');
    await page.getByLabel('Tracking Number').fill('TRK123456789');
    await page.getByRole('button', { name: 'Mark Dispatched' }).click();

    // Same silently-swallowed-return-value pattern as the invoice extend
    // form (Task 11) — assert the real effect via a fresh navigation.
    await page.goto(`/admin/fulfilments/${fulfilmentId}`);
    await expect(page.getByText('DISPATCHED')).toBeVisible();
  });
});
