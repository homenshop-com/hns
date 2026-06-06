/**
 * device-css.ts — single-source device `@media` emitter shared by the
 * editor serializer AND the published route (mutable-baking-falcon Phase
 * 3/4 WYSIWYG core).
 *
 * Why this exists (plan risk #1): if the editor's preview `@media` and the
 * published page's `@media` ever diverge, the editor stops being WYSIWYG.
 * Both call `buildDeviceMediaCss(scene)` so there is exactly one place that
 * decides what a given device override renders to.
 *
 * Breakpoints (DEVICE_MAX_WIDTH, types.ts): Tablet ≤1024px, Mobile ≤767px.
 * Two `@media` blocks are emitted, tablet first then mobile, so the mobile
 * (narrower) block wins the cascade where both apply.
 *
 * Two override families are supported on the same pass:
 *
 *   1. ABSOLUTE device frames (LegacyAbsoluteEditor) — `tabletFrame` /
 *      `mobileFrame` (+ their `*FrameKeys` / `*Transform`) re-pin a layer's
 *      position/size per device. Emitted as `!important` because the
 *      desktop inline `style=""` has higher specificity than a media rule.
 *      Sections keep the flow guard (no position/left/top — width/height
 *      only).
 *
 *   2. FLOW cascade overrides (ResponsiveFlowEditor) — `responsive.tablet`
 *      / `responsive.mobile` (ResponsiveOverride) tweak a limited Webflow-
 *      style prop set (display / fontScale / padding / align /
 *      flexDirection). Flow reflows on its own; these only nudge.
 *
 *   3. Per-device visibility — `hidden.tablet` / `hidden.mobile` →
 *      `display:none !important` (applies to both paradigms).
 *
 * This module is EMIT-only and deterministic — the scene JSON
 * (`content.layers`) is the source of truth for device overrides, and the
 * CSS is a derived artifact. (Importing hand-authored legacy `@media` back
 * into device frames is a separate concern handled by the parse layer.)
 */

import {
  GroupLayer,
  Layer,
  LayerFrame,
  LayerTransform,
  ResponsiveOverride,
  SceneGraph,
  DEVICE_MAX_WIDTH,
  hasTypedChildren,
  isSection,
} from "./types";
import { printTransform, printTransformOrigin } from "./parse-transform";

/** Marker so the editor save path can strip+replace its own block
 *  idempotently without disturbing hand-authored CSS. */
export const DEVICE_MEDIA_COMMENT_MARK = "/* SCENE-DEVICE-OVERRIDES */";

type NonPcDevice = "tablet" | "mobile";

/** CSS.escape for ids (Node / SSR doesn't have CSS.escape everywhere). */
function cssIdentifier(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

function collectAllLayers(root: GroupLayer, out: Layer[]): void {
  for (const child of root.children) {
    out.push(child);
    if (hasTypedChildren(child)) collectAllLayers(child as GroupLayer, out);
  }
}

/** Parse the leading number from a CSS length like "20px" → 20. */
function pxNumber(v: string | undefined): number | null {
  if (!v) return null;
  const m = v.match(/-?\d*\.?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function deviceFrame(layer: Layer, device: NonPcDevice): {
  frame?: LayerFrame;
  keys: Set<string>;
  transform?: LayerTransform;
} {
  if (device === "tablet") {
    return {
      frame: layer.tabletFrame,
      keys: new Set(layer.tabletFrameKeys ?? []),
      transform: layer.tabletTransform,
    };
  }
  return {
    frame: layer.mobileFrame,
    keys: new Set(layer.mobileFrameKeys ?? []),
    transform: layer.mobileTransform,
  };
}

/**
 * Build the declaration list for one layer at one device. Returns null when
 * the layer has nothing to override at that device.
 */
function buildLayerDeviceDeclarations(layer: Layer, device: NonPcDevice): string[] | null {
  const declarations: string[] = [];

  // (3) Visibility — wins over everything, emitted first.
  if (layer.hidden?.[device]) {
    declarations.push("display: none !important;");
    // A hidden layer needs no further geometry/typography.
    return declarations;
  }

  // (1) Absolute device frame.
  const { frame, keys, transform } = deviceFrame(layer, device);
  if (frame) {
    const allowed = isSection(layer)
      ? (["width", "height"] as const)
      : (["position", "left", "top", "width", "height"] as const);
    for (const k of allowed) {
      if (!keys.has(k)) continue;
      if (k === "position") declarations.push("position: absolute !important;");
      else if (k === "left") declarations.push(`left: ${frame.x}px !important;`);
      else if (k === "top") declarations.push(`top: ${frame.y}px !important;`);
      else if (k === "width") declarations.push(`width: ${frame.w}px !important;`);
      else if (k === "height") declarations.push(`height: ${frame.h}px !important;`);
    }
  }
  if (transform) {
    const tfm = printTransform(transform);
    if (tfm) declarations.push(`transform: ${tfm} !important;`);
    const tfo = printTransformOrigin(transform);
    if (tfo) declarations.push(`transform-origin: ${tfo} !important;`);
  }

  // (2) Flow cascade override.
  const ov: ResponsiveOverride | undefined = layer.responsive?.[device];
  if (ov) {
    if (ov.display) declarations.push(`display: ${ov.display} !important;`);
    if (ov.fontScale != null) {
      const base = pxNumber(layer.style?.fontSize);
      if (base != null) {
        // Round to 2dp to keep output stable and avoid float noise.
        const scaled = Math.round(base * ov.fontScale * 100) / 100;
        declarations.push(`font-size: ${scaled}px !important;`);
      }
    }
    if (ov.padding) declarations.push(`padding: ${ov.padding} !important;`);
    if (ov.align) declarations.push(`text-align: ${ov.align} !important;`);
    if (ov.flexDirection) declarations.push(`flex-direction: ${ov.flexDirection} !important;`);
  }

  return declarations.length > 0 ? declarations : null;
}

function buildDeviceBlock(layers: Layer[], device: NonPcDevice): string | null {
  const rules: string[] = [];
  for (const layer of layers) {
    const decls = buildLayerDeviceDeclarations(layer, device);
    if (!decls) continue;
    rules.push(`  #${cssIdentifier(layer.id)} { ${decls.join(" ")} }`);
  }
  if (rules.length === 0) return null;
  return [`@media (max-width: ${DEVICE_MAX_WIDTH[device]}px) {`, ...rules, `}`].join("\n");
}

/**
 * Serialize every layer's tablet + mobile device overrides into (at most)
 * two `@media` blocks, tablet first. Returns "" when there is nothing to
 * emit. The block is prefixed with {@link DEVICE_MEDIA_COMMENT_MARK} so the
 * editor save path can replace it idempotently via
 * {@link stripDeviceMediaCss}.
 */
export function buildDeviceMediaCss(scene: SceneGraph): string {
  const layers: Layer[] = [];
  collectAllLayers(scene.root as GroupLayer, layers);

  const blocks: string[] = [];
  const tablet = buildDeviceBlock(layers, "tablet");
  if (tablet) blocks.push(tablet);
  const mobile = buildDeviceBlock(layers, "mobile");
  if (mobile) blocks.push(mobile);

  if (blocks.length === 0) return "";
  return [DEVICE_MEDIA_COMMENT_MARK, ...blocks].join("\n");
}

/**
 * Lossless round-trip overlay: copy every per-device override field from a
 * previously saved scene (`content.layers`) onto a freshly HTML-parsed
 * scene, matched by layer id. Unlike reading the device `@media` CSS back
 * (which is lossy for `responsive` fontScale/hidden), the saved scene JSON
 * is the exact source of truth, so on editor reload the user sees their
 * tablet/mobile layouts, visibility, and cascade overrides intact.
 *
 * Only the device-override fields are copied — base geometry, style, and
 * structure come from the fresh HTML parse (the published contract).
 */
export function applyDeviceOverridesFromScene(
  target: SceneGraph,
  saved: SceneGraph,
): void {
  if (!saved?.root) return;
  const savedById = new Map<string, Layer>();
  const index = (node: GroupLayer): void => {
    for (const child of node.children) {
      savedById.set(child.id, child);
      if (hasTypedChildren(child)) index(child as GroupLayer);
    }
  };
  index(saved.root as GroupLayer);

  const overlay = (node: GroupLayer): void => {
    for (const child of node.children) {
      const src = savedById.get(child.id);
      if (src) {
        if (src.tabletFrame) child.tabletFrame = src.tabletFrame;
        if (src.tabletFrameKeys) child.tabletFrameKeys = src.tabletFrameKeys;
        if (src.tabletTransform) child.tabletTransform = src.tabletTransform;
        if (src.mobileFrame) child.mobileFrame = src.mobileFrame;
        if (src.mobileFrameKeys) child.mobileFrameKeys = src.mobileFrameKeys;
        if (src.mobileTransform) child.mobileTransform = src.mobileTransform;
        if (src.hidden) child.hidden = src.hidden;
        if (src.responsive) child.responsive = src.responsive;
      }
      if (hasTypedChildren(child)) overlay(child as GroupLayer);
    }
  };
  overlay(target.root as GroupLayer);
}

/**
 * Strip a previously emitted device-overrides block (everything from the
 * marker through its trailing blocks) so a fresh one can replace it.
 * Conservatively keys on the exact marker we write on every save and
 * removes the marker plus the two `@media {...}` blocks that follow it.
 */
export function stripDeviceMediaCss(css: string): string {
  // The marker is followed by 0..2 `@media (...) { ... }` blocks. Remove the
  // marker line and any immediately-following media blocks.
  const markerIdx = css.indexOf(DEVICE_MEDIA_COMMENT_MARK);
  if (markerIdx === -1) return css;
  let rest = css.slice(markerIdx + DEVICE_MEDIA_COMMENT_MARK.length);
  // Consume consecutive @media blocks (brace-matched).
  const consume = () => {
    const m = rest.match(/^\s*@media\s*\([^)]*\)\s*\{/);
    if (!m) return false;
    let depth = 0;
    let i = rest.indexOf("{", m.index ?? 0);
    for (; i < rest.length; i++) {
      if (rest[i] === "{") depth++;
      else if (rest[i] === "}") {
        depth--;
        if (depth === 0) {
          rest = rest.slice(i + 1);
          return true;
        }
      }
    }
    // Unbalanced — bail, drop the remainder.
    rest = "";
    return false;
  };
  while (consume()) {
    /* keep consuming adjacent @media blocks */
  }
  const out = css.slice(0, markerIdx) + rest;
  // Tidy whitespace, but only collapse 3+ newlines (matches sceneToMobileCss).
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
