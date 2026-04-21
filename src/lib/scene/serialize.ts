/**
 * sceneToLegacyHtml — Serialize a SceneGraph back to the legacy HTML
 * shape consumed by the Next.js `published` route and the PHP publisher.
 *
 * Output contract:
 * - Every leaf layer is a `<div class="... dragable" id="..." style="...">…</div>`.
 * - Every group (unless `virtual`) is a `<div class="de-group dragable" ...>…children…</div>`.
 *   The group wrapper uses `position:absolute` so the legacy publisher
 *   positions it correctly; children inside remain absolute to the group.
 * - The root group (virtual by default) emits its children directly with
 *   no wrapper — this matches the existing body-innerHTML contract.
 * - Style keys are written in a deterministic order so roundtrip tests
 *   are byte-stable.
 *
 * Escaping:
 * - Attribute values are HTML-escaped.
 * - `innerHtml` / `legacyInnerHtml` / TextLayer.html are passed through
 *   verbatim (they are editor-managed HTML, not user-untrusted input at
 *   this layer — trust the upstream that produced them).
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
  LayerTransform,
  MOBILE_BREAKPOINT,
  PluginLayer,
  SceneGraph,
  SectionLayer,
  TextLayer,
  hasTypedChildren,
  isGroup,
  isInline,
  isSection,
} from "./types";
import { StyleMap, printStyle } from "./parse-style";
import { printTransform, printTransformOrigin } from "./parse-transform";

const STYLE_KEY_ORDER = [
  "position",
  "left",
  "top",
  "width",
  "height",
  "z-index",
  "opacity",
  "mix-blend-mode",
  "background",
  "background-color",
  "border",
  "filter",
  "clip-path",
  "transform",
  "transform-origin",
  "margin",
];

const ATTR_KEY_ORDER = ["id", "class", "style"];

function escapeAttr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildClassName(layer: Layer): string {
  const existing = (layer.legacyClassName || "").split(/\s+/).filter(Boolean);
  const ensure = (cls: string) => {
    if (!existing.includes(cls)) existing.push(cls);
  };
  if (isGroup(layer) && !layer.virtual) {
    ensure(GROUP_CLASS);
    ensure(DRAGABLE_CLASS);
  } else if (isInline(layer)) {
    // Inline layers preserve their source classes verbatim — they were
    // never `.dragable` in the template and adding the class would
    // reshape them for CSS that targets `.dragable > *`.
  } else if (!isGroup(layer)) {
    // Sections and leaves both carry `dragable` so the legacy
    // publisher and selectors continue to recognize them. Sections
    // do NOT get `de-group` (they're structural flow regions, not
    // floating editor groups).
    ensure(DRAGABLE_CLASS);
  }
  return existing.join(" ");
}

function buildStyleMap(layer: Layer): StyleMap {
  const { frame, style } = layer;
  const out: StyleMap = {};

  // Only emit positional/sizing keys the source explicitly had (or that
  // the editor has since added by dragging/resizing). This preserves
  // layouts that rely entirely on CSS (no inline left/top/width/height),
  // which is common in custom templates.
  // Sections (Sprint 9b): enforce the flow invariant at serialize time
  // too — position/left/top are stripped even if they somehow made it
  // into a section's frameKeys. defense-in-depth for the flow guard.
  const rawKeys = layer.frameKeys ?? [];
  const keys = isSection(layer)
    ? rawKeys.filter((k) => k !== "position" && k !== "left" && k !== "top")
    : rawKeys;
  const imp = new Set(layer.frameImportant ?? []);
  const mark = (k: "position" | "left" | "top" | "width" | "height", v: string) =>
    imp.has(k) ? `${v} !important` : v;
  if (keys.includes("position")) out["position"] = mark("position", "absolute");
  if (keys.includes("left")) out["left"] = mark("left", `${frame.x}px`);
  if (keys.includes("top")) out["top"] = mark("top", `${frame.y}px`);
  if (keys.includes("width")) out["width"] = mark("width", `${frame.w}px`);
  if (keys.includes("height")) out["height"] = mark("height", `${frame.h}px`);

  if (style.zIndex != null) out["z-index"] = String(style.zIndex);
  if (style.opacity != null && style.opacity !== 1) out["opacity"] = String(style.opacity);
  if (style.blendMode && style.blendMode !== "normal") out["mix-blend-mode"] = style.blendMode;
  if (style.background) out["background"] = style.background;
  if (style.border) out["border"] = style.border;
  if (style.filter) out["filter"] = style.filter;
  if (style.clipPath) out["clip-path"] = style.clipPath;

  // Transform (rotate / scale) — only emitted when non-identity.
  const tfm = printTransform(layer.transform);
  if (tfm) out["transform"] = tfm;
  const tfo = printTransformOrigin(layer.transform);
  if (tfo) out["transform-origin"] = tfo;

  // Allow extras to override (preserves margin:auto etc. from legacy import).
  if (layer.legacyStyleExtras) {
    for (const [k, v] of Object.entries(layer.legacyStyleExtras)) out[k] = v;
  }

  return out;
}

function buildAttrString(layer: Layer): string {
  const parts: string[] = [];
  const cls = buildClassName(layer);
  const styleStr = printStyle(buildStyleMap(layer), STYLE_KEY_ORDER);

  // Start with standard ordered attrs.
  const emitted = new Set<string>();
  const emit = (k: string, v: string) => {
    if (emitted.has(k)) return;
    emitted.add(k);
    parts.push(`${k}="${escapeAttr(v)}"`);
  };

  emit("id", layer.id);
  if (cls) emit("class", cls);
  if (styleStr) emit("style", styleStr);

  // Extra legacy attributes preserved from import.
  if (layer.legacyAttrs) {
    const keys = Object.keys(layer.legacyAttrs).sort();
    for (const k of keys) {
      if (ATTR_KEY_ORDER.includes(k)) continue;
      emit(k, layer.legacyAttrs[k]!);
    }
  }

  return parts.join(" ");
}

/* ─── Per-type inner HTML ─── */

function serializeImageInner(layer: ImageLayer): string {
  // Prefer the preserved innerHTML — it retains img-level styles, classes,
  // and any `<a>` wrapper verbatim. The typed src/alt/href fields are for
  // editor UI; editor-level mutations must rewrite innerHtml in parallel.
  return layer.innerHtml ?? "";
}

function serializeTextInner(layer: TextLayer): string {
  return layer.html ?? "";
}

function serializeBoxInner(layer: BoxLayer): string {
  return layer.innerHtml ?? "";
}

function serializePluginInner(layer: PluginLayer): string {
  return layer.legacyInnerHtml ?? "";
}

function serializeSectionInner(layer: SectionLayer): string {
  // Sprint 9c Tier-2: replace each `<!--scene-child:${id}-->` placeholder
  // in the shell template with the rendered HTML of the matching typed
  // child. Any non-placeholder markup (decorative wrappers, titles, SVG
  // backgrounds) is passed through verbatim for perfect round-trip.
  // If a child's placeholder is missing (e.g. editor deleted the
  // comment by mistake), the child is still appended at the end so
  // nothing silently disappears from the document.
  let html = layer.innerHtml ?? "";
  const appended: string[] = [];
  for (const child of layer.children ?? []) {
    const marker = `<!--scene-child:${child.id}-->`;
    const rendered = serializeLayer(child);
    if (html.includes(marker)) {
      html = html.replace(marker, rendered);
    } else {
      appended.push(rendered);
    }
  }
  // Strip any orphaned placeholders (e.g. a child was deleted from the
  // scene graph — the comment should go with it).
  html = html.replace(/<!--scene-child:[^>]*-->/g, "");
  return html + appended.join("");
}

function serializeInline(layer: InlineLayer): string {
  // Inline layers emit using their ORIGINAL tag — no wrapping div, no
  // enforced position styles, no DRAGABLE_CLASS injection. They are
  // flow-inline text/link elements authored as span/a/strong/etc. in
  // legacy templates. All style keys are preserved via
  // legacyStyleExtras (not through buildStyleMap, which would filter
  // positional keys — inappropriate for flow-inline elements).
  const parts: string[] = [];
  const emitted = new Set<string>();
  const emit = (k: string, v: string) => {
    if (emitted.has(k)) return;
    emitted.add(k);
    parts.push(`${k}="${escapeAttr(v)}"`);
  };
  emit("id", layer.id);
  // Preserve legacyClassName verbatim — including empty string, which
  // real templates (TipTap-authored) commonly emit and the realpage
  // roundtrip test compares byte-for-byte.
  if (layer.legacyClassName !== undefined) emit("class", layer.legacyClassName);
  const styleMap: StyleMap = { ...(layer.legacyStyleExtras ?? {}) };
  const styleStr = printStyle(styleMap, STYLE_KEY_ORDER);
  if (styleStr) emit("style", styleStr);
  if (layer.legacyAttrs) {
    const keys = Object.keys(layer.legacyAttrs).sort();
    for (const k of keys) {
      if (ATTR_KEY_ORDER.includes(k)) continue;
      emit(k, layer.legacyAttrs[k]!);
    }
  }
  const tag = layer.tag || "span";
  const attrStr = parts.join(" ");
  return `<${tag}${attrStr ? " " + attrStr : ""}>${layer.innerHtml ?? ""}</${tag}>`;
}

function serializeLayer(layer: Layer): string {
  if (isGroup(layer)) {
    if (layer.virtual) {
      return layer.children.map(serializeLayer).join("");
    }
    const attrs = buildAttrString(layer);
    const inner = layer.children.map(serializeLayer).join("");
    return `<div ${attrs}>${inner}</div>`;
  }
  if (isSection(layer)) {
    const attrs = buildAttrString(layer);
    return `<div ${attrs}>${serializeSectionInner(layer)}</div>`;
  }
  if (isInline(layer)) {
    return serializeInline(layer);
  }
  const attrs = buildAttrString(layer);
  let inner = "";
  switch (layer.type) {
    case "image":
      inner = serializeImageInner(layer);
      break;
    case "text":
      inner = serializeTextInner(layer);
      break;
    case "box":
      inner = serializeBoxInner(layer);
      break;
    case "board":
    case "product":
    case "exhibition":
    case "menu":
    case "login":
    case "mail":
      inner = serializePluginInner(layer);
      break;
    case "shape":
      // Tier 2 — until then, treat as empty box.
      inner = "";
      break;
  }
  return `<div ${attrs}>${inner}</div>`;
}

/* ─── Public API ─── */

/**
 * Serialize the entire scene to the body-innerHTML format stored in
 * `Page.content.html`.
 */
export function sceneToLegacyHtml(scene: SceneGraph): string {
  // Root is a virtual group by convention → children joined without wrapper.
  const root: GroupLayer = {
    ...scene.root,
    virtual: true,
  };
  return serializeLayer(root);
}

/** Convenience: serialize a single layer (used by clipboard / AI). */
export function serializeLayerHtml(layer: Layer): string {
  return serializeLayer(layer);
}

/* ═══════════════════════════════════════════════════════════════════
 *  Mobile viewport override → @media CSS block
 * ═══════════════════════════════════════════════════════════════════
 *
 * Desktop positioning lives in each layer's inline `style=""` attribute
 * (emitted by buildStyleMap above). Mobile positioning is emitted here
 * as a single `@media (max-width: 768px) { #id { … !important } }`
 * block that the caller appends to the page CSS. !important is required
 * because the inline desktop styles have higher specificity than a
 * normal media query rule.
 *
 * Sections get width/height overrides only (flow-guard invariant —
 * never position/left/top on a section). Everything else can get all
 * five positional keys plus transform.
 */

const MOBILE_FRAME_COMMENT_MARK = "/* SCENE-MOBILE-OVERRIDES */";

function serializeMobileRule(layer: Layer): string | null {
  const frameKeys = new Set(layer.mobileFrameKeys ?? []);
  const frame = layer.mobileFrame;
  const transform: LayerTransform | undefined = layer.mobileTransform;

  const declarations: string[] = [];
  if (frame) {
    // Sections: strip position-like keys (flow guard).
    const allowed = isSection(layer)
      ? (["width", "height"] as const)
      : (["position", "left", "top", "width", "height"] as const);
    for (const k of allowed) {
      if (!frameKeys.has(k)) continue;
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
  if (declarations.length === 0) return null;
  return `  #${cssIdentifier(layer.id)} { ${declarations.join(" ")} }`;
}

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

/**
 * Serialize every layer's mobile override into a single `@media` CSS
 * block, or return an empty string if no overrides exist.
 *
 * Called by the editor on save alongside `sceneToLegacyHtml`. The block
 * should be appended to the page's CSS so the published route includes
 * it unchanged.
 */
export function sceneToMobileCss(scene: SceneGraph): string {
  const layers: Layer[] = [];
  collectAllLayers(scene.root as GroupLayer, layers);
  const rules: string[] = [];
  for (const l of layers) {
    const rule = serializeMobileRule(l);
    if (rule) rules.push(rule);
  }
  if (rules.length === 0) return "";
  return [
    MOBILE_FRAME_COMMENT_MARK,
    `@media (max-width: ${MOBILE_BREAKPOINT}px) {`,
    ...rules,
    `}`,
  ].join("\n");
}

/** Strip an existing mobile-overrides block from pageCss so a fresh one
 *  can replace it. Used by the editor's save path to keep the CSS clean
 *  across re-saves. */
export function stripMobileCssBlock(css: string): string {
  // Remove everything from the marker through the matching closing brace.
  // Conservative regex — keys on the exact marker we write on every save.
  const pattern = new RegExp(
    `\\s*${escapeRegex(MOBILE_FRAME_COMMENT_MARK)}[\\s\\S]*?\\n\\}\\s*`,
    "g",
  );
  return css.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
