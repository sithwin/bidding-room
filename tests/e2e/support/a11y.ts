import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Scans the current page's main content region and fails the test only on
 * serious/critical violations — moderate/minor are logged, not failed on, so
 * the suite doesn't drown in pre-existing minor issues on day one (per the
 * approved design's Section 5, layer 2). Excludes the shared sidebar/header
 * chrome (scoped to `main`) so nav markup isn't re-scanned on every page.
 */
export async function runA11yScan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).include('main').analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const nonBlocking = results.violations.filter(
    (violation) => violation.impact !== 'serious' && violation.impact !== 'critical',
  );
  for (const violation of nonBlocking) {
    console.warn(`[a11y] ${violation.impact ?? 'unknown'}: ${violation.id} — ${violation.description}`);
  }
  expect(
    blocking,
    `Accessibility violations (serious/critical):\n${blocking
      .map((v) => `- ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
      .join('\n')}`,
  ).toEqual([]);
}
