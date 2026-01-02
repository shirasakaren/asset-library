# MGM Laboratory — Design System

## 1. Brand Philosophy

MGM Laboratory's visual identity is **playful, geometric, primary-colored, and human**. The reference posters use a Bauhaus vocabulary — circles, X's, plus signs, triangles, leaves, half-discs — packed densely on white.

Our **digital expression** of that identity is *not* a recreation of the dense pattern. It is a **calm, premium product surface** that *quotes* the pattern as a signature — in a corner, in a divider, in a 404 page, in the favicon — the way Apple uses its silhouette product shots, or Framer uses its grain and gradient. The pattern is **the spice, not the meal**.

If you need logo, it's available in lovo.svg ("D:\MGM\Code\Internal Service\mgm-asset-library\mgm-asset-library-frontend\logo.svg"). If you need to generate any patterns, select randomly from ("D:\MGM\Code\Internal Service\mgm-asset-library\mgm-asset-library-frontend\patterns"), the patterns can be configured and place however you like (for exmaple 3x3, or 4x2).

---

## 2. Color System

### 2.1 Tokens

```css
:root {
  /* Surfaces */
  --bg:               #ffffff;   /* page background — almost always this */
  --surface:          #ffffff;   /* card / panel surface */
  --surface-muted:    #f7f7f5;   /* very subtle off-white for zoning */
  --surface-inverse:  #0e1116;   /* near-black for inverted sections */

  /* Brand */
  --brand-blue:       #3a6dc5;   /* primary action, links */
  --brand-yellow:     #f7bf33;   /* highlight, attention, warmth */
  --brand-red:        #f94141;   /* emphasis, energy, error */
  --brand-green:      #0f8657;   /* success, positive states */

  /* Tints (for backgrounds / chips / hover) — 8% of the brand color over white */
  --brand-blue-50:    #ecf1fa;
  --brand-yellow-50:  #fef6e0;
  --brand-red-50:     #fee5e5;
  --brand-green-50:   #e2f1ea;

  /* Text */
  --ink:              #0e1116;   /* primary text */
  --ink-2:            #3b4150;   /* secondary text */
  --ink-3:            #6b7280;   /* tertiary, captions, helper text */
  --ink-4:            #9aa1ad;   /* disabled, faint */

  /* Lines */
  --line:             #ececea;   /* default hairline border */
  --line-strong:      #d8d8d2;   /* stronger divider */

  /* Focus ring */
  --focus:            #3a6dc5;

  /* Shadows (rare, soft, never dramatic) */
  --shadow-1: 0 1px 2px rgba(14, 17, 22, 0.04), 0 1px 1px rgba(14, 17, 22, 0.03);
  --shadow-2: 0 6px 24px -8px rgba(14, 17, 22, 0.10), 0 2px 6px -2px rgba(14, 17, 22, 0.05);
  --shadow-3: 0 24px 60px -20px rgba(14, 17, 22, 0.18), 0 4px 12px -4px rgba(14, 17, 22, 0.06);
}
```

### 2.2 Inverse sections

For high-contrast dark sections (testimonials, dramatic stats, big quote breaks), use `--surface-inverse` (#0e1116) as the background. White text. The leading brand color stays the same. Use these *sparingly* — at most once per long page.

### 2.3 Contrast & accessibility

* Body text on white must use `--ink` (#0e1116) or `--ink-2` (#3b4150). `--ink-3` is for ≥14px helper text only. `--ink-4` is decoration / disabled, not for content.
* `--brand-blue` (#3a6dc5) on white passes AA for normal text. ✅
* `--brand-green` (#0f8657) on white passes AA. ✅
* `--brand-red` (#f94141) on white **only passes AA Large** — use it for ≥18px or ≥14px bold, or as a fill behind white text, never for body copy.
* `--brand-yellow` (#f7bf33) **never carries text on white.** Use yellow only as a fill, with `--ink` text on top.

### 2.4 Color don'ts

* No purple, no teal, no pink, no orange. The palette is closed.
* No gradients between brand colors. No tie-dye. No mesh gradients.
* No tinted page backgrounds. The page background is white. Always.
* No drop shadows on colored fills (a yellow chip with a yellow shadow is forbidden).

---

## 3. Typography

### 3.1 Families

We pair a **characterful display face** with a **clean, modern UI face**. Both are free, variable, and load fast.

```css
:root {
  --font-display: "Bricolage Grotesque", "Söhne", ui-sans-serif, system-ui, sans-serif;
  --font-sans:    "Geist", "DM Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono:    "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
}
```
