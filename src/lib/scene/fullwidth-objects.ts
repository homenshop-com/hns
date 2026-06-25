/**
 * fullwidth-objects.ts — per-object "전체 폭(100vw)" full-bleed for BODY objects.
 *
 * The user can mark individual body objects (image / box / plugin / text) to
 * span the full viewport width on PC. Stored as a managed block in the page CSS
 * (single source for the editor canvas AND the published route):
 *
 *   /* HNS-FULLWIDTH:START *\/
 *   @media (min-width: 1280px) {
 *     #id1, #id2 { width:100vw!important; left:50%!important; margin-left:-50vw!important;
 *                  right:auto!important; max-width:100vw!important; }
 *   }
 *   /* HNS-FULLWIDTH:END *\/
 *
 * - Scoped to `@media (min-width: <pageWidth>px)` so it only fires on the
 *   desktop band where the page is centered with side gaps. On narrower
 *   viewports the published page is scaled to fit, so a page-width object
 *   already fills the screen — applying 100vw there would mis-size it.
 * - `left:50% + margin-left:-50vw` breaks the absolutely-positioned object out
 *   of the centered page wrapper to the viewport edges. The wrapper's
 *   `overflow-x` is relaxed to `visible` by the published route when this block
 *   is present (see route `hasFullBleed`), with `html,body{overflow-x:hidden}`
 *   clipping at the viewport (no horizontal scroll).
 * - `!important` so it beats the object's inline px geometry (which is plain,
 *   per the geometry-strip contract) and the boosted page CSS.
 */

export const FULLWIDTH_MARK_START = "/* HNS-FULLWIDTH:START */";
export const FULLWIDTH_MARK_END = "/* HNS-FULLWIDTH:END */";

function blockRegex(): RegExp {
  return new RegExp(
    String.raw`\/\*\s*HNS-FULLWIDTH:START\s*\*\/[\s\S]*?\/\*\s*HNS-FULLWIDTH:END\s*\*\/`,
    "g",
  );
}

/** Object ids currently marked full-width (parsed from the managed block). */
export function parseFullWidthIds(css: string | null | undefined): string[] {
  if (!css) return [];
  const block = blockRegex().exec(css)?.[0];
  if (!block) return [];
  // Selector list: `#hns_body #a, #hns_body #b { ... }`. Match the OBJECT id
  // (the one after `#hns_body `), not the wrapper id.
  const ids = Array.from(block.matchAll(/#hns_body\s+#([A-Za-z0-9_-]+)/g)).map((m) => m[1]!);
  return Array.from(new Set(ids));
}

/** Write/replace the managed block for the given ids. Empty ids → remove it. */
export function upsertFullWidthCss(
  css: string | null | undefined,
  ids: string[],
  breakpoint: number,
): string {
  const base = (css || "").replace(blockRegex(), "").trim();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return base;
  const bp = Math.max(320, Math.round(breakpoint) || 1000);
  // `#hns_body #id` (2 ids) so it beats a plugin's bare `#id` real-size rule
  // (1 id, also !important) regardless of source order. Body objects live in
  // #hns_body in both the editor (#de-canvas-inner > #hns_body) and published.
  const sel = unique.map((id) => `#hns_body #${id}`).join(", ");
  const rule = `${sel} { width:100vw!important; left:50%!important; right:auto!important; margin-left:-50vw!important; max-width:100vw!important; }`;
  const block = `${FULLWIDTH_MARK_START}\n@media (min-width:${bp}px){\n  ${rule}\n}\n${FULLWIDTH_MARK_END}`;
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

/** Toggle a single object id on/off in the managed block. */
export function toggleFullWidthId(
  css: string | null | undefined,
  id: string,
  on: boolean,
  breakpoint: number,
): string {
  const next = parseFullWidthIds(css).filter((x) => x !== id);
  if (on) next.push(id);
  return upsertFullWidthCss(css, next, breakpoint);
}
