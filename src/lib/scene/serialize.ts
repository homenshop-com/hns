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
  TextLayer,
  isGroup,
} from "./types";
import { StyleMap, printStyle } from "./parse-style";

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
    ensure(DRAGABLE_CLASS);
  }
  return existing.join(" ");
}

function buildStyleMap(layer: Layer): StyleMap {
  const { frame, style } = layer;
  const out: StyleMap = {};

  out["position"] = "absolute";
  if (frame.x || frame.x === 0) out["left"] = `${frame.x}px`;
  if (frame.y || frame.y === 0) out["top"] = `${frame.y}px`;
  if (frame.w) out["width"] = `${frame.w}px`;
  if (frame.h) out["height"] = `${frame.h}px`;

  if (style.zIndex != null) out["z-index"] = String(style.zIndex);
  if (style.opacity != null && style.opacity !== 1) out["opacity"] = String(style.opacity);
  if (style.blendMode && style.blendMode !== "normal") out["mix-blend-mode"] = style.blendMode;
  if (style.background) out["background"] = style.background;
  if (style.border) out["border"] = style.border;
  if (style.filter) out["filter"] = style.filter;
  if (style.clipPath) out["clip-path"] = style.clipPath;

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
  const altAttr = layer.alt != null ? ` alt="${escapeAttr(layer.alt)}"` : "";
  const imgTag = `<img src="${escapeAttr(layer.src)}"${altAttr}>`;
  if (layer.href) {
    const target = layer.hrefTarget
      ? ` target="${escapeAttr(layer.hrefTarget)}"`
      : "";
    return `<a href="${escapeAttr(layer.href)}"${target}>${imgTag}</a>`;
  }
  return imgTag;
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

function serializeLayer(layer: Layer): string {
  if (isGroup(layer)) {
    if (layer.virtual) {
      return layer.children.map(serializeLayer).join("");
    }
    const attrs = buildAttrString(layer);
    const inner = layer.children.map(serializeLayer).join("");
    return `<div ${attrs}>${inner}</div>`;
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
