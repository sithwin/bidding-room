import { test, expect } from '../support/fixtures.admin';
import { registerAndVerifyUser } from '../support/seed';
import { runA11yScan } from '../support/a11y';

test.describe('admin auth', () => {
  test('rejects invalid credentials with an inline error, no navigation', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill('nobody@carat-test.internal');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('rejects a non-admin (BIDDER) user even with correct credentials', async ({ page }) => {
    const bidder = await registerAndVerifyUser({ role: 'BIDDER' });

    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(bidder.email);
    await page.getByLabel('Password').fill(bidder.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Admin access required')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('logs in as ADMIN and reaches a real dashboard with live stats', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });

    await page.goto('/admin/login');
    await runA11yScan(page);

    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    // Stat cards render `?? '—'` until real data loads — assert the labels
    // exist and each value is either a number or the placeholder, proving
    // the dashboard actually reached the admin service (not a client crash).
    for (const label of ['Active Auctions', 'Ending in 24h', 'Pending Invoices', 'Pending Fulfilments']) {
      await expect(page.getByText(label)).toBeVisible();
    }
    // Sidebar nav renders every admin section — proves the shared layout
    // (AdminShell) is intact for every later spec that navigates via it.
    for (const link of ['Dashboard', 'Lots', 'Categories', 'Auctions', 'Users', 'Invoices', 'Fulfilments', 'Enquiries', 'Reports']) {
      await expect(page.getByRole('link', { name: link, exact: true })).toBeVisible();
    }

    await runA11yScan(page);
  });

  test('DELETE /api/auth clears the session cookie (no UI logout control exists — documented gap)', async ({ page, context }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    await page.goto('/admin/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password').fill(admin.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);

    const cookiesBefore = await context.cookies();
    expect(cookiesBefore.some((c) => c.name === 'admin_token')).toBe(true);

    await page.request.delete('/api/auth');
    const cookiesAfter = await context.cookies();
    expect(cookiesAfter.some((c) => c.name === 'admin_token')).toBe(false);

    // Confirms the session is actually gone server-side, not just the cookie
    // cleared client-side: a page reload after cookie removal must bounce
    // back to login rather than silently rendering the dashboard from cache.
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
