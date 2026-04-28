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

Load from Google Fonts / Vercel:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Geist:wght@300..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet" />
```

* **Bricolage Grotesque** — display, headlines, hero, and short editorial moments. Set tight (-2% to -3% tracking) at large sizes for an Apple-keynote feel. Weight 600 for hero, 500 for section headings.
* **Geist** — everything else. Body, UI, labels, captions, navigation, buttons. Weight 400 default, 500 for buttons / labels, 600 for emphasis.
* **Geist Mono** — code blocks, version numbers, technical numerals only.

> ⚠️ Do **not** use Inter, Roboto, Arial, Helvetica, Poppins, Montserrat, or system-default UI fonts. They flatten the brand.

### 3.2 Type scale

A modular, slightly compressed scale. All values use `rem` (1rem = 16px).

| Token         | Size              | Line-height | Tracking | Weight  | Use                               |
| ------------- | ----------------- | ----------- | -------- | ------- | --------------------------------- |
| `display-2xl` | 4.5rem (72px)     | 1.02        | -0.03em  | 600     | Marketing hero                    |
| `display-xl`  | 3.5rem (56px)     | 1.05        | -0.025em | 600     | Sub-hero, section opener          |
| `display-lg`  | 2.5rem (40px)     | 1.1         | -0.02em  | 600     | Page H1 in product                |
| `h1`          | 2rem (32px)       | 1.15        | -0.015em | 600     | Section heading                   |
| `h2`          | 1.5rem (24px)     | 1.25        | -0.01em  | 600     | Subsection                        |
| `h3`          | 1.25rem (20px)    | 1.3         | -0.005em | 600     | Card titles, modal titles         |
| `h4`          | 1.0625rem (17px)  | 1.4         | 0        | 600     | Inline headings                   |
| `body-lg`     | 1.125rem (18px)   | 1.6         | 0        | 400     | Marketing body, intros            |
| `body`        | 1rem (16px)       | 1.6         | 0        | 400     | Default product body              |
| `body-sm`     | 0.9375rem (15px)  | 1.55        | 0        | 400     | Dense UI                          |
| `caption`     | 0.8125rem (13px)  | 1.5         | 0.005em  | 500     | Labels, helper text, table heads  |
| `mono`        | 0.875rem (14px)   | 1.5         | 0        | 400     | Code, IDs, technical numerals     |
| `eyebrow`     | 0.75rem (12px)    | 1.4         | 0.12em   | 600 UC  | Section eyebrows, all-caps tags   |

`UC` = uppercase. Use eyebrows sparingly — at most one per section.

### 3.3 Hierarchy rules

* **One display per page.** Only the hero (or top of the route) uses `display-xl` or `display-2xl`. Inner sections start at `h1` or smaller.
* **Never two headings adjacent without a body line, eyebrow, or rule between them.**
* **Headings use `--ink`. Body uses `--ink` or `--ink-2`. Helper uses `--ink-3`. That's it.**
* **Color in headings is a deliberate one-word highlight**, not a whole sentence. Example: *"Build the ~~quiet~~ **<span style="color:#f94141">loud</span>** internet."* — and only on hero or major moments.
* **Long-form paragraphs cap at 68 characters per line** (~`max-w-prose` / `max-w-[640px]`).
* **Numbers in dashboards** use `font-feature-settings: "tnum"` so columns align.

### 3.4 Responsive type

Headlines step down on small screens. Use `clamp()` to avoid awkward intermediate sizes:

```css
.display-2xl { font-size: clamp(2.5rem, 6vw + 1rem, 4.5rem); }
.display-xl  { font-size: clamp(2rem,   4.5vw + 1rem, 3.5rem); }
.display-lg  { font-size: clamp(1.75rem, 3vw + 1rem, 2.5rem); }
```

---

## 4. Iconography

* **Library:** Lucide (`lucide-react` for React, `lucide` static SVG for HTML). One library, no mixing.
* **Size:** 16 / 20 / 24 px. Default 20 px in product UI, 24 px in marketing.
* **Stroke:** **2.25 px**, `linecap="round"`, `linejoin="round"` — slightly heavier than Lucide's default 2 px so icons sit confidently next to our type.
* **Color:** `currentColor`, inheriting from the surrounding text. Brand-colored icons appear only inside accent moments (a hero feature card's icon badge).
* **No mixing** of stroke and filled icons. We are stroke-only, with the single exception of the geometric pattern shapes (which are filled by definition).
* **No emoji.** No flags. No 3D icons.

---