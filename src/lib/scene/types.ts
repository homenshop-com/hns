/**
 * Scene Graph — Editor's internal source-of-truth for a page body.
 *
 * Rationale:
 * - Legacy Next.js/PHP publisher expects body HTML as a flat set of
 *   `<div class="dragable" style="position:absolute;...">` nodes.
 * - For a PowerPoint/Illustrator/Photoshop-level editor, we need proper
 *   layers, grouping, z-order, lock/hide, opacity, etc.
 *
 * Strategy: Editor operates on this typed Scene tree. On save/publish,
 * the tree is serialized back to the legacy HTML shape via
 * `sceneToLegacyHtml()`. When opening an existing page, legacy HTML is
 * imported via `legacyHtmlToScene()`.
 *
 * Storage: `Page.content` remains a JSON blob. We keep the legacy
 * `{ html }` field (unchanged for publisher), and add an optional
 * `{ layers: SceneGraph }` field. If `layers` is present, the editor
 * uses it; otherwise it imports from `html`.
 *
 * See: docs/SECURITY_LEGACY_FIXES.md (legacy PHP context)
 *      plan in conversation history for upgrade roadmap.
 */

export type LayerId = string;

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "soft-light"
  | "hard-light"
  | "difference"
  | "exclusion";

export type LayerType =
  | "group"
  | "section"
  | "inline"
  | "text"
  | "image"
  | "box"
  | "shape"
  | "board"
  | "product"
  | "exhibition"
  | "menu"
  | "login"
  | "mail";

export interface LayerFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayerTransform {
  /** degrees */
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  /** CSS transform-origin percent (0..100), defaults to 50/50 */
  originX?: number;
  originY?: number;
}

export interface LayerStyle {
  /** 0..1 */
  opacity?: number;
  /** Explicit z-index override. If absent, layer order within its group
   *  determines paint order (first = bottom). */
  zIndex?: number;
  blendMode?: BlendMode;
  background?: string;
  /** Shorthand border (retained for round-trip compatibility). New edits
   *  from the Inspector panel write the split fields below instead. */
  border?: string;
  /** Full CSS filter string, e.g. "blur(4px) drop-shadow(0 2px 4px #000)" */
  filter?: string;
  clipPath?: string;

  /* ─── Typography tokens (Sprint 9k) ────────────────────────────────
   * Applied as inline-style on the layer root. Child text inherits
   * unless overridden by inner markup. These survive round-trip via
   * parse.ts `extractStyle` and serialize.ts `buildStyleMap`.
   */
  color?: string;
  fontFamily?: string;
  /** CSS font-size string ("16px", "1.1rem"). Kept as raw string so
   *  non-px sources round-trip unchanged. */
  fontSize?: string;
  fontWeight?: string | number;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: "left" | "center" | "right" | "justify" | "start" | "end";

  /* ─── Border split fields ─────────────────────────────────────────── */
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: "solid" | "dashed" | "dotted" | "double" | "none";
  borderRadius?: string;

  /* ─── Effects ─────────────────────────────────────────────────────── */
  /** CSS box-shadow. Multiple shadows can be comma-separated. */
  boxShadow?: string;
}

export interface BaseLayer {
  id: LayerId;
  /** Display label in the Layer Panel, e.g. "Hero Text", "Group 3" */
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  frame: LayerFrame;
  transform?: LayerTransform;
  style: LayerStyle;
  /**
   * Class string preserved from legacy `.dragable` DOM. Always contains
   * "dragable" for leaf layers (so the legacy publisher still recognizes
   * them). May also contain legacy markers like
   * "sol-replacible-text", "boardPlugin", "productPlugin", "menuPlugin".
   */
  legacyClassName?: string;
  /**
   * Non-style HTML attributes preserved verbatim (data-*, id, role, etc.).
   * `id` MUST match BaseLayer.id for DOM<->scene mapping to work.
   */
  legacyAttrs?: Record<string, string>;
  /**
   * Style entries that don't fit the typed model and we don't want to drop
   * on roundtrip. E.g. `margin: "0 auto"` for centered layers.
   */
  legacyStyleExtras?: Record<string, string>;
  /**
   * Which of `position|left|top|width|height` were present in the source
   * inline style (or explicitly set by the editor after the fact).
   * Serializer emits ONLY these keys so CSS-driven layouts (no inline
   * frame) survive roundtrip untouched. Editor drag/resize actions
   * augment this set as needed.
   */
  frameKeys?: Array<"position" | "left" | "top" | "width" | "height">;
  /** Subset of `frameKeys` that carried a `!important` flag in the source.
   *  Re-emitted verbatim so overrides vs. template CSS aren't neutered. */
  frameImportant?: Array<"position" | "left" | "top" | "width" | "height">;

  /**
   * Click-time interaction (Sprint 9k). Drives the 인터랙션 tab in the
   * InspectorPanel and is emitted as a `data-hns-interaction` attribute
   * on the layer root during serialize. The published route reads the
   * attribute and wires up the behavior at page load.
   */
  interaction?: LayerInteraction;

  /**
   * ═══════════════════════════════════════════════════════════════════
   * Mobile viewport override (≤ MOBILE_BREAKPOINT px).
   * ═══════════════════════════════════════════════════════════════════
   *
   * When set, the serializer emits a `@media (max-width: 768px)` rule
   * that applies these values, overriding the desktop inline frame.
   * When unset, mobile inherits the desktop positioning — which
   * for atomic children means `position:absolute` carries over to
   * small screens, often collapsing or overlapping on phones.
   *
   * The editor writes to this field (instead of `frame`/`frameKeys`/
   * `transform`) when the user drags/resizes in mobile viewport mode.
   * On first mobile-mode mutation, mobileFrame is initialized from
   * `frame` so the user picks up where desktop left off.
   */
  mobileFrame?: LayerFrame;
  mobileFrameKeys?: Array<"position" | "left" | "top" | "width" | "height">;
  mobileTransform?: LayerTransform;
}

/**
 * LayerInteraction — click-time behavior attached to any layer. Emitted
 * as a `data-hns-interaction` JSON attribute on serialize; a tiny runtime
 * in the published route reads the attribute and calls the matching
 * action (smooth-scroll, navigate, open modal, toggle class).
 *
 * Keep this struct small and JSON-friendly — it's stored in the DB as
 * part of the scene graph and serialized to an HTML attribute.
 */
export type LayerInteraction =
  | { kind: "link"; href: string; target?: "_self" | "_blank" }
  | { kind: "scrollTo"; targetId: string; smooth?: boolean }
  | { kind: "modal"; targetId: string }
  | { kind: "toggle"; targetId: string; className: string };

/** Single source of truth for the desktop/mobile breakpoint. Must match
 *  the value used by the published route's `<meta name="viewport">` and
 *  the editor's viewport toggle. 768px is Bootstrap's md breakpoint and
 *  aligns with iPad portrait; anything below renders as mobile. */
export const MOBILE_BREAKPOINT = 768;

export interface GroupLayer extends BaseLayer {
  type: "group";
  /** Children render in array order; last child paints on top. */
  children: Layer[];
  /**
   * If true, this group is purely an editor construct and serializes
   * out as its children (no wrapper div). Useful for the root group
   * and for "flatten on publish" groups. Default false — a real group
   * serializes to a `<div class="de-group dragable">` wrapper.
   */
  virtual?: boolean;
}

/**
 * SectionLayer — a page region laid out in normal flow (PowerPoint-
 * style "slide" or HTML flow section). Distinct from GroupLayer:
 *  - Section is NOT draggable/resizable/rotatable — it occupies its
 *    place in the flow of the body and serves as the positioning
 *    context for absolute-positioned children (offsetParent).
 *  - Section never emits `position:absolute`, `left`, or `top` on
 *    serialize. Its frameKeys always excludes those keys. The flow
 *    guard in editor-store.setFrame relies on this invariant.
 *  - Children are typed first-class Layers (unlike a BoxLayer whose
 *    inner HTML is opaque), so the LayerPanel can show hierarchical
 *    structure and individual children can be selected/moved within
 *    the section.
 *
 * Typical inputs: top-level `.dragable` in the page body with
 * `position:relative` (or no inline position) and inner `.dragable`
 * children. Parser promotes such elements from BoxLayer to
 * SectionLayer automatically.
 */
export interface SectionLayer extends BaseLayer {
  type: "section";
  /**
   * Shell template — the section's inner HTML with each typed child
   * `.dragable` replaced by a `<!--scene-child:${id}-->` placeholder
   * comment. Decorative non-dragable markup (section titles, SVG
   * backgrounds, wrapper divs) is preserved around/between the
   * placeholders. Serialize replaces each placeholder with the child's
   * rendered HTML, giving a perfect byte-for-byte round-trip.
   */
  innerHtml: string;
  /**
   * Typed first-class children — topmost `.dragable` descendants of
   * the section, promoted to editable Layers (Sprint 9c Tier-2). In
   * Tier-1 (9b) this array was absent; code should treat an undefined
   * or empty array as "section with no typed children" (the innerHtml
   * alone is the source of truth for rendering).
   */
  children: Layer[];
}

export interface TextLayer extends BaseLayer {
  type: "text";
  /** TipTap HTML. */
  html: string;
}

export interface ImageLayer extends BaseLayer {
  type: "image";
  /** Parsed-for-convenience. Editor displays/edits these; serializer uses
   *  `innerHtml`. When editor updates src/alt/href, it also rewrites
   *  `innerHtml` so they stay in sync. */
  src: string;
  alt?: string;
  href?: string;
  hrefTarget?: string;
  objectFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  /** Source of truth for the wrapper's inner HTML. Preserves img-level
   *  styles, classes, and any surrounding markup (e.g. `<a>` wrapper). */
  innerHtml: string;
}

/**
 * InlineLayer — a flow-positioned sub-element inside a section, promoted
 * from the legacy `id="el_*"` pattern used by the PHP designer (spans,
 * anchors, etc. marked as text objects within a rich-text section).
 *
 * Unlike .dragable leaves, inline layers:
 *  - Retain their original tag (`<span>`, `<a>`, `<strong>`, ...) on
 *    serialize — no wrapper `<div>`, no `.dragable` class injection.
 *  - Are flow-positioned by CSS (never emit position/left/top/width/height).
 *  - Can still be selected/renamed/hidden in the LayerPanel and have
 *    their text/inner HTML edited via the same TipTap pipeline.
 *
 * This opens a practical "PPT-like" editing UX for templates authored
 * in the legacy rich-text style (hero sections with inline text
 * objects) without requiring the source markup to be rewritten to
 * absolute-positioned divs.
 */
export interface InlineLayer extends BaseLayer {
  type: "inline";
  /** Original tag name, lower-cased. Preserved so serialize can emit
   *  `<span>...</span>` / `<a>...</a>` / etc. verbatim. */
  tag: string;
  /** Editable inner HTML (TipTap-compatible subset). */
  innerHtml: string;
}

export interface BoxLayer extends BaseLayer {
  type: "box";
  /**
   * For simple boxes: plain inner HTML (paragraphs, inline markup).
   * For complex custom-template wrappers: entire inner HTML is preserved
   * as an opaque blob (Tier-1 black-box strategy). Tier-3 will allow
   * "explode" to promote inner nodes into first-class layers.
   */
  innerHtml: string;
}

export interface ShapeLayer extends BaseLayer {
  type: "shape";
  shape: "rect" | "ellipse" | "line" | "polygon" | "path";
  /** Optional SVG fragment for Tier-3 pen/path layers. */
  svg?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

/**
 * Server-side-rendered plugin layer. The inner HTML is a snapshot
 * produced by `renderBoardPluginContent` / `renderProductPluginContent`
 * (see src/lib/plugin-renderer.ts). We keep the snapshot so the
 * editor preview looks right, but on publish the server re-renders
 * from fresh DB data.
 */
export interface PluginLayer extends BaseLayer {
  type: "board" | "product" | "exhibition" | "menu" | "login" | "mail";
  /** Editor-visible HTML snapshot. Server overwrites this on render. */
  legacyInnerHtml: string;
  /** Per-plugin configuration read by plugin-renderer. */
  pluginData?: Record<string, unknown>;
}

export type Layer =
  | GroupLayer
  | SectionLayer
  | InlineLayer
  | TextLayer
  | ImageLayer
  | BoxLayer
  | ShapeLayer
  | PluginLayer;

export interface SceneGraph {
  /** Schema version. Bump when serialization format changes. */
  version: 1;
  /** Root is always a virtual group. Its children are the top-level
   *  layers on the page body. */
  root: GroupLayer;
}

/* ─── Type guards ─── */

export function isGroup(l: Layer): l is GroupLayer {
  return l.type === "group";
}
export function isSection(l: Layer): l is SectionLayer {
  return l.type === "section";
}
/** Tier-2 (9c): both groups and sections carry typed children. */
export function hasTypedChildren(l: Layer): l is GroupLayer | SectionLayer {
  return l.type === "group" || l.type === "section";
}
export function isInline(l: Layer): l is InlineLayer {
  return l.type === "inline";
}
export function isText(l: Layer): l is TextLayer {
  return l.type === "text";
}
export function isImage(l: Layer): l is ImageLayer {
  return l.type === "image";
}
export function isBox(l: Layer): l is BoxLayer {
  return l.type === "box";
}
export function isShape(l: Layer): l is ShapeLayer {
  return l.type === "shape";
}
export function isPlugin(l: Layer): l is PluginLayer {
  return (
    l.type === "board" ||
    l.type === "product" ||
    l.type === "exhibition" ||
    l.type === "menu" ||
    l.type === "login" ||
    l.type === "mail"
  );
}

/** Plugin class → LayerType mapping. Kept here so parser & serializer agree. */
export const PLUGIN_CLASS_TYPE: Array<{ cls: string; type: PluginLayer["type"] }> = [
  { cls: "boardPlugin", type: "board" },
  { cls: "productPlugin", type: "product" },
  { cls: "exhibitionPlugin", type: "exhibition" },
  { cls: "menuPlugin", type: "menu" },
  { cls: "loginPlugin", type: "login" },
  { cls: "mailPlugin", type: "mail" },
];

/** Class marker written out for group wrapper divs so downstream code
 *  (legacy publisher CSS, published route) can style/skip them. */
export const GROUP_CLASS = "de-group";

/** Class marker used on every layer root so the legacy PHP publisher
 *  and the current editor's `.dragable` selectors keep working. */
export const DRAGABLE_CLASS = "dragable";
