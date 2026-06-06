/**
 * Shared theme-CSS utilities (Phase 1 extraction — mutable-baking-falcon).
 *
 * Paradigm-neutral: builds/parses the managed `:root{}` theme-token block
 * that both the absolute (Figma) and flow (responsive) editors apply to a
 * page's CSS. Moved out of design-editor.tsx verbatim so the upcoming
 * LegacyAbsoluteEditor and ResponsiveFlowEditor can share a single source.
 *
 * Behavior-neutral: no logic changed, only relocated.
 */
import { findThemePresetByColors } from "../components/theme-presets";

export const THEME_MARK_START = "/* HNS-THEME-TOKENS:START */";
export const THEME_MARK_END = "/* HNS-THEME-TOKENS:END */";

/** Theme tokens written into the managed `:root{}` block. The 4 color
 *  tokens are surfaced as `--brand-color/-accent/-surface/-text` CSS
 *  vars; the rest of `buildThemeCssBlock` cascades them onto common
 *  selectors so the canvas reflects the change without per-element
 *  edits. */
export type ThemeTokens = {
  brand: string;
  accent: string;
  surface?: string;
  text?: string;
  fontStack?: string;
};

export function cssManagedBlockRegex(start: string, end: string) {
  return new RegExp(
    start.replace(/[/*]/g, "\\$&") + "[\\s\\S]*?" + end.replace(/[/*]/g, "\\$&"),
  );
}

/**
 * Build the managed `:root{...}` CSS block + element overrides for the
 * current theme tokens. Selectors are emitted twice — once for the
 * editor canvas (`#de-canvas-inner`) and once for the published page
 * body (`#hns_body`) — so the same theme renders identically in
 * preview and on the live site.
 *
 * What changed in 2026-04-26 fix:
 * - Dropped `[style*="border-radius"]` from the badge/pill rule. That
 *   attribute selector matched ANY element with inline `border-radius`
 *   — including user-added shapes (a circle has `border-radius:50%`),
 *   so applying a theme would silently repaint every shape on the
 *   page with the accent color. Visible symptom: red circle published
 *   as a gray disc.
 * - Dropped `a[style*="background"]` from the button rule (same kind
 *   of overly-broad attribute match that grabbed unintended elements).
 * - Now targets `#hns_body` too, so theme styling is consistent
 *   between editor preview and the published page (previously the
 *   theme appeared in the canvas only, then "vanished" on publish).
 */
export function buildThemeCssBlock(tokens: ThemeTokens) {
  const surface = tokens.surface ?? "#ffffff";
  const text = tokens.text ?? "#111827";
  const fontVar = tokens.fontStack ? `  --brand-font: ${tokens.fontStack};\n` : "";

  // Helper — emit both editor and published-page-scoped selectors for
  // a given inner pattern so a single rule applies in both contexts.
  const dual = (inner: string) => `#de-canvas-inner ${inner}, #hns_body ${inner}`;

  const fontRules = tokens.fontStack
    ? `
${dual('*:not(i):not(.fa):not([class^="fa-"]):not([class*=" fa-"])')} {
  font-family: var(--brand-font) !important;
}
`
    : "";

  return `${THEME_MARK_START}
:root {
  --brand-color: ${tokens.brand};
  --brand-accent: ${tokens.accent};
  --brand-surface: ${surface};
  --brand-text: ${text};
${fontVar}}

/* Page surface — the canvas root carries the surface tone so sections
   without their own background pick it up. */
#de-canvas-inner,
#hns_body {
  background-color: var(--brand-surface) !important;
  color: var(--brand-text) !important;
}

/* Body copy — paragraphs and generic text blocks follow --brand-text.
   Headings & buttons get their own color rules below, which override
   this via cascade order. */
${dual('p')},
${dual('li')},
${dual('span:not([style*="color"])')},
${dual('div:not([style*="color"]):not([style*="background"])')} {
  color: var(--brand-text);
}

/* Headings & first-class titles → brand color. Includes both real
   semantic tags and the editor's text-layer naming patterns. */
${dual('h1')},
${dual('h2')},
${dual('h3')},
${dual('h4')},
${dual('h5')},
${dual('h6')},
${dual('.title')},
${dual('.headline')},
${dual('.section-title')},
${dual('[class*="-title"]')},
${dual('[class*="-heading"]')},
${dual('.sol-replacible-text h1')},
${dual('.sol-replacible-text h2')},
${dual('.sol-replacible-text h3')} {
  color: var(--brand-color) !important;
}

/* Badges / pills / tags pick up the accent color as a soft tint. NOTE
   we deliberately do NOT include [style*="border-radius"] here — that
   would also match user-added shapes (circles have radius:50%) and
   repaint them with the accent color. Class-only selectors are safer. */
${dual('.badge')},
${dual('.tag')},
${dual('.eyebrow')},
${dual('[class*="badge"]')},
${dual('[class*="eyebrow"]')},
${dual('[class*="-pill"]')},
${dual('[class*="-chip"]')} {
  background-color: color-mix(in srgb, var(--brand-accent) 18%, var(--brand-surface)) !important;
  border-color: var(--brand-accent) !important;
  color: color-mix(in srgb, var(--brand-color) 80%, black) !important;
}

/* Buttons & button-like links — fill with brand. Class-anchored only;
   no [style*="background"] attribute match, which would otherwise grab
   any link a user has manually styled. */
${dual('button')},
${dual('.btn')},
${dual('[class*="btn-primary"]')},
${dual('[class*="button-primary"]')},
${dual('[class*="btn-gold"]')} {
  background-color: var(--brand-color) !important;
  border-color: var(--brand-color) !important;
  color: #ffffff !important;
}

/* Secondary buttons (outlined) — accent border. */
${dual('[class*="btn-secondary"]')},
${dual('[class*="button-secondary"]')},
${dual('[class*="btn-outline"]')} {
  background-color: transparent !important;
  border-color: var(--brand-accent) !important;
  color: var(--brand-color) !important;
}

/* Plain links — brand color. Excludes button-styled links handled above. */
${dual('a:not([class*="btn"]):not([class*="button"])')} {
  color: var(--brand-color) !important;
}
${fontRules}${THEME_MARK_END}`;
}

export function inferThemePresetId(brand: string, accent: string): string | null {
  return findThemePresetByColors(brand, accent)?.id ?? null;
}

export function parseThemeTokens(css: string) {
  const block = css.match(cssManagedBlockRegex(THEME_MARK_START, THEME_MARK_END))?.[0] ?? css;
  const brand = block.match(/--brand-color\s*:\s*([^;]+);/i)?.[1]?.trim();
  const accent = block.match(/--brand-accent\s*:\s*([^;]+);/i)?.[1]?.trim();
  const surface = block.match(/--brand-surface\s*:\s*([^;]+);/i)?.[1]?.trim();
  const text = block.match(/--brand-text\s*:\s*([^;]+);/i)?.[1]?.trim();
  const fontStack = block.match(/--brand-font\s*:\s*([^;]+);/i)?.[1]?.trim();
  return { brand, accent, surface, text, fontStack };
}
