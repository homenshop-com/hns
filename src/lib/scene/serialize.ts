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
  Layer,
  LayerStyle,
  PluginLayer,
  SceneGraph,
  SectionLayer,
  TextLayer,
  isGroup,
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
  // Sprint 9b Tier-1: sections are innerHtml-opaque. Tier-2 (9c) will
  // promote inner .dragable descendants to first-class children.
  return layer.innerHtml ?? "";
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
