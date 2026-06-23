/**
 * Shared paradigm-neutral CSS/HTML helpers (Phase 1 extraction —
 * mutable-baking-falcon). Both the absolute (Figma) and flow (responsive)
 * editors need these, and they carry zero closure dependencies, so they
 * live in edit/shared/ as a single source.
 *
 * Behavior-neutral: relocated verbatim from design-editor.tsx.
 */

/**
 * Boost page-CSS position/size props to `!important` — mirrors the
 * published route (route.ts). Without this, the template's
 * `site-upgrade.css` !important rules override per-element top/left/
 * width/height/position/z-index from pageCss, collapsing absolutely
 * positioned sections to default positions and producing a bare
 * skeleton view (tiny hero, huge gap, plain text at bottom).
 */
export function boostImportant(css: string): string {
  return css.replace(
    /(\b(?:top|left|width|height|display|position|z-index)\s*:\s*)([^;!}]+)(;|})/gi,
    (_: string, prop: string, val: string, end: string) =>
      val.trim().includes("!important")
        ? `${prop}${val}${end}`
        : `${prop}${val.trim()} !important${end}`,
  );
}

// Scene-owned geometry stripping lives in the shared single source
// (`src/lib/scene/geometry-strip.ts`) so the editor canvas and the published
// route stay byte-for-byte in sync (WYSIWYG). Re-exported here for the
// editor's existing import path.
export {
  SCENE_GEOMETRY_PROPS,
  stripPinnedGeometryCss,
  collectInlineGeometryOwners,
  collectSceneGeometryOwners,
  updatePluginRealSizeCss,
} from "@/lib/scene";

/** Escape a string for safe interpolation into HTML text/attribute. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
