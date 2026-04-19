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
  TextLayer,
} from "./types";
import { ROOT_GROUP_ID, newLayerId } from "./ids";
import { StyleMap, parseStyle, pxNum, hasImportant } from "./parse-style";

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
  extras: Record<string, string>;
} {
  const layerStyle: LayerStyle = {};
  const extras: Record<string, string> = {};

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
  return { layerStyle, extras };
}

/** Detect the most specific LayerType for a `.dragable` element. */
function detectType(el: Element): Layer["type"] {
  const classes = classList(el);
  for (const p of PLUGIN_CLASS_TYPE) {
    if (classes.includes(p.cls)) return p.type;
  }
  if (hasClass(el, GROUP_CLASS)) return "group";

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
  const { layerStyle, extras } = extractStyle(style);

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
  const { layerStyle, extras } = extractStyle(style);
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
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
  const { layerStyle, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "box",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
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
  const { layerStyle, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "text",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    html: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
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
  const { layerStyle, extras } = extractStyle(style);
  return {
    id,
    name,
    type: "group",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
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
