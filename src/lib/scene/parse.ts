/**
 * legacyHtmlToScene — Parse legacy body HTML into a typed SceneGraph.
 *
 * Input:  body-level innerHTML produced by the editor or PHP publisher.
 *         Expected shape: a flat-or-nested tree of `<div class="dragable" ...>`
 *         elements, each optionally wrapped in `.de-group.dragable` group
 *         wrappers produced by the Tier-1 upgrade.
 *
 * Output: SceneGraph with a root GroupLayer (virtual) containing top-level
 *         layers as children. Nested groups nest recursively.
 *
 * Principles:
 * - Never throw on malformed input. Unrecognized nodes become BoxLayer
 *   with their outer HTML preserved so nothing is silently lost.
 * - Preserve legacy ids verbatim. Generate ids for unidentified nodes
 *   so the scene remains addressable.
 * - Server-safe: uses jsdom's DOMParser in tests and the real DOMParser
 *   in the browser. We obtain a document via a tiny adapter so this
 *   module has no hard dependency on `window`.
 */

import {
  BoxLayer,
  DRAGABLE_CLASS,
  GROUP_CLASS,
  GroupLayer,
  ImageLayer,
  Layer,
  LayerStyle,
  PLUGIN_CLASS_TYPE,
  PluginLayer,
  SceneGraph,
  SectionLayer,
  TextLayer,
} from "./types";
import { ROOT_GROUP_ID, newLayerId } from "./ids";
import { StyleMap, parseStyle, pxNum, hasImportant } from "./parse-style";
import { parseTransform, parseTransformOrigin } from "./parse-transform";

/* ─── DOM adapter (works in browser + jsdom) ─── */

type DocLike = { body: Element } & ParentNode;

function getParser(): DOMParser {
  if (typeof DOMParser !== "undefined") return new DOMParser();
  throw new Error("scene/parse: No DOMParser available. In Node tests, use vitest's jsdom environment.");
}

function parseBodyFragment(html: string): Element {
  const doc = getParser().parseFromString(
    `<!DOCTYPE html><html><body>${html}</body></html>`,
    "text/html",
  ) as unknown as DocLike;
  return doc.body;
}

/* ─── Helpers ─── */

function classList(el: Element): string[] {
  return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
}

function hasClass(el: Element, cls: string): boolean {
  return classList(el).includes(cls);
}

function getAttrs(el: Element, skip: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) {
    const a = el.attributes[i]!;
    if (skip.has(a.name)) continue;
    out[a.name] = a.value;
  }
  return out;
}

function extractFrame(style: StyleMap): {
  frame: { x: number; y: number; w: number; h: number };
  keys: Array<"position" | "left" | "top" | "width" | "height">;
  important: Array<"position" | "left" | "top" | "width" | "height">;
} {
  const keys: Array<"position" | "left" | "top" | "width" | "height"> = [];
  const important: Array<"position" | "left" | "top" | "width" | "height"> = [];
  const check = (k: "position" | "left" | "top" | "width" | "height") => {
    if (style[k] != null) {
      keys.push(k);
      if (hasImportant(style[k])) important.push(k);
    }
  };
  check("position");
  check("left");
  check("top");
  check("width");
  check("height");
  return {
    frame: {
      x: pxNum(style["left"]) ?? 0,
      y: pxNum(style["top"]) ?? 0,
      w: pxNum(style["width"]) ?? 0,
      h: pxNum(style["height"]) ?? 0,
    },
    keys,
    important,
  };
}

function extractStyle(style: StyleMap): {
  layerStyle: LayerStyle;
  transform?: import("./types").LayerTransform;
  extras: Record<string, string>;
} {
  const layerStyle: LayerStyle = {};
  const extras: Record<string, string> = {};
  let transform: import("./types").LayerTransform | undefined;

  for (const [k, v] of Object.entries(style)) {
    switch (k) {
      case "left":
      case "top":
      case "width":
      case "height":
      case "position":
        // Handled by frame or implicit (position:absolute is the default
        // for all .dragable layers — we reassert it on serialize).
        break;
      case "transform": {
        const t = parseTransform(v);
        if (t) {
          transform = { ...(transform || {}), ...t };
        } else {
          // Couldn't cleanly decompose — preserve verbatim so the
          // source rendering isn't lost on roundtrip.
          extras[k] = v;
        }
        break;
      }
      case "transform-origin": {
        const o = parseTransformOrigin(v);
        if (o) {
          transform = { ...(transform || {}), ...o };
        } else {
          extras[k] = v;
        }
        break;
      }
      case "z-index": {
        const n = pxNum(v);
        if (n != null) layerStyle.zIndex = n;
        else extras[k] = v;
        break;
      }
      case "opacity": {
        const n = parseFloat(v);
        if (!Number.isNaN(n)) layerStyle.opacity = n;
        else extras[k] = v;
        break;
      }
      case "mix-blend-mode":
        layerStyle.blendMode = v as LayerStyle["blendMode"];
        break;
      case "background":
      case "background-color":
        layerStyle.background = v;
        break;
      case "border":
        layerStyle.border = v;
        break;
      case "filter":
        layerStyle.filter = v;
        break;
      case "clip-path":
        layerStyle.clipPath = v;
        break;
      default:
        extras[k] = v;
    }
  }
  return { layerStyle, transform, extras };
}

/** Is this element laid out in normal flow (no inline abs positioning)?
 *  A flow-level `.dragable` that wraps other `.dragable` children is a
 *  section (PowerPoint-style page region) — its children position
 *  themselves within its local coord space. Parser promotes such
 *  elements to SectionLayer so the flow-guard invariants are explicit
 *  at the type level, not just computed at runtime. */
function isFlowSection(el: Element): boolean {
  const style = parseStyle(el.getAttribute("style"));
  const hasInlineAbs =
    style["position"] != null || style["left"] != null || style["top"] != null;
  if (hasInlineAbs) return false;
  // Flow-positioned `.dragable` is a section regardless of whether it
  // has inner dragables — the flow-guard semantics apply identically
  // ("no drag/resize, no frame mutation, no position keys on export").
  // Labeling it a section at the type layer makes this explicit to
  // downstream code and to the LayerPanel UX.
  return true;
}

/** Detect the most specific LayerType for a `.dragable` element. */
function detectType(el: Element): Layer["type"] {
  const classes = classList(el);
  for (const p of PLUGIN_CLASS_TYPE) {
    if (classes.includes(p.cls)) return p.type;
  }
  if (hasClass(el, GROUP_CLASS)) return "group";

  // Section — flow-laid dragable with dragable children. Tested BEFORE
  // image/box heuristics because a section can have nested <img> or
  // plain text content that would otherwise mislead the type detector.
  if (isFlowSection(el)) return "section";

  // Image: contains exactly one <img> and no other visible structural content.
  const imgs = el.querySelectorAll("img");
  if (imgs.length === 1) {
    // Count structural children besides the img and its ancestors within el
    const structural = el.querySelectorAll(
      "div:not(.de-resize-handle):not(.de-selected), section, article, p, h1, h2, h3, h4, h5, h6, ul, ol, table, form",
    );
    if (structural.length === 0) return "image";
  }

  // Text: if the element has the legacy marker class, or its text-only
  // content with no nested structural blocks.
  if (classes.includes("sol-replacible-text") || classes.includes("sol-replacible-word")) {
    return "text";
  }
  const structural = el.querySelectorAll(
    "div:not(.de-resize-handle):not(.de-selected), section, article, ul, ol, table, form, header, nav, footer",
  );
  if (structural.length === 0) {
    // Contains only inline/text content — still classify as "box" rather
    // than "text" to avoid misclassifying simple styled boxes. "text" is
    // reserved for elements that the editor explicitly marks as TipTap targets.
    // (Tier 2: promote obvious h1/p-only cases to TextLayer.)
    return "box";
  }

  return "box";
}

/* ─── Per-type builders ─── */

function buildImageLayer(el: Element, id: string, name: string): ImageLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);

  const img = el.querySelector("img");
  const a = el.querySelector("a");

  const layer: ImageLayer = {
    id,
    name,
    type: "image",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    src: img?.getAttribute("src") ?? "",
    alt: img?.getAttribute("alt") ?? undefined,
    innerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
  if (a) {
    layer.href = a.getAttribute("href") ?? undefined;
    layer.hrefTarget = a.getAttribute("target") ?? undefined;
  }
  return layer;
}

function buildPluginLayer(
  el: Element,
  id: string,
  name: string,
  type: PluginLayer["type"],
): PluginLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    legacyInnerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildBoxLayer(el: Element, id: string, name: string): BoxLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "box",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    innerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildTextLayer(el: Element, id: string, name: string): TextLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "text",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    html: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildSectionLayer(
  el: Element,
  id: string,
  name: string,
): SectionLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  // Guard: sections must never have position/left/top in frameKeys.
  // Strip them if present (shouldn't be, since isFlowSection rejects
  // elements with inline position) — defense-in-depth for the
  // invariant the editor-store flow-guard relies on.
  const safeKeys = frameKeys.filter((k) => k !== "position" && k !== "left" && k !== "top");
  const safeImp = frameImportant.filter((k) => k !== "position" && k !== "left" && k !== "top");
  return {
    id,
    name,
    type: "section",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    innerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: safeKeys.length ? safeKeys : undefined,
    frameImportant: safeImp.length ? safeImp : undefined,
  };
}

function buildGroupLayer(
  el: Element,
  id: string,
  name: string,
  children: Layer[],
): GroupLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "group",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    children,
    legacyClassName: el.getAttribute("class") ?? `${GROUP_CLASS} ${DRAGABLE_CLASS}`,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

/* ─── Tree walk ─── */

function ensureId(el: Element): string {
  const existing = el.getAttribute("id");
  if (existing) return existing;
  const generated = newLayerId();
  el.setAttribute("id", generated);
  return generated;
}

function suggestName(type: Layer["type"], idx: number): string {
  const label: Record<Layer["type"], string> = {
    group: "그룹",
    section: "섹션",
    text: "텍스트",
    image: "이미지",
    box: "박스",
    shape: "도형",
    board: "게시판",
    product: "상품",
    exhibition: "전시",
    menu: "메뉴",
    login: "로그인",
    mail: "메일",
  };
  return `${label[type]} ${idx}`;
}

/** Given a parent element, return the direct `.dragable` child
 *  layers (skipping non-layer siblings like stray text nodes). */
function directLayerChildren(parent: Element): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < parent.children.length; i++) {
    const c = parent.children[i]!;
    if (hasClass(c, DRAGABLE_CLASS)) out.push(c);
  }
  return out;
}

function elementToLayer(el: Element, nameIdx: { n: number }): Layer {
  const id = ensureId(el);
  const type = detectType(el);
  const name = suggestName(type, ++nameIdx.n);

  switch (type) {
    case "group": {
      const childEls = directLayerChildren(el);
      const children = childEls.map((c) => elementToLayer(c, nameIdx));
      return buildGroupLayer(el, id, name, children);
    }
    case "section":
      // Tier-1 (9b): section preserves innerHtml as an opaque blob —
      // no typed children yet. Any nested `.dragable` descendants
      // remain inside innerHtml and will be parseable by a Tier-2
      // promotion pass (Sprint 9c). This keeps decorative non-dragable
      // markup (section titles, SVG backgrounds, wrapper divs) intact.
      return buildSectionLayer(el, id, name);
    case "image":
      return buildImageLayer(el, id, name);
    case "text":
      return buildTextLayer(el, id, name);
    case "board":
    case "product":
    case "exhibition":
    case "menu":
    case "login":
    case "mail":
      return buildPluginLayer(el, id, name, type);
    case "shape":
      // Shape is a Tier-2 type; never parsed from legacy HTML today.
      return buildBoxLayer(el, id, name) as unknown as Layer;
    case "box":
    default:
      return buildBoxLayer(el, id, name);
  }
}

/* ─── Public API ─── */

export function legacyHtmlToScene(html: string): SceneGraph {
  const body = parseBodyFragment(html);
  const topEls = directLayerChildren(body);
  const nameIdx = { n: 0 };
  const children = topEls.map((c) => elementToLayer(c, nameIdx));
  const root: GroupLayer = {
    id: ROOT_GROUP_ID,
    name: "페이지",
    type: "group",
    visible: true,
    locked: false,
    frame: { x: 0, y: 0, w: 0, h: 0 },
    style: {},
    children,
    virtual: true,
  };
  return { version: 1, root };
}
