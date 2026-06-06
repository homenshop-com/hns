/**
 * editor-sync — Reconcile the V2 scene-graph store *into* the live
 * DOM-first canvas.
 *
 * The existing editor is DOM-first: drag/resize/TipTap write directly
 * into the `#hns_body` ref. The V2 scene graph is a parallel, typed
 * representation used by the LayerPanel. When the panel mutates scene
 * state (toggle visibility, lock, reorder, delete), the DOM must catch
 * up — otherwise the canvas would show stale state.
 *
 * This module is the one-way store→DOM bridge. DOM→store selection is
 * handled separately at the click-handler site.
 *
 * Invariants:
 *  - Only touch nodes with `.dragable` class. Never rewrite structural
 *    markup — that's the renderer's job.
 *  - All modifications are idempotent and tagged with `data-de-*`
 *    attributes so repeated calls don't compound side-effects, and a
 *    clean pass (scene says everything visible/unlocked) removes them.
 *  - Groups: walk recursively. Nested `.de-group.dragable` wrappers are
 *    respected but not required — flat bodies (most real pages today)
 *    work too.
 */

import {
  DRAGABLE_CLASS,
  GROUP_CLASS,
  hasTypedChildren,
  isSection,
  serializeLayerHtml,
  type GroupLayer,
  type Layer,
  type LayerId,
  type LayerStyle,
  type SceneGraph,
} from "@/lib/scene";
import { printTransform, printTransformOrigin } from "@/lib/scene/parse-transform";

/** Active editing device for the canvas preview. mutable-baking-falcon
 *  Phase 3/4 — extended from desktop/mobile to a 3-device model. Mirrors
 *  the store's `ViewportMode`. */
export type DeviceMode = "desktop" | "tablet" | "mobile";

/** A single cascade layer: a frame plus the set of props that are
 *  "active" (declared) at that level. */
type FrameLevel = { frame: import("@/lib/scene").LayerFrame; keys: Set<string> };

/** Build the device cascade (least→most specific) for a layer's geometry.
 *  Per-property resolution walks this most-specific-first so each prop
 *  takes its value from the narrowest device that declares it — exactly
 *  the cascade the published `@media` blocks produce. */
function frameCascade(layer: Layer, device: DeviceMode): FrameLevel[] {
  const levels: FrameLevel[] = [
    { frame: layer.frame, keys: new Set(layer.frameKeys ?? []) },
  ];
  if (device === "tablet" || device === "mobile") {
    if (layer.tabletFrame || layer.tabletFrameKeys) {
      levels.push({
        frame: layer.tabletFrame ?? layer.frame,
        keys: new Set(layer.tabletFrameKeys ?? []),
      });
    }
  }
  if (device === "mobile") {
    if (layer.mobileFrame || layer.mobileFrameKeys) {
      levels.push({
        frame: layer.mobileFrame ?? layer.frame,
        keys: new Set(layer.mobileFrameKeys ?? []),
      });
    }
  }
  return levels;
}

const HIDDEN_ATTR = "data-de-hidden";
const LOCKED_ATTR = "data-de-locked";
const HIDDEN_STYLE_OPACITY = "0.3";

/* ─── Helpers ─── */

function walk(root: GroupLayer, fn: (l: Layer) => void) {
  const recur = (node: Layer | GroupLayer) => {
    if (hasTypedChildren(node)) {
      for (const c of node.children) {
        fn(c);
        recur(c);
      }
    }
  };
  recur(root);
}

function collectIds(root: GroupLayer): Set<LayerId> {
  const out = new Set<LayerId>();
  walk(root, (l) => out.add(l.id));
  return out;
}

/* ─── Visibility / lock ─── */

/**
 * For every `.dragable` element in the container, apply visibility and
 * lock state derived from the scene. Elements not present in the scene
 * are cleaned of our attributes but otherwise untouched (see
 * `pruneOrphans` for deletion).
 */
export function applyVisibilityAndLock(
  scene: SceneGraph,
  container: HTMLElement,
) {
  const byId = new Map<LayerId, Layer>();
  walk(scene.root, (l) => byId.set(l.id, l));

  // Iterate by scene id (not just .dragable) so InlineLayer elements
  // — which are <span>/<a> with `id="el_*"` and no `.dragable` class —
  // also receive visibility/lock state.
  byId.forEach((layer, id) => {
    const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) return;

    // Visibility: we represent "hidden" as opacity:0.3 + pointer-events:none
    // in the editor (so users can still see and re-select the layer). The
    // published/serialized payload preserves the boolean; publisher can
    // choose to honor it literally (display:none) on the live site.
    if (!layer.visible) {
      if (!el.hasAttribute(HIDDEN_ATTR)) {
        el.setAttribute(HIDDEN_ATTR, "1");
        el.dataset.deHiddenPrevOpacity = el.style.opacity || "";
      }
      el.style.opacity = HIDDEN_STYLE_OPACITY;
    } else if (el.hasAttribute(HIDDEN_ATTR)) {
      el.removeAttribute(HIDDEN_ATTR);
      el.style.opacity = el.dataset.deHiddenPrevOpacity || "";
      delete el.dataset.deHiddenPrevOpacity;
    }

    // Lock: block pointer events on the element so drag/resize is
    // disabled, but leave children (TipTap etc.) alone.
    if (layer.locked) {
      if (!el.hasAttribute(LOCKED_ATTR)) {
        el.setAttribute(LOCKED_ATTR, "1");
        el.dataset.deLockedPrevPe = el.style.pointerEvents || "";
      }
      el.style.pointerEvents = "none";
    } else if (el.hasAttribute(LOCKED_ATTR)) {
      el.removeAttribute(LOCKED_ATTR);
      el.style.pointerEvents = el.dataset.deLockedPrevPe || "";
      delete el.dataset.deLockedPrevPe;
    }
  });
}

/* ─── Structure (order + group wrappers) ─── */

/**
 * Find an existing DOM node with the given id anywhere inside `root`.
 * We search globally (not just direct children) because group/ungroup
 * operations may have parked nodes at arbitrary depth.
 */
function findById(root: HTMLElement, id: string): HTMLElement | null {
  if (root.id === id) return root;
  return root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
}

/** Ensure a `.de-group.dragable` wrapper div exists for a scene group.
 *  Creates one if missing. Returns the element. */
function ensureGroupWrapper(
  root: HTMLElement,
  group: GroupLayer,
): HTMLElement {
  let el = findById(root, group.id);
  if (el) {
    // Make sure it carries the expected classes for CSS / publisher.
    if (!el.classList.contains(DRAGABLE_CLASS)) el.classList.add(DRAGABLE_CLASS);
    if (!el.classList.contains(GROUP_CLASS)) el.classList.add(GROUP_CLASS);
    return el;
  }
  el = document.createElement("div");
  el.id = group.id;
  el.className = `${GROUP_CLASS} ${DRAGABLE_CLASS}`;
  el.style.position = "absolute";
  el.style.left = `${group.frame.x}px`;
  el.style.top = `${group.frame.y}px`;
  return el;
}

/** Push the layer's frame (x/y/w/h) into the DOM element's inline style
 *  based on `frameKeys`. Ensures V2 store mutations (resize, align,
 *  nudge, duplicate) are immediately visible on the canvas. Skipped for
 *  virtual groups (root).
 *
 *  Sprint 9g — when `viewportMode === "mobile"`, we paint the mobileFrame
 *  (if defined; otherwise fall back to the desktop frame) so the canvas
 *  reflects what visitors on phones will see. The inline styles written
 *  here are TRANSIENT preview — final persistence uses serialize.ts
 *  which emits desktop as inline + mobile as `@media` pageCss.
 */
function applyFrameToEl(
  el: HTMLElement,
  layer: Layer,
  viewportMode: DeviceMode = "desktop",
) {
  if (layer.type === "group" && (layer as GroupLayer).virtual) return;
  // Inline text layers (span/a) — width/height via inline style would
  // override responsive CSS and fight text flow. Skip entirely.
  if (layer.type === "inline") return;

  // Per-property cascade: walk the device levels most-specific-first so
  // each prop takes its value (and frame) from the narrowest device that
  // declares it. This mirrors what the published `@media` blocks render,
  // so the canvas preview at each device is WYSIWYG-faithful.
  const levels = frameCascade(layer, viewportMode);
  const resolve = (prop: string): { frame: FrameLevel["frame"] } | null => {
    for (let i = levels.length - 1; i >= 0; i--) {
      if (levels[i]!.keys.has(prop)) return { frame: levels[i]!.frame };
    }
    return null;
  };

  // Keys whose source carried (or the parser injected) a `!important` flag.
  // Re-emit those inline as important so they beat the page CSS that the
  // editor/publisher boosts to `!important` — chiefly the image-anchor
  // boxes the parser enlarges to their art's size (e.g. a 749px menu bar
  // pinned in a 410px box). Only the desktop base carries an importance
  // set; device overrides are written plain.
  const important = new Set<string>(
    viewportMode === "desktop" ? (layer.frameImportant ?? []) : [],
  );
  const setFrameProp = (prop: string, key: string, value: string) => {
    if (important.has(key)) el.style.setProperty(prop, value, "important");
    else el.style.setProperty(prop, value);
  };

  // Sections are flow regions — never emit position/left/top (would
  // rip them out of document flow), but width/height are allowed
  // (users may want to resize a hero section's height).
  if (layer.type === "section") {
    const w = resolve("width");
    if (w) setFrameProp("width", "width", `${w.frame.w}px`);
    else el.style.removeProperty("width");
    const h = resolve("height");
    if (h) setFrameProp("height", "height", `${h.frame.h}px`);
    else el.style.removeProperty("height");
    return;
  }
  const pos = resolve("position");
  if (pos) setFrameProp("position", "position", "absolute");
  else el.style.removeProperty("position");
  const left = resolve("left");
  if (left) setFrameProp("left", "left", `${left.frame.x}px`);
  else el.style.removeProperty("left");
  const top = resolve("top");
  if (top) setFrameProp("top", "top", `${top.frame.y}px`);
  else el.style.removeProperty("top");
  const width = resolve("width");
  if (width) setFrameProp("width", "width", `${width.frame.w}px`);
  else el.style.removeProperty("width");
  const height = resolve("height");
  if (height) setFrameProp("height", "height", `${height.frame.h}px`);
  else el.style.removeProperty("height");
}

/** Strip a CSS declaration from an inline `style=""` string while leaving
 *  other declarations verbatim. Matches `prop:value;` tolerant of
 *  whitespace; case-insensitive on the property name. */
function stripInlineDecl(styleAttr: string | null, prop: string): string {
  if (!styleAttr) return "";
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:[^;]*(?:!important)?\\s*;?`, "gi");
  return styleAttr.replace(re, "").replace(/^\s*;\s*/, "").replace(/;\s*;/g, ";").trim();
}

/** Inheritable typography properties that descendants commonly re-declare
 *  (e.g. `<p style="color:#555">` inside a `.dragable` wrapper). When the
 *  Inspector writes one on the outer layer, we scrub descendants so the
 *  outer declaration actually wins the cascade. Non-inheritable
 *  properties (background, border, box-shadow) don't need scrubbing. */
const INHERITABLE_PROPS: Array<[keyof import("@/lib/scene").LayerStyle, string]> = [
  ["color",          "color"],
  ["fontFamily",     "font-family"],
  ["fontSize",       "font-size"],
  ["fontWeight",     "font-weight"],
  ["lineHeight",     "line-height"],
  ["letterSpacing",  "letter-spacing"],
  ["textAlign",      "text-align"],
];

const TEXT_DESCENDANT_SELECTOR =
  "h1, h2, h3, h4, h5, h6, p, span, a, li, td, th, label, blockquote, small, strong, em";

function scrubDescendantTypography(el: HTMLElement, layer: Layer) {
  const s = layer.style ?? {};

  // Only props the user actually SET on this layer get propagated. Props
  // that are absent must NOT touch descendants — doing so would erase a
  // designer's authored inner styling (e.g. `<p style="color:#555">`)
  // even though the user never edited that token on the wrapper.
  const setProps: Array<[keyof LayerStyle, string, string]> = [];
  for (const [key, css] of INHERITABLE_PROPS) {
    const v = s[key];
    if (v != null && v !== "") setProps.push([key, css, String(v)]);
  }
  const setCss = new Set(setProps.map(([, css]) => css));

  const textTags = el.querySelectorAll<HTMLElement>(TEXT_DESCENDANT_SELECTOR);

  // 1) For props the user has since CLEARED, remove ONLY the `!important`
  //    declarations we previously pushed (priority "important"). Authored
  //    inline values carry no priority, so they are left intact — this is
  //    what lets a designer's inner `color:#555` survive when the wrapper
  //    has no color token of its own.
  for (const t of textTags) {
    for (const [, css] of INHERITABLE_PROPS) {
      if (setCss.has(css)) continue; // still set → handled in step 2/3
      if (t.style.getPropertyPriority(css) === "important") {
        t.style.removeProperty(css);
      }
    }
  }

  if (setProps.length === 0) return;

  // 2) For props the user SET: strip the matching authored inline decl on
  //    every styled descendant so there's no competing inline value.
  const styled = el.querySelectorAll<HTMLElement>("[style]");
  for (const d of styled) {
    let style = d.getAttribute("style");
    if (!style) continue;
    let changed = false;
    for (const [, css] of setProps) {
      const next = stripInlineDecl(style, css);
      if (next !== style) { style = next; changed = true; }
    }
    if (changed) {
      if (style) d.setAttribute("style", style);
      else d.removeAttribute("style");
    }
  }

  // 3) Push the wrapper's typography onto every text-bearing descendant as
  //    `!important`. Without this, AI-generated cssText
  //    (e.g. `.hero h1 { color: #fff }`) keeps winning the cascade even
  //    though the user just set "글자색 #BB7777" in the Inspector. Inline
  //    `!important` beats any class-selector rule short of another
  //    `!important` (which AI rarely emits).
  for (const t of textTags) {
    for (const [, css, v] of setProps) t.style.setProperty(css, v, "important");
  }
}

/** Apply the scene's typography / fill / border / effect tokens to a
 *  DOM node so Inspector edits show immediately on the canvas. Mirrors
 *  the keys emitted by serialize.ts `buildStyleMap`.
 *
 *  Sprint 9k-fix (2026-04-22) — without this sync, `setStyle` updated
 *  the scene graph but the canvas kept rendering the old inline style
 *  from the original parsed HTML. Every LayerStyle field that
 *  serialize.ts writes must also be written here, and every field that
 *  the user cleared must be actively removed from the element's
 *  inline style.
 *
 *  Inheritable typography (color, font-*, line-height, letter-spacing,
 *  text-align) is also scrubbed off descendants — the dragable wrapper
 *  is the intent target, but presets and AI-generated markup commonly
 *  duplicate the same declarations on inner `<p>` / `<h1>` tags which
 *  would win the cascade and swallow the Inspector edit. */
function applyStyleToEl(el: HTMLElement, layer: Layer) {
  // Virtual / inline layers don't own their visual box in the same way
  // — skip to avoid clobbering flow-inline CSS.
  if (layer.type === "group" && (layer as GroupLayer).virtual) return;

  const s = layer.style ?? {};
  const set = (k: string, v: string | undefined) => {
    if (v == null || v === "") el.style.removeProperty(k);
    else el.style.setProperty(k, v);
  };
  // Typography
  set("color", s.color);
  set("font-family", s.fontFamily);
  set("font-size", s.fontSize);
  set("font-weight", s.fontWeight != null ? String(s.fontWeight) : undefined);
  set("line-height", s.lineHeight);
  set("letter-spacing", s.letterSpacing);
  set("text-align", s.textAlign);
  // Fill
  set("background", s.background);
  set("opacity", s.opacity != null ? String(s.opacity) : undefined);
  // Border — serializer preserves both shorthand and split; apply in
  // the same order so split wins if both are set.
  set("border", s.border);
  set("border-color", s.borderColor);
  set("border-width", s.borderWidth);
  set("border-style", s.borderStyle);
  set("border-radius", s.borderRadius);
  // Effect
  set("box-shadow", s.boxShadow);
  set("filter", s.filter);
  set("clip-path", s.clipPath);
  // Misc
  set("z-index", s.zIndex != null ? String(s.zIndex) : undefined);
  if (s.blendMode && s.blendMode !== "normal") {
    el.style.setProperty("mix-blend-mode", s.blendMode);
  } else {
    el.style.removeProperty("mix-blend-mode");
  }

  // Strip conflicting typography declarations from descendants.
  scrubDescendantTypography(el, layer);
}

/** Apply the scene's transform (rotate/scale/origin) to a DOM node.
 *  Mirrors applyFrameToEl — prefers mobileTransform when in mobile mode. */
function applyTransformToEl(
  el: HTMLElement,
  layer: Layer,
  viewportMode: DeviceMode = "desktop",
) {
  // Transform cascade: mobile → tablet → desktop (first defined wins),
  // tablet → desktop, desktop → desktop.
  const source =
    viewportMode === "mobile"
      ? (layer.mobileTransform ?? layer.tabletTransform ?? layer.transform)
      : viewportMode === "tablet"
        ? (layer.tabletTransform ?? layer.transform)
        : layer.transform;
  const tfm = printTransform(source);
  if (tfm) el.style.transform = tfm;
  else el.style.removeProperty("transform");
  const tfo = printTransformOrigin(source);
  if (tfo) el.style.transformOrigin = tfo;
  else el.style.removeProperty("transform-origin");
}

/**
 * Reconcile DOM structure to match the scene tree:
 *  - Groups get (or reuse) a `.de-group.dragable` wrapper div.
 *  - Children of each scene group are appended to the corresponding
 *    wrapper in scene order.
 *  - Non-scene elements inside `container` stay untouched at their
 *    relative position.
 *  - Transform is pushed to each node.
 *
 * This is what turns a "group" store action into actual DOM nesting.
 */
export function applyStructure(
  scene: SceneGraph,
  container: HTMLElement,
  viewportMode: DeviceMode = "desktop",
) {
  const reconcile = (node: GroupLayer | import("@/lib/scene").SectionLayer, domParent: HTMLElement) => {
    // Sprint 9h — when reconciling a SECTION's children, respect the
    // section's innerHtml template: children commonly live inside a
    // decorative non-dragable wrapper (e.g. `<div class="split-sec">`
    // with `display:grid`, or `<div class="stats-inner">` with
    // `grid-template-columns: repeat(4,1fr)`). Reparenting those
    // children directly under the section element destroys the grid /
    // flex layout the wrapper was providing.
    //
    // Rule: for section children, only touch the DOM if the child is
    // OUTSIDE the section entirely (e.g. paste, cross-section move).
    // Otherwise leave it where the innerHtml template put it.
    const parentIsSection = isSection(node);

    let prevInOrder: HTMLElement | null = null;
    for (const child of node.children) {
      let childEl: HTMLElement | null;
      if (child.type === "group") {
        childEl = ensureGroupWrapper(container, child);
      } else {
        childEl = findById(container, child.id);
      }
      // Materialize missing leaf elements via serializer. Happens after
      // store actions like `duplicateLayer` / `pasteLayers` that add a
      // new node to the scene without a matching DOM element. Without
      // this, the layer panel shows the new layer but the canvas stays
      // unchanged.
      if (!childEl && child.type !== "group" && child.type !== "section") {
        try {
          const html = serializeLayerHtml(child);
          if (html) {
            const tmp = container.ownerDocument.createElement("div");
            tmp.innerHTML = html;
            const fresh = tmp.firstElementChild as HTMLElement | null;
            if (fresh) {
              domParent.appendChild(fresh);
              childEl = fresh;
            }
          }
        } catch {
          // Defensive — if serialization fails, fall through to skip.
        }
      }
      if (!childEl) continue;

      // Inline layers (legacy `id="el_*"` flow text/anchor) are flow-
      // positioned and live wherever the surrounding section's HTML put
      // them — never reorder, never reparent. Just apply visuals.
      if (child.type === "inline") {
        applyFrameToEl(childEl, child, viewportMode);
        applyTransformToEl(childEl, child, viewportMode);
        applyStyleToEl(childEl, child);
        if (hasTypedChildren(child)) reconcile(child, childEl);
        continue;
      }

      if (parentIsSection) {
        // Section's children are anchored by `<!--scene-child:${id}-->`
        // placeholders in the section's innerHtml template. Reordering
        // a child of a section would detach it from its anchor — skip
        // order reconciliation; only ensure it's still inside.
        if (!domParent.contains(childEl)) {
          domParent.appendChild(childEl);
        }
      } else if (childEl.parentElement !== domParent) {
        // Group / root: children should be direct kids of the wrapper.
        domParent.appendChild(childEl);
      } else if (prevInOrder) {
        const pos = childEl.compareDocumentPosition(prevInOrder);
        const childIsBeforePrev = (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
        if (childIsBeforePrev) {
          prevInOrder.after(childEl);
        }
      }
      if (!parentIsSection) prevInOrder = childEl;

      applyFrameToEl(childEl, child, viewportMode);
      applyTransformToEl(childEl, child, viewportMode);
      applyStyleToEl(childEl, child);
      applyInteractionToEl(childEl, child);
      if (child.type === "image" || child.type === "box") {
        applyImageDataToEl(childEl, child);
      }
      if (hasTypedChildren(child)) {
        reconcile(child, childEl);
      }
    }
  };
  reconcile(scene.root, container);
}

/**
 * Mirror `layer.interaction` onto the DOM as `data-hns-interaction`. The
 * published route's tiny click runtime reads this attribute to wire up
 * link / scrollTo / modal / toggle behavior at view time.
 *
 * Saving the page snapshots `bodyEl.innerHTML` directly, so without this
 * step the interaction lives only in the scene graph and never makes it
 * to the published HTML — clicks do nothing.
 *
 * Removing an interaction (Inspector → 인터랙션 제거) drops the attribute.
 */
function applyInteractionToEl(el: HTMLElement, layer: Layer) {
  if (layer.interaction) {
    try {
      const json = JSON.stringify(layer.interaction);
      if (el.getAttribute("data-hns-interaction") !== json) {
        el.setAttribute("data-hns-interaction", json);
      }
    } catch {
      // Defensive — bad payload shouldn't crash the editor. Drop the
      // attribute so the page doesn't ship a malformed handler.
      el.removeAttribute("data-hns-interaction");
    }
  } else {
    el.removeAttribute("data-hns-interaction");
  }
}

/**
 * Push image data (src / alt / href / objectFit) onto the live DOM:
 *   - For ImageLayer: read from typed fields (layer.src, layer.alt, …)
 *   - For BoxLayer: parse `layer.innerHtml` to read the same fields
 *     (boxes that wrap an `<img>` carry their image state inside
 *     innerHtml — there are no typed fields on BoxLayer for src/alt)
 *
 * Box layers without an `<img>` are a no-op (nothing to apply).
 *
 * The wrapper element's full innerHTML is NEVER replaced — that would
 * blow away rotation handles / selection outlines / any caret state.
 * We just patch the inner `<img>` and (if present) outer `<a>`.
 */
function applyImageDataToEl(el: HTMLElement, layer: Layer) {
  type ImgFields = { src?: string; alt?: string; href?: string; hrefTarget?: string; objectFit?: string };
  let attrs: ImgFields | null = null;
  if (layer.type === "image") {
    const img = layer as Layer & ImgFields;
    attrs = {
      src: img.src,
      alt: img.alt,
      href: img.href,
      hrefTarget: img.hrefTarget,
      objectFit: img.objectFit,
    };
  } else if (layer.type === "box") {
    const box = layer as Layer & { innerHtml?: string };
    if (typeof window === "undefined" || !box.innerHtml) return;
    const tmp = document.createElement("div");
    tmp.innerHTML = box.innerHtml;
    const ie = tmp.querySelector("img");
    if (!ie) return;
    const ae = tmp.querySelector("a");
    attrs = {
      src: ie.getAttribute("src") ?? "",
      alt: ie.getAttribute("alt") ?? undefined,
      href: ae?.getAttribute("href") ?? undefined,
      hrefTarget: ae?.getAttribute("target") ?? undefined,
      objectFit: ie.style.objectFit || undefined,
    };
  }
  if (!attrs) return;

  const imgEl = el.querySelector("img");
  if (imgEl) {
    const srcChanged = attrs.src != null && imgEl.getAttribute("src") !== attrs.src;
    if (srcChanged) imgEl.setAttribute("src", attrs.src as string);
    if (attrs.alt) imgEl.setAttribute("alt", attrs.alt);
    else imgEl.removeAttribute("alt");
    // Normalize the img to fill its wrapper ONLY on a genuine swap (new
    // src) or when it carries no authored pixel width. A freshly swapped
    // photo tuned to the OLD image's natural size would clip/overflow, so
    // swaps force width/height:100% + object-fit (matches
    // rewriteImageInnerHtml). But legacy designer images deliberately
    // overflow a SMALLER .dragable container (e.g. a 749px menu-bar bg
    // inside a 410px box); on initial load we must preserve their authored
    // inline px dimensions or the editor shrinks them to the wrapper and
    // diverges from the published page. The editor-styles.css
    // `img:not([style*="width"])` cap is the companion rule that lets the
    // preserved px widths overflow instead of being clamped to max-width.
    const hasAuthoredPxWidth = /width\s*:\s*[\d.]+px/i.test(imgEl.getAttribute("style") || "");
    if (srcChanged || !hasAuthoredPxWidth) {
      (imgEl as HTMLImageElement).style.setProperty("width", "100%");
      (imgEl as HTMLImageElement).style.setProperty("height", "100%");
      const fit = attrs.objectFit ?? "cover";
      if (fit === "none") {
        (imgEl as HTMLImageElement).style.removeProperty("object-fit");
      } else {
        (imgEl as HTMLImageElement).style.setProperty("object-fit", fit);
      }
    }
  }
  const a = el.querySelector("a");
  if (a) {
    if (attrs.href) a.setAttribute("href", attrs.href);
    else a.removeAttribute("href");
    if (attrs.hrefTarget) a.setAttribute("target", attrs.hrefTarget);
    else a.removeAttribute("target");
  }
}

/**
 * DOM counterpart of the parser's image-anchor frame normalization
 * (`buildImageLayer` in `@/lib/scene`). Used for raw-injected regions that do
 * NOT go through the scene graph — chiefly the header (`#hns_header`), whose
 * logo is a large image pinned inside a tiny positioning box (e.g. a 406px
 * logo in a 200px-wide `.dragable`). Without this the box (and any selection
 * handles drawn on it) reports the tiny anchor size while the visible art is
 * much larger.
 *
 * Same guard as the parser: only when the image is at least 1.5× the box's
 * explicit width — an unmistakable positioning anchor, not a deliberately
 * sized element. Idempotent: after the box is widened the ratio no longer
 * trips, so re-running is a no-op. Visual output is unchanged (the image
 * already overflowed the box visibly).
 */
export function normalizeAnchorImageBoxes(root: HTMLElement) {
  const RATIO = 1.5;
  root.querySelectorAll<HTMLElement>(".dragable").forEach((box) => {
    const img = box.querySelector("img");
    if (!img) return;
    const bw = parseFloat(box.style.width);
    if (!(bw > 0)) return; // box width must be explicitly set
    const iw =
      parseFloat((img as HTMLElement).style.width) ||
      parseFloat(img.getAttribute("width") || "");
    if (!(iw > 0) || iw < bw * RATIO) return;
    box.style.width = `${iw}px`;
    const bh = parseFloat(box.style.height);
    const ih =
      parseFloat((img as HTMLElement).style.height) ||
      parseFloat(img.getAttribute("height") || "");
    if (bh > 0 && ih > bh) box.style.height = `${ih}px`;
  });
}

/**
 * Back-compat alias for the flat-only order sync used pre-Tier-2.
 * New code should prefer `applyStructure`.
 */
export function applyOrder(scene: SceneGraph, container: HTMLElement) {
  applyStructure(scene, container);
}

/* ─── Deletion ─── */

/**
 * Remove any `.dragable` node in the container whose id isn't present
 * in the scene. Used after the LayerPanel deletes layers.
 */
export function pruneOrphans(scene: SceneGraph, container: HTMLElement) {
  const live = collectIds(scene.root);
  const toRemove: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
    if (!el.id) return;
    if (!live.has(el.id)) toRemove.push(el);
  });
  for (const el of toRemove) el.remove();
}

/* ─── Selection ─── */

/**
 * Apply `.de-selected` class to the DOM nodes matching the store's
 * primary + multi-selection. Other nodes have the class removed.
 */
export function applySelection(
  primary: LayerId | null,
  multi: Set<LayerId>,
  container: HTMLElement,
) {
  const wanted = new Set<LayerId>(multi);
  if (primary) wanted.add(primary);

  // Include both `.dragable` leaves and inline-promoted elements
  // (spans/anchors with `id="el_*"`); the store's selection may refer
  // to any layer type.
  container.querySelectorAll<HTMLElement>(".dragable, [id^='el_']").forEach((el) => {
    if (!el.id) return;
    if (wanted.has(el.id)) el.classList.add("de-selected");
    else el.classList.remove("de-selected");
  });
}

/* ─── Umbrella ─── */

/**
 * Run all store→DOM reconciliations in order. Safe to call on every
 * scene change; each step is cheap (O(N) DOM walk, no layout thrash
 * beyond what the mutations actually require).
 */
export function syncStoreToDom(
  scene: SceneGraph,
  container: HTMLElement,
  viewportMode: DeviceMode = "desktop",
) {
  applyStructure(scene, container, viewportMode);
  pruneOrphans(scene, container);
  applyVisibilityAndLock(scene, container);
}
