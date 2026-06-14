/**
 * Scene-owned base-level geometry stripping — shared single source for
 * WYSIWYG parity (mutable-baking-falcon — body object drag/resize).
 *
 * Both the editor canvas and the published route boost per-page CSS
 * geometry to `!important` (boostImportant). Side effect: a plain inline
 * `left/top/width/height/position` written by drag/resize LOSES to the
 * boosted stylesheet `!important` rule (stylesheet `!important` > plain
 * inline), so dragging a body object is visually ignored.
 *
 * The fix removes the DUPLICATE: for any element id the scene owns a
 * geometry prop for, strip the matching BASE-level page-CSS declaration so
 * the scene's plain inline governs unopposed. `@media`/`@supports` blocks
 * are left intact (their per-device overrides still cascade by source
 * order — the scene's own device `@media`, appended later, wins).
 *
 * The same `owned` semantics are produced on both sides:
 * the editor builds it from scene frameKeys (`collectSceneGeometryOwners`),
 * the published route from rendered inline styles (`collectInlineGeometryOwners`).
 */

/** Geometry props that the scene owns via inline styles. When an element
 *  declares one of these inline, the boosted (`!important`) base-level
 *  page-CSS rule for the same prop is a stale duplicate that would beat the
 *  scene's plain inline value (stylesheet `!important` > plain inline). */
export const SCENE_GEOMETRY_PROPS = ["position", "left", "top", "width", "height"] as const;

/** Scene layer types whose rendered geometry is CSS/JS-driven, NOT inline.
 *  Dynamic plugins (board slideshow hero, product grid, exhibition, …) carry
 *  a tiny placeholder inline `width/height` (e.g. 200×50) while the REAL size
 *  lives in the per-page CSS rule. Stripping that CSS would collapse the
 *  element to the placeholder, so these are NEVER treated as geometry owners.
 *  Mirrors the `*Plugin` class check on the route side (PLUGIN_CLASS_TYPE). */
const PLUGIN_LAYER_TYPES = new Set([
  "board",
  "product",
  "exhibition",
  "menu",
  "login",
  "mail",
]);

/** True when an element's class list marks it a dynamic plugin (`boardPlugin`,
 *  `productPlugin`, `exhibitionPlugin`, `menuPlugin`, `loginPlugin`,
 *  `mailPlugin`). Such elements are CSS/JS-sized — exclude from geometry strip. */
function isPluginClass(className: string): boolean {
  return /\b[A-Za-z]+Plugin\b/.test(className);
}

/**
 * Strip scene-owned base-level geometry declarations from page CSS.
 *
 * Safety: only props the scene actually owns are stripped, and only at the
 * top level (never inside `@media`/`@supports`). CSS-only geometry the scene
 * doesn't know about is never touched, so nothing can lose its position.
 */
export function stripPinnedGeometryCss(
  css: string,
  owned: Map<string, Set<string>>,
): string {
  if (owned.size === 0 || !css) return css;
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    const braceIdx = css.indexOf("{", i);
    if (braceIdx === -1) {
      out += css.slice(i);
      break;
    }
    const selector = css.slice(i, braceIdx);
    const selTrim = selector.trim();
    // A CSS comment can precede the selector (e.g. the DEVICE-OVERRIDES marker
    // `/* SCENE-DEVICE-OVERRIDES */` sitting right before its `@media`). Strip
    // comments before BOTH the at-rule test and the `#id` match — otherwise a
    // comment-prefixed `@media` is misclassified as a plain rule, we descend
    // INTO it, and strip the per-device geometry it carries (every non-plugin
    // inline-owner loses its tablet/mobile re-pin → element snaps back to its
    // desktop coords off-screen). The original `selector` (comment included) is
    // still emitted verbatim so nothing else changes.
    const selForMatch = selTrim.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    // At-rules with nested blocks (@media/@supports/@keyframes): copy the
    // whole block verbatim — we only strip TOP-LEVEL geometry duplicates.
    if (selForMatch.startsWith("@")) {
      let depth = 0;
      let j = braceIdx;
      for (; j < n; j++) {
        if (css[j] === "{") depth++;
        else if (css[j] === "}") {
          depth--;
          if (depth === 0) {
            j++;
            break;
          }
        }
      }
      out += css.slice(i, j);
      i = j;
      continue;
    }
    // Plain rule: declarations run until the first '}' (no nesting).
    // `selForMatch` (comment-stripped, computed above) also defeats a comment
    // sitting between the previous rule and a `#id` selector, which would
    // otherwise leak a geometry duplicate through.
    let closeIdx = css.indexOf("}", braceIdx);
    if (closeIdx === -1) closeIdx = n - 1;
    const m = /^#([A-Za-z0-9_-]+)$/.exec(selForMatch);
    const props = m ? owned.get(m[1]) : undefined;
    if (props) {
      const block = css.slice(braceIdx + 1, closeIdx);
      const kept = block
        .split(";")
        .filter((decl) => {
          if (decl.trim() === "") return false;
          const c = decl.indexOf(":");
          if (c === -1) return true;
          const prop = decl.slice(0, c).trim().toLowerCase();
          return !props.has(prop);
        });
      if (kept.length > 0) {
        out += `${selector}{${kept.join(";")}}`;
      }
      // else: rule emptied → drop entirely.
    } else {
      out += css.slice(i, closeIdx + 1);
    }
    i = closeIdx + 1;
  }
  return out;
}

/**
 * Strip the `!important` flag from INLINE geometry declarations
 * (position/left/top/width/height) inside HTML `style="…"` attributes,
 * preserving each value.
 *
 * Why: per the WYSIWYG contract, base geometry must be PLAIN inline so the
 * device `@media { #id { … !important } }` re-pins (authored against the
 * tablet/mobile artboards) win at small viewports. An inline `!important`
 * geometry value — baked in by legacy publisher HTML or by the editor's
 * live-preview importantPin — beats the stylesheet `@media !important`
 * (inline `!important` > stylesheet `!important`), freezing EVERY breakpoint
 * at the desktop coordinates. That is exactly the symptom of "tablet/mobile
 * edits don't show on the published page". Mirrors `stripFooterPinnedTop`'s
 * rationale for footer flow, generalized to header/body re-pins.
 *
 * Scope: only `style=` ATTRIBUTES are touched. `<style>` blocks — which
 * legitimately carry the device `@media !important` rules — never match, so
 * the overrides themselves are preserved. Non-geometry props (background,
 * font-size, text-align, …) keep their `!important`. `min-height`/`max-width`
 * are safe: the `(^|;)` anchor prevents matching the `height`/`width` tail of
 * a hyphenated prop.
 */
export function stripInlineGeometryImportant(html: string): string {
  if (!html || html.indexOf("!important") === -1) return html;
  return html.replace(/\bstyle=(["'])([\s\S]*?)\1/gi, (full, q: string, body: string) => {
    if (body.indexOf("!important") === -1) return full;
    const cleaned = body.replace(
      /(^|;)(\s*(?:position|left|top|width|height)\s*:[^;!}]*?)\s*!important/gi,
      "$1$2",
    );
    return cleaned === body ? full : `style=${q}${cleaned}${q}`;
  });
}

/** Build the id→owned-geometry-prop map from rendered HTML inline styles.
 *  Used by the published route (no scene graph available there). An element
 *  "owns" a prop when its inline `style=` declares it. */
export function collectInlineGeometryOwners(html: string): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (!html) return map;
  const tagRe = /<[a-zA-Z][^>]*>/g;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(html)) !== null) {
    const tag = tm[0];
    const idM = /\bid=["']([^"']+)["']/.exec(tag);
    if (!idM) continue;
    // Skip dynamic plugins — their inline geometry is a placeholder; the
    // real size lives in CSS (stripping it would collapse the element).
    const clsM = /\bclass=["']([^"']*)["']/.exec(tag);
    if (clsM && isPluginClass(clsM[1]!)) continue;
    const stM = /\bstyle=["']([^"']*)["']/.exec(tag);
    if (!stM) continue;
    const style = stM[1]!;
    const props = new Set<string>();
    for (const p of SCENE_GEOMETRY_PROPS) {
      if (new RegExp(`(?:^|;)\\s*${p}\\s*:`, "i").test(style)) props.add(p);
    }
    if (props.size) map.set(idM[1]!, props);
  }
  return map;
}

/** Build the id→owned-geometry-prop map from the editor scene graph.
 *  Used by the editor (the live scene is available there). An element
 *  "owns" a prop when its `frameKeys` lists it — the scene emits an inline
 *  value for that prop. Editor-side mirror of collectInlineGeometryOwners. */
type GeoNode = {
  id: string;
  type?: string;
  frameKeys?: readonly string[];
  children?: unknown[];
};

export function collectSceneGeometryOwners(root: GeoNode): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const geom = new Set<string>(SCENE_GEOMETRY_PROPS);
  const walk = (l: GeoNode) => {
    // Skip dynamic plugins — their frame is a placeholder; real size is CSS.
    if (!(l.type && PLUGIN_LAYER_TYPES.has(l.type)) && l.frameKeys && l.frameKeys.length) {
      const props = new Set<string>();
      for (const k of l.frameKeys) if (geom.has(k)) props.add(k);
      if (props.size) map.set(l.id, props);
    }
    if (Array.isArray(l.children)) {
      for (const c of l.children) walk(c as GeoNode);
    }
  };
  walk(root);
  return map;
}
