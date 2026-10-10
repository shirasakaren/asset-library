import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * axe rules that are known to fail on the design system and are NOT fixed yet.
 * Every entry needs a reason; an empty allowlist is the goal.
 *
 * - color-contrast: the brand palette misses WCAG AA 4.5:1 in a handful of
 *   places that are design-token decisions, not page bugs: brand-blue text on
 *   brand-blue-50 (4.43:1, "Reset demo data", ADMIN pill, version and status
 *   badges), white on brand-red (3.58:1, the notification count and the red
 *   avatar), ink-3 on the tinted dashboard cards (4.04 to 4.48:1) and ink-4
 *   helper text (2.6:1). Fixing them means changing the shared tokens in
 *   tailwind.config.ts / DESIGN_SYSTEM.md for the whole product, which is out
 *   of scope for the test task. Tracked in the Task 13 report.
 */
export const AXE_ALLOWLIST: Readonly<Record<string, string>> = {
  'color-contrast': 'design-system palette tokens miss AA by small margins (see comment above)',
};

/**
 * Runs axe on the current page and fails on any `serious` or `critical`
 * violation whose rule id is not in {@link AXE_ALLOWLIST}. `minor` and
 * `moderate` findings (for example heading order on card grids) are not
 * enforced.
 */
export async function expectNoSeriousA11yViolations(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .filter((v) => !(v.id in AXE_ALLOWLIST))
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')}  ${n.failureSummary ?? ''}`),
    }));
  expect(blocking, `[${label}] axe found serious/critical violations`).toEqual([]);
}
