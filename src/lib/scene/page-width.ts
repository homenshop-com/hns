/**
 * Page-width managed CSS block — single source for the user-settable PC page
 * width (the "페이지 폭" control in the Inspector → 페이지 tab).
 *
 * The legacy artboard width is otherwise *inferred* from any pre-existing
 * `#v_home_dft` / `.c_v_home_dft { width: Npx }` rule and only ever WIDENED
 * past the 1000px default (both the editor's `designCanvasWidth` and the
 * published route's `designWidth`). To make the width explicitly settable —
 * including narrower than 1000 — we persist it in a dedicated marker block in
 * the page CSS. Both the editor and the published route read it via
 * `parsePageWidthCss` and, when present, it takes precedence over the inferred
 * value (no >1000 floor). Absent → fall back to the legacy heuristic, so
 * existing sites are untouched.
 */

export const PAGE_WIDTH_MARK_START = "/* HNS-PAGE-WIDTH:START */";
export const PAGE_WIDTH_MARK_END = "/* HNS-PAGE-WIDTH:END */";

/** Clamp range for a sane PC artboard width (px). */
export const PAGE_WIDTH_MIN = 320;
export const PAGE_WIDTH_MAX = 2400;

function pageWidthBlockRegex(): RegExp {
  return new RegExp(
    String.raw`\/\*\s*HNS-PAGE-WIDTH:START\s*\*\/[\s\S]*?\/\*\s*HNS-PAGE-WIDTH:END\s*\*\/`,
    "g",
  );
}

/**
 * Read the managed PC page width from a CSS string. Returns the px value if a
 * HNS-PAGE-WIDTH block is present and valid, else null (→ caller falls back to
 * the legacy width heuristic).
 */
export function parsePageWidthCss(css: string | null | undefined): number | null {
  if (!css) return null;
  const block = pageWidthBlockRegex().exec(css)?.[0];
  if (!block) return null;
  const m = /(?<![a-z-])width\s*:\s*(\d+)px/i.exec(block);
  if (!m) return null;
  const w = parseInt(m[1]!, 10);
  if (!Number.isFinite(w) || w <= 0) return null;
  return Math.min(PAGE_WIDTH_MAX, Math.max(PAGE_WIDTH_MIN, w));
}

/**
 * Upsert the managed PC page width block. `width <= 0` (or null) REMOVES the
 * block (revert to the inferred default). The block pins both the id and class
 * selectors with `!important` so it governs the published `#v_home_dft`
 * wrapper regardless of template CSS specificity.
 */
export function upsertPageWidthCss(
  css: string | null | undefined,
  width: number | null,
): string {
  const base = (css || "").replace(pageWidthBlockRegex(), "").trim();
  if (!width || width <= 0) return base;
  const w = Math.min(PAGE_WIDTH_MAX, Math.max(PAGE_WIDTH_MIN, Math.round(width)));
  const block = `${PAGE_WIDTH_MARK_START}\n#v_home_dft, .c_v_home_dft { width: ${w}px !important; margin: 0 auto !important; }\n${PAGE_WIDTH_MARK_END}`;
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}
