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
  InlineLayer,
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

/** Read `data-hns-interaction="{...json}"` into a typed LayerInteraction.
 *  Silently drops malformed payloads — safer than crashing page load. */
function extractInteraction(el: Element): import("./types").LayerInteraction | undefined {
  const raw = el.getAttribute("data-hns-interaction");
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as import("./types").LayerInteraction;
    if (!parsed || typeof parsed !== "object") return undefined;
    const kind = (parsed as { kind?: string }).kind;
    if (
      kind !== "link" &&
      kind !== "scrollTo" &&
      kind !== "modal" &&
      kind !== "toggle"
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
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
      case "border-color":
        layerStyle.borderColor = v;
        break;
      case "border-width":
        layerStyle.borderWidth = v;
        break;
      case "border-style":
        layerStyle.borderStyle = v as LayerStyle["borderStyle"];
        break;
      case "border-radius":
        layerStyle.borderRadius = v;
        break;
      case "box-shadow":
        layerStyle.boxShadow = v;
        break;
      case "color":
        layerStyle.color = v;
        break;
      case "font-family":
        layerStyle.fontFamily = v;
        break;
      case "font-size":
        layerStyle.fontSize = v;
        break;
      case "font-weight":
        layerStyle.fontWeight = v;
        break;
      case "line-height":
        layerStyle.lineHeight = v;
        break;
      case "letter-spacing":
        layerStyle.letterSpacing = v;
        break;
      case "text-align":
        layerStyle.textAlign = v as LayerStyle["textAlign"];
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

/** Is this element laid out in normal flow AND a container for other
 *  typed children (dragables or legacy `el_*` inline elements)?
 *
 *  Sprint 9f — previously every flow dragable was a section, which
 *  blocked users from moving/resizing atomic children inside AI-
 *  generated sites. Now the section guard only fires for real
 *  containers — ones with dragable descendants (modern AI sites) or
 *  legacy `id="el_*"` inline children (PHP-era templates). Atomic
 *  flow dragables with neither kind of child (e.g. a single-button
 *  wrapper) fall through to image/text/box detection and become
 *  regular editable layers that the editor can freely reposition. */
function isFlowSection(el: Element): boolean {
  const style = parseStyle(el.getAttribute("style"));
  // Reject only ABSOLUTE/FIXED positioning — `position: relative` is a
  // legit pattern for section wrappers that establish a positioning
  // context for absolute-positioned chips/badges inside them (hero
  // sections, banner sections, etc.). Before this fix, ANY inline
  // `position` disqualified the element from section-hood, which made
  // the parser treat the hero wrapper as an atomic box; editor-sync
  // then forced `position: absolute` on it (see applyFrameToEl), taking
  // the hero out of flow and collapsing its min-height — the exact
  // symptom reproduced in Plus Academy after a save round-trip.
  const pos = style["position"];
  const posVal = pos ? pos.replace(/\s*!\s*important\s*$/i, "").trim() : "";
  const hasAbsolute = posVal === "absolute" || posVal === "fixed";
  const hasInlineCoords = style["left"] != null || style["top"] != null;
  if (hasAbsolute || hasInlineCoords) return false;
  // Modern AI sites: section = flow dragable containing other dragables.
  if (el.querySelector(`.${DRAGABLE_CLASS}`) !== null) return true;
  // Legacy PHP templates: section = flow dragable containing `id="el_*"`
  // inline spans/anchors (which get promoted to InlineLayer downstream).
  const inlineCandidates = el.querySelectorAll("[id^='el_']");
  for (let i = 0; i < inlineCandidates.length; i++) {
    if (EL_ID_RE.test(inlineCandidates[i]!.getAttribute("id") || "")) return true;
  }
  return false;
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
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
  const interaction = extractInteraction(el);
  if (interaction) layer.interaction = interaction;
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
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type,
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    ...(interaction && { interaction }),
    legacyInnerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildBoxLayer(el: Element, id: string, name: string): BoxLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type: "box",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    ...(interaction && { interaction }),
    innerHtml: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildTextLayer(el: Element, id: string, name: string): TextLayer {
  const style = parseStyle(el.getAttribute("style"));
  const { frame, keys: frameKeys, important: frameImportant } = extractFrame(style);
  const { layerStyle, transform, extras } = extractStyle(style);
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type: "text",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    ...(interaction && { interaction }),
    html: el.innerHTML,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: frameKeys.length ? frameKeys : undefined,
    frameImportant: frameImportant.length ? frameImportant : undefined,
  };
}

function buildSectionLayer(
  el: Element,
  id: string,
  name: string,
  children: Layer[],
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
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type: "section",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    ...(interaction && { interaction }),
    // innerHtml is the shell template populated by elementToLayer
    // BEFORE this builder runs — child .dragable descendants have
    // already been swapped for <!--scene-child:${id}--> comments.
    innerHtml: el.innerHTML,
    children,
    legacyClassName: el.getAttribute("class") ?? DRAGABLE_CLASS,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    frameKeys: safeKeys.length ? safeKeys : undefined,
    frameImportant: safeImp.length ? safeImp : undefined,
  };
}

/** Collect topmost `.dragable` descendants under `root` — descending
 *  into non-dragable wrappers but stopping at each dragable found. */
function collectTopmostDragables(root: Element, out: Element[]): void {
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (hasClass(c, DRAGABLE_CLASS)) {
      out.push(c);
    } else {
      collectTopmostDragables(c, out);
    }
  }
}

/** Does this element look like a legacy-designer inline object? The
 *  PHP designer tagged each editable text sub-element of a section
 *  with `id="el_<timestamp>_<suffix>"`. We promote these to InlineLayer
 *  so the LayerPanel can select/rename them individually. */
const EL_ID_RE = /^el_[0-9a-z_]+$/i;
function isInlineCandidate(el: Element): boolean {
  if (hasClass(el, DRAGABLE_CLASS)) return false;
  const id = el.getAttribute("id") || "";
  if (!EL_ID_RE.test(id)) return false;
  // Skip elements that contain another inline candidate or a dragable —
  // they'd be extracted as their own layer and this one would end up
  // hollow. Keep only innermost / leaf-ish inline wrappers with real
  // content.
  // (We allow arbitrary markup inside — spans w/ SVG icons, etc.)
  return true;
}

/** Walk `root` collecting both `.dragable` topmost descendants AND
 *  inline candidates (legacy `id="el_*"` text objects). Each found
 *  element is a terminator — the walk does not descend into it. */
function collectSectionChildren(root: Element, out: Element[]): void {
  for (let i = 0; i < root.children.length; i++) {
    const c = root.children[i]!;
    if (hasClass(c, DRAGABLE_CLASS) || isInlineCandidate(c)) {
      out.push(c);
    } else {
      collectSectionChildren(c, out);
    }
  }
}

/** Friendly name for an inline layer, derived from its className
 *  (`hero-title`, `btn-primary`, ...) when available. Falls back to
 *  the tag name + index. */
function suggestInlineName(el: Element, idx: number): string {
  const classes = classList(el);
  for (const cls of classes) {
    // Skip generic utility classes and our own markers.
    if (/^(el_|de-|sol-)/i.test(cls)) continue;
    if (cls.length < 2) continue;
    return cls;
  }
  return `${el.tagName.toLowerCase()} ${idx}`;
}

function buildInlineLayer(el: Element, id: string, name: string): InlineLayer {
  const style = parseStyle(el.getAttribute("style"));
  // Inline layers preserve ALL style keys verbatim via legacyStyleExtras.
  // Unlike absolute-positioned dragables, `left`/`top`/`width`/`height`
  // on an inline element are CSS flow tweaks (e.g. `width: 250px` on a
  // thumbnail span, `left: -6px` as a nudge for kerning/alignment) —
  // NOT absolute positioning. Passing the map straight through avoids
  // extractStyle's positional filter dropping them on roundtrip.
  const extras: Record<string, string> = { ...style };
  // `class=""` is meaningless but templates written by TipTap often
  // carry it; preserve it literally so realpage roundtrip stays byte-
  // stable.
  const classAttr = el.getAttribute("class");
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type: "inline",
    visible: true,
    locked: false,
    // Flow-inline — frame is not meaningful. Kept as a zero rect for
    // uniformity with BaseLayer; editor UI hides frame controls.
    frame: { x: 0, y: 0, w: 0, h: 0 },
    style: {},
    tag: el.tagName.toLowerCase(),
    innerHtml: el.innerHTML,
    ...(interaction && { interaction }),
    ...(classAttr != null && { legacyClassName: classAttr }),
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
    legacyStyleExtras: Object.keys(extras).length ? extras : undefined,
    // No frameKeys — inline layers must never emit position styles.
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
  const interaction = extractInteraction(el);
  return {
    id,
    name,
    type: "group",
    visible: true,
    locked: false,
    frame,
    style: layerStyle,
    ...(transform && { transform }),
    ...(interaction && { interaction }),
    children,
    legacyClassName: el.getAttribute("class") ?? `${GROUP_CLASS} ${DRAGABLE_CLASS}`,
    legacyAttrs: getAttrs(el, new Set(["class", "style", "id", "data-hns-interaction"])),
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

const TYPE_LABEL: Record<Layer["type"], string> = {
  group: "그룹",
  section: "섹션",
  inline: "요소",
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

/**
 * Generate a layer label.
 *
 * Goal: at-a-glance recognition in the layer panel. Older versions
 * emitted just `{type} {globalCounter}` ("섹션 25") — the number was a
 * walk-order index that bore no relation to visual position, so the
 * panel showed e.g. "섹션 25" before "섹션 2" which confused users.
 *
 * New labeling (2026-04-25, type C — content-preview + position
 * fallback):
 *   1. Try a content preview from the element's text / alt / first
 *      heading — caps at ~24 chars, returns `${typeLabel} <preview>`.
 *   2. If no usable preview (empty section / shape / decorative box),
 *      fall back to `${typeLabel} ${idx}` so the user still has a
 *      stable identifier.
 *
 * Manual renames (LayerPanel inline edit → store.rename) take
 * precedence at runtime — this function only seeds defaults.
 */
function suggestName(type: Layer["type"], idx: number, el?: Element): string {
  const typeLabel = TYPE_LABEL[type];
  const preview = el ? extractContentPreview(type, el) : "";
  if (preview) return `${typeLabel} · ${preview}`;
  return `${typeLabel} ${idx}`;
}

/** Pick the most identifying snippet for a layer's content. Different
 *  layer types have different "primary" content — a section's first
 *  heading vs. an image's alt vs. a text leaf's full text. */
function extractContentPreview(type: Layer["type"], el: Element): string {
  const cap = (s: string, n = 24): string => {
    const t = s.replace(/\s+/g, " ").trim();
    if (!t) return "";
    return t.length > n ? `${t.slice(0, n)}…` : t;
  };

  switch (type) {
    case "image": {
      const img = el.querySelector("img");
      const alt = img?.getAttribute("alt")?.trim();
      if (alt) return cap(alt);
      const src = img?.getAttribute("src") ?? "";
      // Pull a meaningful filename: strip path, strip extension, replace
      // hyphens/underscores with spaces.
      const file = src.split("/").pop()?.split("?")[0] ?? "";
      const stem = file.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ");
      // Skip UUID-ish stems — they're noise.
      if (stem && !/^[0-9a-f-]{20,}$/i.test(stem)) return cap(stem);
      return "";
    }
    case "text": {
      // Prefer first heading > first paragraph > raw text.
      const h = el.querySelector("h1, h2, h3, h4, h5, h6");
      if (h?.textContent?.trim()) return cap(h.textContent);
      const p = el.querySelector("p");
      if (p?.textContent?.trim()) return cap(p.textContent);
      return cap(el.textContent ?? "");
    }
    case "section":
    case "group": {
      // Surface the section/group's most prominent text — the first
      // heading inside, then first text leaf.
      const h = el.querySelector("h1, h2, h3, h4, h5, h6");
      if (h?.textContent?.trim()) return cap(h.textContent);
      const t = el.querySelector("p, span, a, li");
      if (t?.textContent?.trim()) return cap(t.textContent);
      return "";
    }
    case "box": {
      // Box can be a button (text inside) or a wrapper around an image.
      // Prefer text content; fall back to inner img alt.
      const txt = el.textContent?.trim();
      if (txt) return cap(txt);
      const img = el.querySelector("img");
      const alt = img?.getAttribute("alt")?.trim();
      if (alt) return cap(alt);
      return "";
    }
    case "shape":
    case "inline":
    case "menu":
    case "login":
    case "mail": {
      const txt = el.textContent?.trim();
      return txt ? cap(txt) : "";
    }
    case "board":
    case "product":
    case "exhibition":
      return ""; // Plugin types have no useful inline preview.
  }
  return "";
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
  const name = suggestName(type, ++nameIdx.n, el);

  switch (type) {
    case "group": {
      const childEls = directLayerChildren(el);
      const children = childEls.map((c) => elementToLayer(c, nameIdx));
      return buildGroupLayer(el, id, name, children);
    }
    case "section": {
      // Tier-2 (9c) + Path-1 (9d): promote both topmost `.dragable`
      // descendants AND legacy `id="el_*"` inline elements to typed
      // children. Each is replaced with a `<!--scene-child:${id}-->`
      // placeholder comment in the shell template, so decorative
      // markup around them is preserved on round-trip.
      const childEls: Element[] = [];
      collectSectionChildren(el, childEls);
      const children: Layer[] = [];
      for (const ce of childEls) {
        let layer: Layer;
        if (hasClass(ce, DRAGABLE_CLASS)) {
          layer = elementToLayer(ce, nameIdx);
        } else {
          // Inline path: legacy el_* element.
          const cid = ensureId(ce);
          const cname = suggestInlineName(ce, ++nameIdx.n);
          layer = buildInlineLayer(ce, cid, cname);
        }
        const placeholder = el.ownerDocument!.createComment(`scene-child:${layer.id}`);
        ce.parentNode!.replaceChild(placeholder, ce);
        children.push(layer);
      }
      return buildSectionLayer(el, id, name, children);
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

/**
 * Walk the scene and populate `mobileFrame` / `mobileFrameKeys` /
 * `mobileTransform` on each layer from the `@media (max-width: 768px)`
 * block that `sceneToMobileCss` writes into pageCss on save.
 *
 * The block is emitted with a stable marker comment so we can extract it
 * cheaply without a full CSS parser.
 */
export function applyMobileCssToScene(scene: SceneGraph, pageCss: string): void {
  if (!pageCss || !pageCss.includes("SCENE-MOBILE-OVERRIDES")) return;
  // Extract the content between the marker and its matching closing brace.
  const blockMatch = pageCss.match(
    /\/\*\s*SCENE-MOBILE-OVERRIDES\s*\*\/\s*@media[^{]*\{([\s\S]*?)\n\}/,
  );
  if (!blockMatch) return;
  const body = blockMatch[1]!;

  // Match each `#id { decl; decl; }` rule. Ids written by the serializer
  // are CSS-escaped (backslashes before special chars). We allow both raw
  // and escaped ids since real ids in this codebase are alphanumeric +
  // underscore + dash.
  const ruleRe = /#([a-zA-Z0-9_\\-]+)\s*\{\s*([^}]*?)\s*\}/g;
  const byId = new Map<string, Record<string, string>>();
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(body)) !== null) {
    const id = m[1]!.replace(/\\/g, "");
    const decls = m[2]!;
    const map: Record<string, string> = {};
    for (const decl of decls.split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const prop = decl.slice(0, colon).trim().toLowerCase();
      let value = decl.slice(colon + 1).trim();
      // Strip the !important we always emit.
      value = value.replace(/\s*!important\s*$/i, "").trim();
      if (prop) map[prop] = value;
    }
    byId.set(id, map);
  }
  if (byId.size === 0) return;

  const pxInt = (v: string): number | undefined => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const assignMobile = (layer: Layer, decls: Record<string, string>) => {
    const mobileFrame: { x: number; y: number; w: number; h: number } = {
      x: layer.frame.x,
      y: layer.frame.y,
      w: layer.frame.w,
      h: layer.frame.h,
    };
    const keys = new Set<"position" | "left" | "top" | "width" | "height">();
    if ("position" in decls) keys.add("position");
    if ("left" in decls) {
      const n = pxInt(decls.left!);
      if (n !== undefined) mobileFrame.x = n;
      keys.add("left");
    }
    if ("top" in decls) {
      const n = pxInt(decls.top!);
      if (n !== undefined) mobileFrame.y = n;
      keys.add("top");
    }
    if ("width" in decls) {
      const n = pxInt(decls.width!);
      if (n !== undefined) mobileFrame.w = n;
      keys.add("width");
    }
    if ("height" in decls) {
      const n = pxInt(decls.height!);
      if (n !== undefined) mobileFrame.h = n;
      keys.add("height");
    }
    if (keys.size > 0) {
      layer.mobileFrame = mobileFrame;
      layer.mobileFrameKeys = Array.from(keys) as NonNullable<Layer["mobileFrameKeys"]>;
    }
    // Transform (rotate/origin) — parse the minimum we emit.
    if ("transform" in decls) {
      const val = decls.transform!;
      const rot = val.match(/rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/);
      const sx = val.match(/scaleX\(\s*(-?\d+(?:\.\d+)?)\s*\)/);
      const sy = val.match(/scaleY\(\s*(-?\d+(?:\.\d+)?)\s*\)/);
      const t: Record<string, number> = {};
      if (rot) t.rotate = parseFloat(rot[1]!);
      if (sx) t.scaleX = parseFloat(sx[1]!);
      if (sy) t.scaleY = parseFloat(sy[1]!);
      if (Object.keys(t).length > 0) layer.mobileTransform = t as NonNullable<Layer["mobileTransform"]>;
    }
  };

  const walk = (node: GroupLayer | import("./types").SectionLayer) => {
    for (const child of node.children) {
      const decls = byId.get(child.id);
      if (decls) assignMobile(child, decls);
      if (child.type === "group" || child.type === "section") {
        walk(child as GroupLayer);
      }
    }
  };
  walk(scene.root);
}
