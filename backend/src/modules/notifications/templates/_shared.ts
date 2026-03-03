/**
 * MJML helpers shared by every email template. Tests load these to verify the
 * brand colors stay in sync with DESIGN_SYSTEM.md.
 */
export const BRAND = {
  blue: '#0F62FE',
  yellow: '#F1C21B',
  red: '#DA1E28',
  green: '#198038',
  ink: '#161616',
  surface: '#F4F4F4',
  surfaceMuted: '#E0E0E0',
};

/**
 * Renders an MJML wrapper around per-template body markup. Used at build time
 * by the templates themselves (we keep the wrapper inline so each `.mjml`
 * remains a valid standalone document — MJML doesn't ship a `<mj-include>` we
 * trust at build time).
 *
 * Exported for tests + future codegen scripts.
 */
export const HEADER_MJML = `
  <mj-section background-color="#FFFFFF" padding-bottom="0">
    <mj-column>
      <mj-text font-size="20px" font-weight="700" color="${BRAND.ink}" font-family="Inter, system-ui, sans-serif">
        MGM Asset Library
      </mj-text>
    </mj-column>
  </mj-section>
`.trim();

export const FOOTER_MJML = `
  <mj-section background-color="${BRAND.surface}">
    <mj-column>
      <mj-text font-size="11px" color="#525252" font-family="Inter, system-ui, sans-serif" align="center">
        You're receiving this because you have an account at MGM Asset Library.
      </mj-text>
    </mj-column>
  </mj-section>
`.trim();
