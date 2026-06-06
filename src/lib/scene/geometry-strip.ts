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
    // At-rules with nested blocks (@media/@supports/@keyframes): copy the
    // whole block verbatim — we only strip TOP-LEVEL geometry duplicates.
    if (selTrim.startsWith("@")) {
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
    let closeIdx = css.indexOf("}", braceIdx);
    if (closeIdx === -1) closeIdx = n - 1;
    // A CSS comment can sit between the previous rule and this selector
    // (e.g. `/* layout fix */\n#main_text_1 {…}`), which would otherwise
    // defeat the `^#id$` match and leak the duplicate through. Strip
    // comments only for the match test — the original `selector` (comment
    // included) is preserved verbatim in the output.
    const selForMatch = selTrim.replace(/\/\*[\s\S]*?\*\//g, "").trim();
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
export function collectSceneGeometryOwners(
  root: { id: string; frameKeys?: readonly string[]; children?: unknown[] },
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const geom = new Set<string>(SCENE_GEOMETRY_PROPS);
  const walk = (l: { id: string; frameKeys?: readonly string[]; children?: unknown[] }) => {
    if (l.frameKeys && l.frameKeys.length) {
      const props = new Set<string>();
      for (const k of l.frameKeys) if (geom.has(k)) props.add(k);
      if (props.size) map.set(l.id, props);
    }
    if (Array.isArray(l.children)) {
      for (const c of l.children) {
        walk(c as { id: string; frameKeys?: readonly string[]; children?: unknown[] });
      }
    }
  };
  walk(root);
  return map;
}
