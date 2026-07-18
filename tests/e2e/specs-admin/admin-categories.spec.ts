import { test, expect } from '../support/fixtures.admin';
import { registerAndVerifyUser, seedCategory } from '../support/seed';
import { runA11yScan } from '../support/a11y';
import { loginAsAdmin } from '../support/admin-auth';

test.describe('admin categories', () => {
  test('creates a root category through the inline form', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const name = `E2E Category ${Date.now()}`;
    const slug = `e2e-cat-${Date.now()}`;
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.getByPlaceholder('Name').fill(name);
    await page.getByPlaceholder('slug').fill(slug);
    await page.getByRole('button', { name: 'Add' }).click();

    // No toast/redirect here — the tree just re-renders. The new node
    // appearing is the only observable proof of success.
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('duplicate slug shows the generic create-failure message (field-level zod errors never reach the DOM — documented gap)', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const existing = await seedCategory(admin.accessToken);
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/categories');
    await page.getByRole('button', { name: 'New Category' }).click();
    await page.getByPlaceholder('Name').fill('Duplicate slug attempt');
    await page.getByPlaceholder('slug').fill(existing.slug);
    await page.getByRole('button', { name: 'Add' }).click();

    await expect(
      page.getByText('Could not create category — check the name and slug are valid and unique.'),
    ).toBeVisible();
  });

  test('renames a category via the inline pencil control', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    const renamedTo = `${category.name} (renamed)`;
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/categories');
    const row = page.locator('li').filter({ hasText: category.name }).first();
    // The rename trigger has no accessible name (see this task's header note)
    // — targeted by its lucide-react icon class as the only reliable hook
    // until the source gets a real aria-label.
    await row.locator('button:has(svg.lucide-pencil)').click();
    // Once editing starts, category-tree.tsx swaps the <span>{name}</span>
    // for an <input value=...>, so the name text moves into an input value
    // attribute, which is not part of an element's textContent — re-querying
    // `row` via its original `hasText: category.name` filter after this point
    // would never match again. The freshly-rendered field has `autoFocus`
    // (category-tree.tsx), so locating it via `input:focus` sidesteps the
    // stale-locator problem entirely and is exactly how a real user would
    // find where their typing lands.
    const input = page.locator('input:focus');
    await input.fill(renamedTo);
    await input.press('Enter');

    await expect(page.getByText(renamedTo, { exact: true })).toBeVisible();
  });

  test('deletes a category through the confirm dialog', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    const category = await seedCategory(admin.accessToken);
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/categories');
    const row = page.locator('li').filter({ hasText: category.name }).first();
    // lucide-react's class-naming helper (toKebabCase, createLucideIcon.js)
    // only inserts a dash at a lowercase/digit -> uppercase transition, so
    // "Trash2" (no such transition before the trailing digit) renders as
    // class `lucide-trash2`, not `lucide-trash-2` — verified against the
    // actual DOM output rather than assumed from the component name.
    await row.locator('button:has(svg.lucide-trash2)').click();

    await expect(page.getByRole('heading', { name: `Delete "${category.name}"?` })).toBeVisible();
    await expect(page.getByText('Cannot delete if lots are assigned to this category.')).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText(category.name, { exact: true })).toHaveCount(0);
  });

  // Deliberately expected to FAIL, not skipped — per this plan's Global
  // Constraints, a known pre-existing gap is asserted and surfaced, never
  // silently worked around. The category tree's four icon-only action
  // buttons (chevron, Pencil, Plus, Trash2) have no aria-label/accessible
  // name — a real axe `button-name` violation, `serious` impact. Fixing
  // category-tree.tsx is out of this plan's scope (it only adds tests around
  // the existing app); this test's job is to make that gap impossible to miss.
  test('accessibility scan documents a known gap: category-tree icon buttons have no accessible name', async ({ page }) => {
    const admin = await registerAndVerifyUser({ role: 'ADMIN' });
    await seedCategory(admin.accessToken);
    await loginAsAdmin(page, admin.email, admin.password);

    await page.goto('/admin/categories');
    await expect(runA11yScan(page)).rejects.toThrow(/button-name/);
  });
});
