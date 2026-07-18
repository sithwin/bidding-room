import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Logs the given admin-portal page in via the `/admin/login` form and waits
 * for the post-login redirect to the dashboard. Shared across `specs-admin/*`
 * so a login-flow change (button label, redirect URL, wait condition) is a
 * single edit instead of 8+ synchronized ones.
 */
export async function loginAsAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}
