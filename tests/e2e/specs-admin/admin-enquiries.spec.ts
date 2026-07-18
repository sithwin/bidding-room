import { test, expect } from '../support/fixtures.admin';
import { registerAndVerifyUser, seedValuationEnquiry } from '../support/seed';
import { runA11yScan } from '../support/a11y';
import { loginAsAdmin } from '../support/admin-auth';

test.describe('admin enquiries', () => {
  test('lists a real submitted enquiry and marks it Responded then Closed', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const enquiry = await seedValuationEnquiry();
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/enquiries');
    await expect(page.getByRole('heading', { name: 'Valuation Enquiries' })).toBeVisible();
    // Neither the "Mark Responded" nor "Close" buttons use the destructive
    // Button variant (apps/admin-portal/src/app/admin/enquiries/_table.tsx
    // uses `variant='outline'` for both), unlike the invoices/users pages'
    // documented WCAG AA color-contrast gap — this scan is expected to pass
    // cleanly.
    await runA11yScan(page);
    const row = page.getByRole('row').filter({ hasText: enquiry.email });
    await expect(row).toBeVisible();
    await expect(row.getByText('Jewellery')).toBeVisible();

    await row.getByRole('button', { name: 'Mark Responded' }).click();
    await expect(page.getByRole('row').filter({ hasText: enquiry.email }).getByText('RESPONDED')).toBeVisible();

    await page.getByRole('row').filter({ hasText: enquiry.email }).getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('row').filter({ hasText: enquiry.email }).getByText('CLOSED')).toBeVisible();
  });
});
