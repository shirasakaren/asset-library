import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * axe checks for the key pages.
 *
 * - Every rule is on. A `serious` or `critical` violation of any rule other
 *   than `color-contrast` fails the test outright. `moderate` and `minor`
 *   findings (for example heading order on card grids) are not enforced.
 * - `color-contrast` is checked against a committed per-page baseline,
 *   `a11y-contrast-baseline.json`. The baseline lists the nodes that fail WCAG
 *   AA today because of the design tokens (see the README). The test fails when
 *   a NEW failing node appears, and also when a baseline node no longer fails,
 *   so the baseline can only shrink as the tokens get fixed.
 *
 * To regenerate the baseline after an intentional change (single worker, so the
 * file is not written concurrently):
 *
 *   A11Y_UPDATE_BASELINE=1 pnpm exec playwright test 09-a11y --workers=1
 */
const BASELINE_FILE = join(__dirname, '..', 'a11y-contrast-baseline.json');
const UPDATE = !!process.env.A11Y_UPDATE_BASELINE;

interface BaselineEntry {
  /** axe selector of the failing node (dynamic ids stripped). */
  target: string;
  /** Foreground / background / ratio axe measured when the baseline was written. */
  contrast: string;
}
interface BaselinePage {
  reason: string;
  entries: BaselineEntry[];
}
type Baseline = Record<string, BaselinePage>;

const REASON =
  'Design-token contrast failures (brand-blue on brand-blue-50 4.43:1, white on brand-red 3.58:1, ink-3 on the tinted dashboard cards 4.04-4.48:1, ink-4 helper text 2.6:1, lighter brand-blue 3.74:1). To be fixed in the tokens by the design owner, then removed from this file.';

function readBaseline(): Baseline {
  return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as Baseline;
}

/** Radix generates ids such as `radix-:r4:-trigger-ALL`; they change between renders. */
const normalizeTarget = (target: unknown[]): string =>
  target
    .map(String)
    .join(' ')
    .replace(/#radix-(?:\\:|:)[^\s>.[]+/g, '#radix-*');

export async function expectAccessible(page: Page, key: string): Promise<void> {
  // Mid-transition opacity changes computed colours; freeze animations and wait for fonts.
  await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important;animation:none!important}',
  });
  await page.evaluate(() => document.fonts.ready);

  const results = await new AxeBuilder({ page }).analyze();

  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => `${n.target.join(' ')}  ${n.failureSummary ?? ''}`),
    }));
  expect(blocking, `[${key}] axe found serious/critical violations`).toEqual([]);

  const found = new Map<string, string>();
  for (const v of results.violations.filter((x) => x.id === 'color-contrast')) {
    for (const n of v.nodes) {
      const data = (n.any[0]?.data ?? {}) as {
        fgColor?: string;
        bgColor?: string;
        contrastRatio?: number;
      };
      found.set(
        normalizeTarget(n.target),
        `${data.fgColor ?? '?'} on ${data.bgColor ?? '?'} = ${data.contrastRatio ?? '?'}:1`,
      );
    }
  }

  if (UPDATE) {
    const baseline = readBaseline();
    baseline[key] = {
      reason: baseline[key]?.reason ?? REASON,
      entries: [...found].map(([target, contrast]) => ({ target, contrast })),
    };
    writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`);
    return;
  }

  const known = new Set((readBaseline()[key]?.entries ?? []).map((e) => e.target));
  const added = [...found].filter(([t]) => !known.has(t)).map(([t, c]) => `${t}  (${c})`);
  const gone = [...known].filter((t) => !found.has(t));

  expect(
    added,
    `[${key}] NEW colour-contrast failures (not in tests/e2e/a11y-contrast-baseline.json). Fix the colours; do not add to the baseline.`,
  ).toEqual([]);
  expect(
    gone,
    `[${key}] these baseline entries no longer fail contrast: great, delete them from tests/e2e/a11y-contrast-baseline.json (or run with A11Y_UPDATE_BASELINE=1)`,
  ).toEqual([]);
}
