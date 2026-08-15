import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Standard axe pass for every spec. Fails the test on any serious/critical
 * violations. Less-severe violations are reported via the run summary but
 * don't fail the spec.
 */
export async function checkA11y(page: Page, label = 'a11y') {
  const results = await new AxeBuilder({ page })
    .disableRules(['color-contrast'])
    // color-contrast hits false positives on Tailwind utility classes that
    // resolve through CSS variables; we audit those manually against the DS.
    .analyze();

  const critical = results.violations.filter((v) =>
    ['serious', 'critical'].includes(v.impact ?? ''),
  );
  if (critical.length > 0) {
    // Detailed dump on failure
    console.error(`[${label}] axe violations`, JSON.stringify(critical, null, 2));
  }
  expect(critical, `[${label}] axe found serious/critical violations`).toEqual([]);
}
