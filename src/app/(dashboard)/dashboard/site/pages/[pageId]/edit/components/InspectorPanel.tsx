/**
 * InspectorPanel — right-side inspector with three tabs (디자인 / 레이어 /
 * 인터랙션), matching the Claude Design "Editor Canvas.html" prototype.
 *
 * - 디자인 tab: live selection header + editable position/size/rotation +
 *   typography/채우기/테두리/이펙트 controls, all wired to the Zustand
 *   scene store (setFrame / setTransform / setStyle). Undo/redo (zundo)
 *   captures every edit for free.
 * - 레이어 tab: wraps the existing LayerPanel component.
 * - 인터랙션 tab: pick a click-time action — link / scrollTo / modal /
 *   toggle — persisted on the layer via setInteraction and emitted as
 *   data-hns-interaction on publish. The published route wires up the
 *   runtime; this panel only mutates the scene.
 */

"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  useEditorStore,
  selectRoot,
  selectViewportMode,
  readImgFromInnerHtml,
  type OverrideDevice,
  type HideDevice,
} from "../store/editor-store";
import type { BoxLayer, ImageLayer, Layer, LayerId, LayerInteraction, LayerStyle, ResponsiveOverride } from "@/lib/scene";
import { FONT_CATALOG, FONT_CATEGORIES, type FontDef } from "./font-catalog";
import {
  type FacebookEmbedOpts,
  FB_DEFAULTS,
  FB_TAB_OPTIONS,
  isFacebookEmbed,
  parseFacebookEmbed,
  applyFacebookEmbed,
  clampFbWidth,
  clampFbHeight,
} from "../shared/facebook-embed";
import {
  type GoogleMapEmbedOpts,
  GMAP_DEFAULTS,
  isGoogleMapEmbed,
  parseGoogleMapEmbed,
  applyGoogleMapEmbed,
  resolveMapInput,
  clampMapSize,
} from "../shared/google-map-embed";
import {
  type FooterStyle,
  type FooterDevice,
  type FooterDeviceStyle,
  emptyFooterStyle,
} from "../shared/footer-style";

const LayerPanel = lazy(() => import("./LayerPanel"));

type Tab = "design" | "layers" | "proto";

/* ───── Live DOM helpers — reflect rendered values into the panel ──
 *
 * The scene's `frame` and `style` only capture *inline overrides* (what
 * was written as `style="left:...; top:...; color:..."` on the element).
 * Flow text, CSS-positioned wrappers, and elements styled via stylesheet
 * therefore land in the scene with `frame: {0,0,0,0}` and empty style
 * fields — even though they render at a real size with a real color.
 *
 * To make the inspector reflect what the user *sees*, we read the live
 * DOM element by id and snapshot its `offsetLeft/Top/Width/Height` plus
 * `getComputedStyle` whenever selection or scene state changes. The
 * inspector then displays the live value as the input's `value`; on
 * commit, the user's typed value flows back through setFrame/setStyle
 * and becomes an inline override that wins the cascade.
 */

interface LiveSnapshot {
  frame: { x: number; y: number; w: number; h: number };
  color: string;
  background: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  opacity: string;
  borderColor: string;
  borderWidth: string;
  borderRadius: string;
  borderStyle: string;
  boxShadow: string;
  filter: string;
}

/** Convert "rgb(r,g,b)" or "rgba(r,g,b,a)" → "#rrggbb" (or "#rrggbbaa"
 *  when alpha < 1). Returns the input unchanged if it isn't a parseable
 *  rgb() string — keep "#abcdef", named colors, gradients verbatim. */
function rgbToHex(input: string): string {
  if (!input) return input;
  const m = input.match(
    /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i,
  );
  if (!m) return input;
  const [, r, g, b, a] = m;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const base = `#${hex(+r)}${hex(+g)}${hex(+b)}`;
  if (a == null) return base;
  const av = Math.round(parseFloat(a) * 255);
  if (av >= 255) return base;
  return `${base}${hex(av)}`;
}

function readLiveSnapshot(layerId: LayerId | null): LiveSnapshot | null {
  if (!layerId || typeof document === "undefined") return null;
  const el = document.getElementById(layerId);
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  // Treat fully-transparent / "none" computed values as "unset" so the
  // user sees an empty field rather than a placeholder rgba(0,0,0,0).
  const isTransparent = cs.backgroundColor === "rgba(0, 0, 0, 0)" || cs.backgroundColor === "transparent";
  return {
    frame: {
      x: Math.round(el.offsetLeft),
      y: Math.round(el.offsetTop),
      w: Math.round(el.offsetWidth),
      h: Math.round(el.offsetHeight),
    },
    color: rgbToHex(cs.color),
    background: isTransparent ? "" : rgbToHex(cs.backgroundColor),
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    lineHeight: cs.lineHeight === "normal" ? "" : cs.lineHeight,
    letterSpacing: cs.letterSpacing === "normal" ? "" : cs.letterSpacing,
    textAlign: cs.textAlign,
    opacity: cs.opacity,
    borderColor: rgbToHex(cs.borderColor),
    borderWidth: cs.borderWidth === "0px" ? "" : cs.borderWidth,
    borderRadius: cs.borderRadius === "0px" ? "" : cs.borderRadius,
    borderStyle: cs.borderStyle === "none" ? "" : cs.borderStyle,
    boxShadow: cs.boxShadow === "none" ? "" : cs.boxShadow,
    filter: cs.filter === "none" ? "" : cs.filter,
  };
}

/* ───── Helpers — walk the scene ─────────────────────────────────── */

function findLayerAndPath(
  root: { id: string; name: string; type: string; children?: Layer[] },
  id: LayerId | null,
  path: Array<{ id: string; name: string; type: string }> = [],
): { layer: Layer | null; path: Array<{ id: string; name: string; type: string }> } {
  if (!id) return { layer: null, path: [] };
  if (root.id === id) return { layer: root as unknown as Layer, path: [...path, root] };
  if (Array.isArray(root.children)) {
    for (const child of root.children) {
      const withChild = [...path, root];
      if (child.id === id) return { layer: child, path: [...withChild, child] };
      if (Array.isArray((child as { children?: Layer[] }).children)) {
        const deeper = findLayerAndPath(
          child as unknown as Parameters<typeof findLayerAndPath>[0],
          id,
          withChild,
        );
        if (deeper.layer) return deeper;
      }
    }
  }
  return { layer: null, path: [] };
}

/** Map internal layer type → Korean label + Font Awesome icon. */
function layerMeta(type: string): { label: string; icon: string; color: string } {
  switch (type) {
    case "group":   return { label: "GROUP",   icon: "fa-folder",       color: "#a897ff" };
    case "section": return { label: "SECTION", icon: "fa-table-cells-large", color: "#5be5b3" };
    case "text":    return { label: "TEXT",    icon: "fa-font",         color: "#6ea8ff" };
    case "image":   return { label: "IMAGE",   icon: "fa-image",        color: "#f4b66a" };
    case "box":     return { label: "BOX",     icon: "fa-square",       color: "#8a8fa3" };
    case "inline":  return { label: "INLINE",  icon: "fa-i-cursor",     color: "#c6c9d6" };
    case "board":   return { label: "BOARD",   icon: "fa-clipboard-list", color: "#ff8bb1" };
    case "product": return { label: "PRODUCT", icon: "fa-bag-shopping", color: "#f4b66a" };
    case "menu":    return { label: "MENU",    icon: "fa-bars",         color: "#c6c9d6" };
    default:        return { label: type.toUpperCase(), icon: "fa-square", color: "#8a8fa3" };
  }
}

/* ───── Component ────────────────────────────────────────────────── */

/** Shared type with DesignEditor — mirrors the headerLayout state shape. */
export interface HmfHeaderLayout {
  sticky: boolean;
  height: string;   // "auto" | "64px" etc.
  background: string; // hex / var() / "transparent"
}

interface Props {
  /** Null when editor-v2 is disabled — then we render legacy LayerPanel-less state. */
  enabled: boolean;
  /** Owner site id — passed to /api/upload so files land in the
   *  per-site folder and show up in the 에셋 tab. */
  siteId?: string;
  /** Current editing target — when "hmf", show HMF-specific panel if nothing is selected. */
  editingTarget?: "body" | "hmf";
  /** Current header layout values (background / sticky / height) from DesignEditor. */
  headerLayout?: HmfHeaderLayout;
  /** Callback to apply header layout changes (updates CSS + DOM). */
  onApplyHeaderLayout?: (next: HmfHeaderLayout) => void;
  /** Open the full HeaderEditModal from the inspector "고급 편집" button. */
  onOpenHeaderEdit?: () => void;
  /** Open the full FooterEditModal from the inspector "고급 편집" button. */
  onOpenFooterEdit?: () => void;
  /** Apply "본문 설정" panel changes (background / min-height) to #hns_body. */
  onApplyBodyLayout?: (patch: { background?: string; minHeight?: number }) => void;
  /** Current site-wide per-device footer style (from DesignEditor). */
  footerStyle?: FooterStyle;
  /** Apply "푸터 설정" changes (site-wide, per-device) to #hns_footer. */
  onApplyFooterLayout?: (next: FooterStyle) => void;
}

export default function InspectorPanel({
  enabled,
  siteId,
  editingTarget,
  headerLayout,
  onApplyHeaderLayout,
  onOpenHeaderEdit,
  onOpenFooterEdit,
  onApplyBodyLayout,
  footerStyle,
  onApplyFooterLayout,
}: Props) {
  const t = useTranslations("editor");
  const [tab, setTab] = useState<Tab>("design");
  const [selectedId, setSelectedId] = useState<LayerId | null>(null);
  // Subscribe to selection + scene changes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    setSelectedId(useEditorStore.getState().selectedId);
    return useEditorStore.subscribe((s) => {
      setSelectedId((prev) => (prev === s.selectedId ? prev : s.selectedId));
      setTick((t) => t + 1);
    });
  }, [enabled]);

  const { layer, path } = useMemo(() => {
    const st = useEditorStore.getState();
    const root = selectRoot(st);
    const fromBody = findLayerAndPath(
      root as unknown as Parameters<typeof findLayerAndPath>[0],
      selectedId,
    );
    if (fromBody.layer) return fromBody;
    // Header objects live in a separate scene (headerRef DOM). When a header
    // layer is selected, surface its properties in the Inspector too so the
    // header section is editable "본문섹션처럼" (just like body sections).
    const headerRoot = st.headerScene?.root ?? null;
    if (headerRoot) {
      const fromHeader = findLayerAndPath(
        headerRoot as unknown as Parameters<typeof findLayerAndPath>[0],
        selectedId,
      );
      if (fromHeader.layer) return fromHeader;
    }
    // Footer objects also live in a separate scene (footerRef DOM) — same
    // fallback so the footer section is Inspector-editable just like the header.
    const footerRoot = st.footerScene?.root ?? null;
    if (footerRoot) {
      return findLayerAndPath(
        footerRoot as unknown as Parameters<typeof findLayerAndPath>[0],
        selectedId,
      );
    }
    return fromBody;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, tick]);

  // Snapshot the rendered geometry + computed styles of the selected
  // element so the design tab can show pixel-accurate values for layers
  // whose scene frame/style is unset (flow text, CSS-positioned wrappers).
  // Refreshes on every store mutation since syncStoreToDom may have
  // moved/resized the element.
  const live = useMemo(
    () => readLiveSnapshot(selectedId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, tick],
  );

  return (
    <aside className="inspector-rail" aria-label={t("inspector.ariaLabel")}>
      {/* Tabs */}
      <div className="ins-tabs" role="tablist">
        {([
          ["design", t("inspector.tabs.design")],
          ["layers", t("inspector.tabs.layers")],
          ["proto",  t("inspector.tabs.interaction")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ins-tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="ins-scroll">
        {tab === "design" && (
          <DesignTab
            layer={layer}
            path={path}
            siteId={siteId}
            live={live}
            editingTarget={editingTarget}
            headerLayout={headerLayout}
            onApplyHeaderLayout={onApplyHeaderLayout}
            onOpenHeaderEdit={onOpenHeaderEdit}
            onOpenFooterEdit={onOpenFooterEdit}
            onApplyBodyLayout={onApplyBodyLayout}
            footerStyle={footerStyle}
            onApplyFooterLayout={onApplyFooterLayout}
          />
        )}

        {tab === "layers" && (
          <Suspense fallback={<div className="ins-empty-small">{t("inspector.loading")}</div>}>
            <LayerPanel />
          </Suspense>
        )}

        {tab === "proto" && (
          <InteractionTab layer={layer} />
        )}
      </div>
    </aside>
  );
}

/* ───── Design tab ───────────────────────────────────────────────── */

interface DesignTabProps {
  layer: Layer | null;
  path: Array<{ id: string; name: string; type: string }>;
  siteId?: string;
  live: LiveSnapshot | null;
  /** Forwarded from InspectorPanel — switches empty state to HMF settings. */
  editingTarget?: "body" | "hmf";
  headerLayout?: HmfHeaderLayout;
  onApplyHeaderLayout?: (next: HmfHeaderLayout) => void;
  onOpenHeaderEdit?: () => void;
  onOpenFooterEdit?: () => void;
  onApplyBodyLayout?: (patch: { background?: string; minHeight?: number }) => void;
  footerStyle?: FooterStyle;
  onApplyFooterLayout?: (next: FooterStyle) => void;
}

function DesignTab({
  layer, path, siteId, live,
  editingTarget, headerLayout, onApplyHeaderLayout,
  onOpenHeaderEdit, onOpenFooterEdit, onApplyBodyLayout, footerStyle, onApplyFooterLayout,
}: DesignTabProps) {
  if (!layer) {
    /* HMF mode empty state — show header/footer settings panel. */
    if (editingTarget === "hmf") {
      const layout = headerLayout ?? { sticky: false, height: "auto", background: "" };
      return (
        <div className="ins-hmf-panel">
          <header className="ins-sel-header">
            <div className="ins-sel-row">
              <div className="ins-sel-icon" style={{ color: "#5be5b3" }}>
                <i className="fa-solid fa-table-columns" aria-hidden />
              </div>
              <span className="ins-sel-name-static">헤더/풋터 설정</span>
              <span className="ins-sel-badge">HMF</span>
            </div>
          </header>

          <Section title="헤더 설정">
            <SwatchEditor
              label="배경색"
              value={layout.background}
              onChange={(v) => onApplyHeaderLayout?.({ ...layout, background: v })}
            />
            <div className="ins-prop-row" style={{ marginTop: 8 }}>
              <label className="ins-device-toggle" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={layout.sticky}
                  onChange={(e) => onApplyHeaderLayout?.({ ...layout, sticky: e.target.checked })}
                />
                <span>상단 고정 (sticky)</span>
              </label>
            </div>
          </Section>

          <Section title="고급 편집">
            <div className="ins-prop-row" style={{ gap: 8 }}>
              <button
                type="button"
                onClick={() => onOpenHeaderEdit?.()}
                style={{
                  flex: 1, padding: "8px 10px",
                  background: "#1f2937", color: "#e5e7eb",
                  border: "1px solid #374151", borderRadius: 6,
                  cursor: "pointer", fontSize: 12,
                }}
              >
                <i className="fa-solid fa-pen-to-square" style={{ marginRight: 6 }} />
                헤더 편집
              </button>
              <button
                type="button"
                onClick={() => onOpenFooterEdit?.()}
                style={{
                  flex: 1, padding: "8px 10px",
                  background: "#1f2937", color: "#e5e7eb",
                  border: "1px solid #374151", borderRadius: 6,
                  cursor: "pointer", fontSize: 12,
                }}
              >
                <i className="fa-solid fa-pen-to-square" style={{ marginRight: 6 }} />
                풋터 편집
              </button>
            </div>
          </Section>

          <div className="ins-hmf-notice">
            <i className="fa-solid fa-circle-info" aria-hidden />
            <span>헤더/풋터 변경 사항은 모든 페이지에 즉시 반영됩니다</span>
          </div>
        </div>
      );
    }

    /* Nothing selected → page-region settings: HEADER + BODY + FOOTER
       (background / height) + a hint that selecting an object shows its
       properties. Header settings are SITE-WIDE (all pages), mirroring footer. */
    return (
      <>
        <HeaderSettingsPanel
          headerLayout={headerLayout}
          onApply={onApplyHeaderLayout}
        />
        <BodySettingsPanel onApply={onApplyBodyLayout} />
        <FooterSettingsPanel footerStyle={footerStyle} onApply={onApplyFooterLayout} />
        <div className="ins-empty-sub" style={{ padding: "0 16px", marginTop: 12 }}>
          객체를 클릭하면 해당 객체의 속성이 여기에 표시됩니다.
        </div>
      </>
    );
  }

  const meta = layerMeta(layer.type);
  const sceneFrame = layer.frame ?? { x: 0, y: 0, w: 0, h: 0 };
  // Prefer live geometry — the scene frame is only populated from inline
  // left/top/width/height, but flow text and CSS-positioned elements only
  // have a real bounding box at render time.
  const frame = live?.frame ?? sceneFrame;
  const rotate = Math.round(layer.transform?.rotate ?? 0);

  return (
    <>
      <SelectionHeader layer={layer} path={path} meta={meta} />

      <PositionSizeSection
        frame={frame}
        rotate={rotate}
        layerId={layer.id}
        disabled={layer.type === "section" || layer.type === "inline"}
      />

      {/* Facebook page embed — appears when the selected element holds a FB
          page-plugin iframe (or legacy .fb-page div). Edits URL / width / etc. */}
      {(() => {
        const el =
          typeof document !== "undefined" ? document.getElementById(layer.id) : null;
        return isFacebookEmbed(el) ? (
          <FacebookSection key={layer.id} layerId={layer.id} />
        ) : null;
      })()}

      {/* Google Maps embed — appears when the selected element holds a maps
          iframe. Edits address / embed code / size. */}
      {(() => {
        const el =
          typeof document !== "undefined" ? document.getElementById(layer.id) : null;
        return isGoogleMapEmbed(el) ? (
          <GoogleMapSection key={layer.id} layerId={layer.id} />
        ) : null;
      })()}

      {/* Stacking order (z-index): beginner front/back buttons + expert input. */}
      <ArrangeSection layer={layer} disabled={layer.type === "inline"} />

      {/* Per-device overrides — only visible while editing tablet/mobile.
          Renders null at desktop (the authoring base). */}
      <DeviceSection layer={layer} />

      {/* Image-edit section: appears for image layers (typed src/alt) AND
          for box layers whose innerHtml contains an <img> (e.g., the
          Company Preview .frame wrapping img + decorative overlays). */}
      {(() => {
        if (layer.type === "image") {
          return <ImageSection layer={layer as ImageLayer} siteId={siteId} />;
        }
        if (layer.type === "box") {
          const box = layer as BoxLayer;
          const imgAttrs = readImgFromInnerHtml(box.innerHtml ?? "");
          if (imgAttrs) {
            return <ImageSection layer={layer} initialAttrs={imgAttrs} siteId={siteId} />;
          }
        }
        return null;
      })()}

      <TypographySection layer={layer} live={live} />

      <FillSection layer={layer} live={live} />

      {/* Background image editor — for box layers without an inner <img>,
          let the user set CSS `background-image: url(...)`. Boxes that
          DO have an inner <img> get the ImageSection above instead. */}
      {layer.type === "box" &&
        !readImgFromInnerHtml((layer as BoxLayer).innerHtml ?? "") &&
        !isFacebookEmbed(
          typeof document !== "undefined" ? document.getElementById(layer.id) : null,
        ) &&
        !isGoogleMapEmbed(
          typeof document !== "undefined" ? document.getElementById(layer.id) : null,
        ) && <BackgroundImageSection layer={layer} siteId={siteId} />}

      <BorderSection layer={layer} live={live} />

      <EffectSection layer={layer} live={live} />
    </>
  );
}

/* ─── Image-specific section (2026-04-25) ────────────────────────── */

/**
 * ImageSection — appears in the design tab when the selected layer is an
 * image (typed) OR a box whose innerHtml contains an <img>. Lets the
 * user replace the source (URL paste or file upload), edit alt text,
 * switch object-fit, and set an optional click-through link. Commits
 * flow through `setImage` which mutates the typed fields AND rewrites
 * `innerHtml` in parallel for image layers; for box layers, only
 * innerHtml is rewritten.
 *
 * `initialAttrs` is supplied for box layers (read out of innerHtml at
 * render time). Image layers ignore it and read from typed fields.
 */
function ImageSection({
  layer,
  initialAttrs,
  siteId,
}: {
  layer: Layer;
  initialAttrs?: { src: string; alt?: string; href?: string; hrefTarget?: string; objectFit?: ImageLayer["objectFit"] };
  siteId?: string;
}) {
  const t = useTranslations("editor");
  const setImage = useEditorStore((s) => s.setImage);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const isImage = layer.type === "image";
  const img = isImage ? (layer as ImageLayer) : null;
  const src = isImage ? img!.src ?? "" : initialAttrs?.src ?? "";
  const alt = isImage ? img!.alt ?? "" : initialAttrs?.alt ?? "";
  const href = isImage ? img!.href ?? "" : initialAttrs?.href ?? "";
  const objectFit: string = isImage
    ? (img!.objectFit ?? "")
    : (initialAttrs?.objectFit ?? "");

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${t("inspector.image.uploadFailed")} (${res.status})`);
      }
      const { url } = await res.json();
      if (typeof url === "string") setImage(layer.id, { src: url });
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : t("inspector.image.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title={t("inspector.image.section")}>
      <div className="ins-prop-row">
        <TextField
          label={t("inspector.image.source")}
          value={src}
          placeholder={t("inspector.image.sourcePlaceholder")}
          onCommit={(v) => setImage(layer.id, { src: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <button
          type="button"
          className="ins-btn"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            padding: "8px 10px",
            background: "#2a79ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: uploading ? "wait" : "pointer",
            fontSize: 12,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
          {uploading ? t("inspector.image.uploading") : t("inspector.image.uploadFile")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {uploadErr && (
        <div
          className="ins-prop-row"
          style={{ color: "#ff6b6b", fontSize: 11, padding: "0 4px" }}
        >
          {uploadErr}
        </div>
      )}
      <div className="ins-prop-row">
        <TextField
          label={t("inspector.image.alt")}
          value={alt}
          placeholder={t("inspector.image.altPlaceholder")}
          onCommit={(v) => setImage(layer.id, { alt: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <FitToggle
          value={objectFit}
          onChange={(v) =>
            setImage(layer.id, {
              objectFit: (v || undefined) as ImageLayer["objectFit"],
            })
          }
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label={t("inspector.image.link")}
          value={href}
          placeholder={t("inspector.image.linkPlaceholder")}
          onCommit={(v) => setImage(layer.id, { href: v })}
          wide
        />
      </div>
    </Section>
  );
}

/**
 * BackgroundImageSection — for box layers WITHOUT an inner `<img>`. Sets
 * CSS `background-image: url(...)` via setStyle's `background` field
 * (CSS shorthand handles both color and image). On the first edit, we
 * preserve any existing color/gradient by stripping just the url(...)
 * token and re-emitting `url(<new>) <existing-rest>`.
 */
function BackgroundImageSection({ layer, siteId }: { layer: Layer; siteId?: string }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const bg = layer.style?.background ?? "";
  const urlMatch = bg.match(/url\(["']?([^"')]+)["']?\)/);
  const currentUrl = urlMatch?.[1] ?? "";

  const setBgUrl = (url: string) => {
    if (!url) {
      // Clear: strip the url() token, keep the rest. If nothing else
      // remains, drop background entirely.
      const stripped = bg.replace(/url\(["']?[^"')]+["']?\)\s*/g, "").trim();
      setStyle(layer.id, { background: stripped || undefined });
      return;
    }
    if (urlMatch) {
      const next = bg.replace(/url\(["']?[^"')]+["']?\)/, `url("${url}")`);
      setStyle(layer.id, { background: next });
    } else {
      // No prior url — append. Center / cover / no-repeat is the most
      // common useful default for background imagery.
      const prefix = bg ? `${bg} ` : "";
      setStyle(layer.id, {
        background: `${prefix}url("${url}") center/cover no-repeat`,
      });
    }
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${t("inspector.bgImage.uploadFailed")} (${res.status})`);
      }
      const { url } = await res.json();
      if (typeof url === "string") setBgUrl(url);
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : t("inspector.bgImage.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title={t("inspector.bgImage.section")}>
      <div className="ins-prop-row">
        <TextField
          label="URL"
          value={currentUrl}
          placeholder={t("inspector.image.sourcePlaceholder")}
          onCommit={setBgUrl}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            flex: 1,
            padding: "8px 10px",
            background: "#2a79ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: uploading ? "wait" : "pointer",
            fontSize: 12,
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <i className="fa-solid fa-upload" style={{ marginRight: 6 }} />
          {uploading ? t("inspector.bgImage.uploading") : t("inspector.bgImage.upload")}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => setBgUrl("")}
            title={t("inspector.bgImage.remove")}
            style={{
              padding: "8px 10px",
              background: "#3a3d4a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            <i className="fa-solid fa-trash" />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {uploadErr && (
        <div
          className="ins-prop-row"
          style={{ color: "#ff6b6b", fontSize: 11, padding: "0 4px" }}
        >
          {uploadErr}
        </div>
      )}
    </Section>
  );
}

function FitToggle({
  value,
  onChange,
}: {
  value: string;
  onChange(v: string): void;
}) {
  const t = useTranslations("editor");
  const opts: Array<[string, string]> = [
    ["", t("inspector.image.fitAuto")],
    ["cover", "cover"],
    ["contain", "contain"],
    ["fill", "fill"],
    ["none", "none"],
  ];
  return (
    <div className="ins-prop wide">
      <label>{t("inspector.image.fitLabel")}</label>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {opts.map(([v, label]) => (
          <button
            key={v || "auto"}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: "1 1 auto",
              padding: "5px 8px",
              fontSize: 11,
              border: "1px solid #2a2d3a",
              background: value === v ? "#2a79ff" : "#1a1c24",
              color: value === v ? "#fff" : "#c6c9d6",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───── Sub-components ───────────────────────────────────────────── */

function SelectionHeader({
  layer,
  path,
  meta,
}: {
  layer: Layer;
  path: Array<{ id: string; name: string; type: string }>;
  meta: { label: string; icon: string; color: string };
}) {
  const rename = useEditorStore((s) => s.rename);
  const [draft, setDraft] = useState(layer.name);
  useEffect(() => setDraft(layer.name), [layer.id, layer.name]);

  return (
    <header className="ins-sel-header">
      <div className="ins-sel-row">
        <div className="ins-sel-icon" style={{ color: meta.color }}>
          <i className={`fa-solid ${meta.icon}`} aria-hidden />
        </div>
        <input
          className="ins-sel-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== layer.name) rename(layer.id, draft || layer.name);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              setDraft(layer.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="ins-sel-badge">{meta.label}</span>
      </div>
      {path.length > 1 && (
        <div className="ins-sel-path">
          {path.slice(-4).map((p, i, arr) => (
            <span key={p.id} className="ins-sel-seg">
              <span className={i === arr.length - 1 ? "cur" : ""}>
                {p.name}
              </span>
              {i < arr.length - 1 && (
                <i className="fa-solid fa-chevron-right ins-sel-chev" aria-hidden />
              )}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

interface PosProps {
  frame: { x: number; y: number; w: number; h: number };
  rotate: number;
  layerId: LayerId;
  disabled: boolean;
}

function PositionSizeSection({ frame, rotate, layerId, disabled }: PosProps) {
  const t = useTranslations("editor");
  const setFrame = useEditorStore((s) => s.setFrame);
  const setTransform = useEditorStore((s) => s.setTransform);

  const commitFrame = (patch: Partial<{ x: number; y: number; w: number; h: number }>) => {
    if (disabled) return;
    const cleaned: typeof patch = {};
    for (const k of ["x", "y", "w", "h"] as const) {
      if (patch[k] !== undefined && Number.isFinite(patch[k])) cleaned[k] = patch[k];
    }
    if (Object.keys(cleaned).length > 0) setFrame(layerId, cleaned);
  };

  return (
    <Section title={t("inspector.position.section")}>
      <div className="ins-prop-grid">
        <EditableProp
          label="X"
          value={frame.x}
          unit="px"
          onCommit={(v) => commitFrame({ x: v })}
          disabled={disabled}
        />
        <EditableProp
          label="Y"
          value={frame.y}
          unit="px"
          onCommit={(v) => commitFrame({ y: v })}
          disabled={disabled}
        />
        <EditableProp
          label="W"
          value={frame.w}
          unit="px"
          onCommit={(v) => commitFrame({ w: v })}
        />
        <EditableProp
          label="H"
          value={frame.h}
          unit="px"
          onCommit={(v) => commitFrame({ h: v })}
        />
        <EditableProp
          label="⟳"
          value={rotate}
          unit="°"
          onCommit={(v) => setTransform(layerId, { rotate: v })}
        />
        <EditableProp label="◱" value={0} unit="°" onCommit={() => {}} disabled />
      </div>
    </Section>
  );
}

/* ─── Stacking-order (z-index) section ───────────────────────────────
 * Two tiers:
 *   • Beginner — PowerPoint-style 맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로 buttons.
 *     Front/back are computed against the SELECTED element's live sibling
 *     z-indexes (read from the DOM), so they work for body, header and footer
 *     objects alike. Forward/back just ±1 the current value.
 *   • Expert — a raw z-index number input.
 * All write `style.zIndex` via setStyle → mutateOwning routes to the owning
 * scene (body/header/footer) → applyStyleToEl emits `z-index` on the element. */
function ArrangeSection({ layer, disabled }: { layer: Layer; disabled: boolean }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);

  const domEl = () => (typeof document !== "undefined" ? document.getElementById(layer.id) : null);
  const computedZ = (el: HTMLElement | null): number => {
    if (!el) return 0;
    const z = parseInt(window.getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  };
  // Current effective z-index: explicit scene value wins, else the rendered one.
  const current = layer.style?.zIndex ?? computedZ(domEl());

  const siblingZ = (): number[] => {
    const el = domEl();
    const parent = el?.parentElement;
    if (!el || !parent) return [];
    return Array.from(parent.children)
      .filter((c) => c !== el && c instanceof HTMLElement && c.classList.contains("dragable"))
      .map((c) => computedZ(c as HTMLElement));
  };
  const apply = (z: number) => {
    if (disabled) return;
    // Clamp to >= 0 (HMF contract). A NEGATIVE z-index escapes the header/body
    // root stacking context and paints BEHIND the page body — e.g. "맨 뒤로" on a
    // menu background bar set z-index:-1, which rendered fine in the editor but
    // vanished under the hero image on the published page. front/back/raw-input
    // all route through here, so this guards every path.
    setStyle(layer.id, { zIndex: Math.max(0, Math.round(z)) });
  };
  const toFront = () => {
    const sib = siblingZ();
    apply((sib.length ? Math.max(...sib) : current) + 1);
  };
  const toBack = () => {
    const sib = siblingZ();
    apply((sib.length ? Math.min(...sib) : current) - 1);
  };

  const btn = (label: string, title: string, onClick: () => void, svg: ReactNode) => (
    <button
      type="button"
      className="ins-arrange-btn"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <span className="ins-arrange-ic" aria-hidden>{svg}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <Section title={t("inspector.arrange.section")}>
      <div className="ins-arrange-grid">
        {btn(
          t("inspector.arrange.toFront"),
          t("inspector.arrange.toFrontTitle"),
          toFront,
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" fillOpacity="0.18"/><path d="M3 9l9-6 9 6-9 6-9-6z"/></svg>,
        )}
        {btn(
          t("inspector.arrange.forward"),
          t("inspector.arrange.forwardTitle"),
          () => apply(current + 1),
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>,
        )}
        {btn(
          t("inspector.arrange.backward"),
          t("inspector.arrange.backwardTitle"),
          () => apply(current - 1),
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>,
        )}
        {btn(
          t("inspector.arrange.toBack"),
          t("inspector.arrange.toBackTitle"),
          toBack,
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/><path d="M3 15l9 6 9-6-9-6-9 6z" fill="currentColor" fillOpacity="0.18"/></svg>,
        )}
      </div>
      <div className="ins-prop-grid" style={{ marginTop: 8 }}>
        <EditableProp
          label="z-index"
          value={current}
          unit=""
          onCommit={(v) => apply(v)}
          disabled={disabled}
        />
        <button
          type="button"
          className="ins-arrange-reset"
          onClick={() => !disabled && setStyle(layer.id, { zIndex: undefined })}
          disabled={disabled}
          title={t("inspector.arrange.autoTitle")}
        >
          {t("inspector.arrange.auto")}
        </button>
      </div>
    </Section>
  );
}

/* ─── Per-device override section (mutable-baking-falcon Phase 3/4) ── */

/**
 * DeviceSection — surfaces the per-breakpoint overrides for the currently
 * selected layer, but ONLY while the editor is in tablet/mobile viewport
 * (desktop is the authoring base and renders nothing). Two override families
 * are exposed, both keyed off the active `viewportMode`:
 *
 *   • Visibility — `hidden[device]` → `display:none !important` in the device
 *     `@media` block (applies to both paradigms).
 *   • Cascade nudges — `responsive[device]` ResponsiveOverride
 *     (display / fontScale / align / padding / flexDirection) for FLOW layers.
 *
 * Absolute device-frame re-pins (tabletFrame/mobileFrame) are written by
 * drag/resize on the canvas, not here, so this panel stays declarative.
 */
function DeviceSection({ layer }: { layer: Layer }) {
  const t = useTranslations("editor");
  const viewportMode = useEditorStore(selectViewportMode);
  const setHidden = useEditorStore((s) => s.setHidden);
  const setResponsive = useEditorStore((s) => s.setResponsive);

  const device = viewportMode as HideDevice;
  const isDesktop = device === "desktop";
  const deviceLabel = isDesktop
    ? t("viewport.desktop")
    : device === "tablet"
      ? t("viewport.tablet")
      : t("viewport.mobile");

  const isHidden = !!layer.hidden?.[device];
  // Cascade nudges (fontScale/padding/…) apply only to non-desktop devices.
  const odevice = (isDesktop ? "mobile" : device) as OverrideDevice;
  const ov: ResponsiveOverride = isDesktop ? {} : layer.responsive?.[odevice] ?? {};

  return (
    <Section title={`${deviceLabel} ${t("inspector.device.section")}`}>
      <p className="ins-device-hint">
        {isDesktop
          ? "이 객체를 PC(데스크탑)에서 숨깁니다. 모바일/태블릿에서 추가한 객체는 기본적으로 PC에서 숨겨집니다."
          : t("inspector.device.hint")}
      </p>

      {/* Visibility toggle — applies to any layer, on any device incl. PC. */}
      <label className="ins-device-toggle">
        <input
          type="checkbox"
          checked={isHidden}
          onChange={(e) => setHidden(layer.id, device, e.target.checked)}
        />
        <span>{t("inspector.device.hide")}</span>
      </label>

      {!isDesktop && !isHidden && (
        <>
          {/* Cascade nudges (flow layers). Empty fields inherit the larger
              breakpoint, so leaving a control at its default = no override. */}
          <div className="ins-prop-row">
            <div className="ins-prop wide">
              <label>{t("inspector.device.display")}</label>
              <select
                value={ov.display ?? ""}
                onChange={(e) =>
                  setResponsive(layer.id, odevice, {
                    display: (e.target.value || undefined) as ResponsiveOverride["display"],
                  })
                }
              >
                <option value="">{t("inspector.device.inherit")}</option>
                <option value="block">block</option>
                <option value="flex">flex</option>
                <option value="inline-block">inline-block</option>
                <option value="none">none</option>
              </select>
            </div>
          </div>

          <div className="ins-prop-row">
            <TextField
              label={t("inspector.device.fontScale")}
              value={ov.fontScale != null ? String(ov.fontScale) : ""}
              placeholder="1.0"
              onCommit={(v) => {
                const n = parseFloat(v);
                setResponsive(layer.id, odevice, {
                  fontScale: Number.isFinite(n) && n > 0 ? n : undefined,
                });
              }}
            />
            <TextField
              label={t("inspector.device.padding")}
              value={ov.padding ?? ""}
              placeholder="8px 16px"
              onCommit={(v) =>
                setResponsive(layer.id, odevice, { padding: v.trim() || undefined })
              }
            />
          </div>

          <div className="ins-prop-row">
            <div className="ins-prop wide">
              <label>{t("inspector.device.align")}</label>
              <select
                value={ov.align ?? ""}
                onChange={(e) =>
                  setResponsive(layer.id, odevice, {
                    align: (e.target.value || undefined) as ResponsiveOverride["align"],
                  })
                }
              >
                <option value="">{t("inspector.device.inherit")}</option>
                <option value="left">left</option>
                <option value="center">center</option>
                <option value="right">right</option>
              </select>
            </div>
            <div className="ins-prop wide">
              <label>{t("inspector.device.stack")}</label>
              <select
                value={ov.flexDirection ?? ""}
                onChange={(e) =>
                  setResponsive(layer.id, odevice, {
                    flexDirection: (e.target.value || undefined) as ResponsiveOverride["flexDirection"],
                  })
                }
              >
                <option value="">{t("inspector.device.inherit")}</option>
                <option value="row">row</option>
                <option value="column">column</option>
              </select>
            </div>
          </div>

          {(ov.display || ov.fontScale != null || ov.padding || ov.align || ov.flexDirection) && (
            <button
              type="button"
              className="ins-device-clear"
              onClick={() => setResponsive(layer.id, odevice, null)}
            >
              <i className="fa-solid fa-rotate-left" aria-hidden />{" "}
              {t("inspector.device.clear")}
            </button>
          )}
        </>
      )}
    </Section>
  );
}

/* ─── Style-editing sections (Sprint 9k) ──────────────────────────── */

function TypographySection({ layer, live }: { layer: Layer; live: LiveSnapshot | null }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  // Prefer the inline override; fall back to the rendered computed value.
  // Empty string still wins over live so users can deliberately clear an
  // override and have the next render re-populate from CSS.
  return (
    <Section title={t("inspector.typography.section")}>
      <div className="ins-prop-row">
        <FontPickerField
          label={t("inspector.typography.font")}
          value={s.fontFamily ?? live?.fontFamily ?? ""}
          onChange={(v) => setStyle(layer.id, { fontFamily: v })}
        />
      </div>
      <div className="ins-prop-row">
        <DimensionField
          label={t("inspector.typography.size")}
          value={s.fontSize ?? live?.fontSize ?? ""}
          placeholder="16"
          defaultUnit="px"
          onCommit={(v) => setStyle(layer.id, { fontSize: v })}
        />
        <TextField
          label={t("inspector.typography.weight")}
          value={
            s.fontWeight != null ? String(s.fontWeight) : (live?.fontWeight ?? "")
          }
          placeholder="400"
          onCommit={(v) => setStyle(layer.id, { fontWeight: v })}
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label={t("inspector.typography.lineHeight")}
          value={s.lineHeight ?? live?.lineHeight ?? ""}
          placeholder="1.6"
          onCommit={(v) => setStyle(layer.id, { lineHeight: v })}
        />
        <DimensionField
          label={t("inspector.typography.letterSpacing")}
          value={s.letterSpacing ?? live?.letterSpacing ?? ""}
          placeholder="0"
          defaultUnit="em"
          onCommit={(v) => setStyle(layer.id, { letterSpacing: v })}
        />
      </div>
      <div className="ins-prop-row">
        <AlignToggle
          value={s.textAlign ?? live?.textAlign ?? ""}
          onChange={(v) => setStyle(layer.id, { textAlign: v as LayerStyle["textAlign"] })}
        />
      </div>
      <SwatchEditor
        label={t("inspector.typography.color")}
        value={s.color ?? live?.color ?? ""}
        onChange={(v) => setStyle(layer.id, { color: v })}
      />
    </Section>
  );
}

function FillSection({ layer, live }: { layer: Layer; live: LiveSnapshot | null }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};

  // Background value: prefer the scene-stored value (inline override set by a
  // previous fill edit) then fall back to the live computed background-color.
  // `applyStyleToEl` in editor-sync.ts handles the visual — when a solid color
  // is set it suppresses absolutely-positioned overlay children (bg images,
  // gradient divs, <img> containers) so the result is actually visible.
  const bgValue = s.background ?? live?.background ?? "";
  const opacityValue =
    s.opacity != null ? String(s.opacity) : (live?.opacity ?? "");
  return (
    <Section title={t("inspector.fill.section")}>
      <SwatchEditor
        label={t("inspector.fill.bg")}
        value={bgValue}
        onChange={(v) => setStyle(layer.id, { background: v })}
      />
      <div className="ins-prop-row">
        <TextField
          label={t("inspector.fill.opacity")}
          value={opacityValue}
          placeholder="1"
          onCommit={(v) => {
            if (v === "") {
              setStyle(layer.id, { opacity: undefined });
              return;
            }
            const n = parseFloat(v);
            if (Number.isFinite(n)) {
              setStyle(layer.id, { opacity: Math.max(0, Math.min(1, n)) });
            }
          }}
        />
      </div>
    </Section>
  );
}

function BorderSection({ layer, live }: { layer: Layer; live: LiveSnapshot | null }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title={t("inspector.border.section")}>
      <SwatchEditor
        label={t("inspector.border.color")}
        value={s.borderColor ?? live?.borderColor ?? ""}
        onChange={(v) => setStyle(layer.id, { borderColor: v })}
      />
      <div className="ins-prop-row">
        <DimensionField
          label={t("inspector.border.width")}
          value={s.borderWidth ?? live?.borderWidth ?? ""}
          placeholder="1"
          defaultUnit="px"
          onCommit={(v) => setStyle(layer.id, { borderWidth: v })}
        />
        <DimensionField
          label={t("inspector.border.radius")}
          value={s.borderRadius ?? live?.borderRadius ?? ""}
          placeholder="8"
          defaultUnit="px"
          onCommit={(v) => setStyle(layer.id, { borderRadius: v })}
        />
      </div>
      <div className="ins-prop-row">
        <SelectField
          label={t("inspector.border.style")}
          value={s.borderStyle ?? live?.borderStyle ?? ""}
          options={[
            ["", t("inspector.border.styleNone")],
            ["solid", "solid"],
            ["dashed", "dashed"],
            ["dotted", "dotted"],
            ["double", "double"],
          ]}
          onChange={(v) =>
            setStyle(layer.id, { borderStyle: (v || undefined) as LayerStyle["borderStyle"] })
          }
        />
      </div>
    </Section>
  );
}

function EffectSection({ layer, live }: { layer: Layer; live: LiveSnapshot | null }) {
  const t = useTranslations("editor");
  const setStyle = useEditorStore((s) => s.setStyle);
  const s = layer.style ?? {};
  return (
    <Section title={t("inspector.effect.section")}>
      <div className="ins-prop-row">
        <TextField
          label="box-shadow"
          value={s.boxShadow ?? live?.boxShadow ?? ""}
          placeholder="0 4px 10px rgba(0,0,0,.25)"
          onCommit={(v) => setStyle(layer.id, { boxShadow: v })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="filter"
          value={s.filter ?? live?.filter ?? ""}
          placeholder="blur(4px)"
          onCommit={(v) => setStyle(layer.id, { filter: v })}
          wide
        />
      </div>
    </Section>
  );
}

/* ─── Interaction tab (Sprint 9k) ─────────────────────────────────── */

function InteractionTab({ layer }: { layer: Layer | null }) {
  const t = useTranslations("editor");
  const setInteraction = useEditorStore((s) => s.setInteraction);

  if (!layer) {
    return (
      <div className="ins-empty">
        <div className="ins-empty-icon">
          <i className="fa-solid fa-bolt" aria-hidden />
        </div>
        <div className="ins-empty-title">{t("inspector.interactionEmpty.title")}</div>
        <div className="ins-empty-sub">
          {t("inspector.interactionEmpty.l1")}
          <br />
          {t("inspector.interactionEmpty.l2")}
        </div>
      </div>
    );
  }

  const interaction = layer.interaction ?? null;
  const kind = interaction?.kind ?? "";

  const setKind = (k: string) => {
    if (k === "") {
      setInteraction(layer.id, null);
      return;
    }
    if (k === "link") setInteraction(layer.id, { kind: "link", href: "" });
    else if (k === "scrollTo") setInteraction(layer.id, { kind: "scrollTo", targetId: "", smooth: true });
    else if (k === "modal") setInteraction(layer.id, { kind: "modal", targetId: "" });
    else if (k === "toggle") setInteraction(layer.id, { kind: "toggle", targetId: "", className: "active" });
  };

  return (
    <div className="ins-interaction-tab">
      <header className="ins-sel-header">
        <div className="ins-sel-row">
          <div className="ins-sel-icon" style={{ color: "#f4b66a" }}>
            <i className="fa-solid fa-bolt" aria-hidden />
          </div>
          <div className="ins-sel-name-static">{layer.name}</div>
        </div>
      </header>

      <Section title={t("inspector.interaction.section")}>
        <div className="ins-prop-row">
          <SelectField
            label={t("inspector.interaction.action")}
            value={kind}
            options={[
              ["", t("inspector.interaction.actionNone")],
              ["link", t("inspector.interaction.actionLink")],
              ["scrollTo", t("inspector.interaction.actionScrollTo")],
              ["modal", t("inspector.interaction.actionModal")],
              ["toggle", t("inspector.interaction.actionToggle")],
            ]}
            onChange={setKind}
          />
        </div>

        {interaction?.kind === "link" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label="URL"
                value={interaction.href}
                placeholder="https://..."
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, href: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <SelectField
                label={t("inspector.interaction.target")}
                value={interaction.target ?? "_self"}
                options={[
                  ["_self", t("inspector.interaction.targetSelf")],
                  ["_blank", t("inspector.interaction.targetBlank")],
                ]}
                onChange={(v) =>
                  setInteraction(layer.id, {
                    ...interaction,
                    target: v === "_blank" ? "_blank" : "_self",
                  })
                }
              />
            </div>
          </>
        )}

        {interaction?.kind === "scrollTo" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label={t("inspector.interaction.targetId")}
                value={interaction.targetId}
                placeholder="obj_sec_xxx"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, targetId: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <SelectField
                label={t("inspector.interaction.smooth")}
                value={interaction.smooth ? "1" : "0"}
                options={[
                  ["1", t("inspector.interaction.smoothYes")],
                  ["0", t("inspector.interaction.smoothNo")],
                ]}
                onChange={(v) =>
                  setInteraction(layer.id, { ...interaction, smooth: v === "1" })
                }
              />
            </div>
          </>
        )}

        {interaction?.kind === "modal" && (
          <div className="ins-prop-row">
            <TextField
              label={t("inspector.interaction.modalId")}
              value={interaction.targetId}
              placeholder="modal-xxx"
              onCommit={(v) =>
                setInteraction(layer.id, { ...interaction, targetId: v })
              }
              wide
            />
          </div>
        )}

        {interaction?.kind === "toggle" && (
          <>
            <div className="ins-prop-row">
              <TextField
                label={t("inspector.interaction.targetId")}
                value={interaction.targetId}
                placeholder="menu-panel"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, targetId: v })
                }
                wide
              />
            </div>
            <div className="ins-prop-row">
              <TextField
                label={t("inspector.interaction.className")}
                value={interaction.className}
                placeholder="active"
                onCommit={(v) =>
                  setInteraction(layer.id, { ...interaction, className: v })
                }
                wide
              />
            </div>
          </>
        )}

        {kind !== "" && (
          <button
            type="button"
            className="ins-empty-btn"
            onClick={() => setInteraction(layer.id, null)}
          >
            <i className="fa-solid fa-xmark" aria-hidden /> {t("inspector.interaction.remove")}
          </button>
        )}
      </Section>

      <div className="ins-empty-sub" style={{ padding: "0 16px", marginTop: 8 }}>
        {t("inspector.interaction.note")}
      </div>
    </div>
  );
}

/* ─── Small reusable editors ──────────────────────────────────────── */

function EditableProp({
  label,
  value,
  unit,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  unit: string;
  onCommit(value: number): void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);

  return (
    <div className={`ins-prop${disabled ? " disabled" : ""}`}>
      <label>{label}</label>
      <input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.\-]/g, ""))}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isFinite(n)) onCommit(n);
          else setDraft(String(Math.round(value)));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(String(Math.round(value)));
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="unit">{unit}</span>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
  wide,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit(value: string): void;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className={`ins-prop${wide ? " wide" : ""}`}>
      <label>{label}</label>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

/**
 * FontPickerField — typography font selector with live previews.
 *
 * Backed by the shared font-catalog so the inspector matches the 테마 tab.
 * The trigger shows the current selection rendered in its own face; the
 * popover groups fonts by category (고딕 / 명조 / 디스플레이 / 손글씨 /
 * 고정폭) and each row previews itself in the target font so users can
 * recognise styles at a glance.
 *
 * `value` is the raw CSS `font-family` string stored on the layer. We
 * reverse-look it up against catalog markers to highlight the active row;
 * unknown values still display their string verbatim in the trigger so
 * legacy inline styles aren't lost.
 */
function FontPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const t = useTranslations("editor");
  const [open, setOpen] = useState(false);
  // Anchor coords for the fixed-position popover — recomputed on open
  // and on scroll/resize. We use `position: fixed` (instead of absolute
  // inside `.ins-font-picker`) because the inspector's `.ins-scroll`
  // ancestor has `overflow-y: auto`, which clips absolutely-positioned
  // descendants to its scroll viewport. Fixed positioning + viewport
  // coords escapes the clip.
  const [anchor, setAnchor] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeFont: FontDef | null = useMemo(() => {
    if (!value) return null;
    return FONT_CATALOG.find((f) => value.includes(f.marker)) ?? null;
  }, [value]);

  // Recompute anchor coords when opening, plus when the user scrolls
  // any ancestor (the inspector itself, the page) or resizes the window.
  useEffect(() => {
    if (!open) return;
    const recompute = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    recompute();
    window.addEventListener("scroll", recompute, true); // capture for nested scrollers
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  // Close popover on outside click / Escape. The popover lives outside
  // `ref` (it's a sibling fragment, not inside .ins-font-picker), so we
  // also need to ignore clicks landing inside the popover element.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerLabel = activeFont ? activeFont.label : value || t("inspector.fontFamily.default");
  const triggerStyle = activeFont
    ? { fontFamily: activeFont.stack }
    : value
      ? { fontFamily: value }
      : undefined;

  return (
    <div className="ins-prop wide ins-font-picker" ref={ref}>
      <label>{label}</label>
      <button
        ref={triggerRef}
        type="button"
        className={`ins-font-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={value || t("inspector.fontFamily.defaultTitle")}
        style={triggerStyle}
      >
        <span className="ins-font-trigger-label">{triggerLabel}</span>
        <i className="fa-solid fa-chevron-down" aria-hidden />
      </button>
      {open && anchor && (
        <div
          ref={popoverRef}
          className="ins-font-popover"
          role="listbox"
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: anchor.width,
          }}
        >
          <button
            type="button"
            className={`ins-font-option${!value ? " active" : ""}`}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span className="ins-font-option-label">{t("inspector.fontFamily.defaultLong")}</span>
          </button>
          {FONT_CATEGORIES.map((cat) => {
            const fonts = FONT_CATALOG.filter((f) => f.category === cat.key);
            if (fonts.length === 0) return null;
            return (
              <div key={cat.key} className="ins-font-group">
                <div className="ins-font-group-label">{cat.label}</div>
                {fonts.map((f) => {
                  const active = activeFont?.id === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`ins-font-option${active ? " active" : ""}`}
                      onClick={() => {
                        onChange(f.stack);
                        setOpen(false);
                      }}
                      style={{ fontFamily: f.stack }}
                      title={`${f.label} · ${f.english}`}
                    >
                      <span className="ins-font-option-label">{f.label}</span>
                      <span className="ins-font-option-sample">{t("inspector.fontFamily.sample")}</span>
                      {active && (
                        <i className="fa-solid fa-check" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * DimensionField — a TextField variant for CSS length values that splits
 * the numeric part from the unit. The input only shows the number; the
 * unit (px/em/rem/%) sits outside as a read-only suffix, matching the
 * 위치·크기 row so users don't have to type "px" themselves.
 *
 * On commit:
 *   - Bare number (e.g. "8")          → append `${defaultUnit}` (e.g. "8px")
 *   - Number + unit (e.g. "1.5rem")   → use verbatim
 *   - Empty / invalid                 → emit as-is (lets user clear the token)
 *
 * On display: parses `value` into { num, unit }; the typed unit is
 * preserved so re-edit doesn't clobber em/rem/%. Falls back to
 * `defaultUnit` when `value` has no explicit unit.
 */
function DimensionField({
  label,
  value,
  placeholder,
  defaultUnit = "px",
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  defaultUnit?: string;
  onCommit(value: string): void;
}) {
  const parse = (v: string): { num: string; unit: string } => {
    const s = (v ?? "").trim();
    if (!s) return { num: "", unit: defaultUnit };
    const m = s.match(/^(-?\d+(?:\.\d+)?)\s*([a-z%]*)$/i);
    if (m) return { num: m[1]!, unit: m[2] || defaultUnit };
    // Unparseable (e.g. calc(), var()) — show raw, no unit suffix.
    return { num: s, unit: "" };
  };
  const initial = parse(value);
  const [draft, setDraft] = useState(initial.num);
  const [unitDraft, setUnitDraft] = useState(initial.unit);
  useEffect(() => {
    const p = parse(value);
    setDraft(p.num);
    setUnitDraft(p.unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const commit = () => {
    const typed = draft.trim();
    if (!typed) {
      if (value !== "") onCommit("");
      return;
    }
    // Bare number → append the current unit (or defaultUnit if none).
    if (/^-?\d+(?:\.\d+)?$/.test(typed)) {
      const next = `${typed}${unitDraft || defaultUnit}`;
      if (next !== value) onCommit(next);
      return;
    }
    // Number + unit (e.g. 1.5rem) — use the whole thing, re-parse on next tick.
    if (/^-?\d+(?:\.\d+)?\s*[a-z%]+$/i.test(typed)) {
      if (typed !== value) onCommit(typed);
      return;
    }
    // Unparseable — trust user input.
    if (typed !== value) onCommit(typed);
  };
  return (
    <div className="ins-prop">
      <label>{label}</label>
      <input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(parse(value).num);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {unitDraft && <span className="unit">{unitDraft}</span>}
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<readonly [string, string]>;
  onChange(value: string): void;
}) {
  return (
    <div className="ins-prop">
      <label>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="ins-select"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function AlignToggle({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const t = useTranslations("editor");
  const opts: Array<[string, string, string]> = [
    ["left",    "fa-align-left",    t("inspector.align.left")],
    ["center",  "fa-align-center",  t("inspector.align.center")],
    ["right",   "fa-align-right",   t("inspector.align.right")],
    ["justify", "fa-align-justify", t("inspector.align.justify")],
  ];
  return (
    <div className="ins-align-toggle" role="radiogroup" aria-label={t("inspector.align.ariaLabel")}>
      {opts.map(([v, icon, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          title={label}
          className={`ins-align-btn${value === v ? " active" : ""}`}
          onClick={() => onChange(value === v ? "" : v)}
        >
          <i className={`fa-solid ${icon}`} aria-hidden />
        </button>
      ))}
    </div>
  );
}

function SwatchEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const colorProbe = /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#000000";
  return (
    <div className="ins-swatch-editor">
      <label>{label}</label>
      <input
        type="color"
        className="ins-swatch-color"
        value={colorProbe}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
      />
      <input
        className="ins-swatch-input"
        value={draft}
        placeholder="#000000"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

/* ─── Facebook page embed section (2026-06-13) ──────────────────────────
 * Appears for any selected element whose DOM contains a Facebook page embed
 * (a standalone plugins/page.php iframe OR a legacy `.fb-page` SDK div). Edits
 * the page URL / width / height / tabs / display options and rebuilds the
 * iframe in the live DOM via applyFacebookEmbed — the normal save path
 * (cloneSceneForDesktopSave) snapshots the element's innerHTML, so the change
 * persists without any scene-type or save-pipeline change. Width also resizes
 * the container box (per-device aware via setFrame). */
function FacebookSection({ layerId }: { layerId: string }) {
  const initial = (): FacebookEmbedOpts =>
    parseFacebookEmbed(
      typeof document !== "undefined" ? document.getElementById(layerId) : null,
    ) ?? FB_DEFAULTS;
  const [opts, setOpts] = useState<FacebookEmbedOpts>(initial);

  const apply = (patch: Partial<FacebookEmbedOpts>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    const host = document.getElementById(layerId);
    if (!host) return;
    applyFacebookEmbed(host, next);
    if (patch.width != null || patch.height != null) {
      // Keep the container box in sync with the widget so the selection box
      // matches; setFrame routes to the active device frame automatically.
      useEditorStore.getState().setFrame(layerId, {
        w: clampFbWidth(next.width),
        h: clampFbHeight(next.height),
      });
    }
  };

  const toggleTab = (tab: string) => {
    const tabs = opts.tabs.includes(tab)
      ? opts.tabs.filter((x) => x !== tab)
      : [...opts.tabs, tab];
    apply({ tabs: tabs.length ? tabs : ["timeline"] });
  };
  const tabLabel = (t: string) =>
    t === "timeline" ? "타임라인" : t === "events" ? "이벤트" : t === "messages" ? "메시지" : t;

  return (
    <Section title="Facebook 설정">
      <div className="ins-prop-row">
        <TextField
          label="페이지 URL"
          value={opts.href}
          placeholder="https://www.facebook.com/yourpage"
          onCommit={(v) => apply({ href: v.trim() })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="폭(px)"
          value={String(opts.width)}
          onCommit={(v) => apply({ width: clampFbWidth(parseInt(v, 10) || opts.width) })}
        />
        <TextField
          label="높이(px)"
          value={String(opts.height)}
          onCommit={(v) => apply({ height: clampFbHeight(parseInt(v, 10) || opts.height) })}
        />
      </div>
      <div className="ins-prop-row" style={{ flexWrap: "wrap", gap: 10 }}>
        {FB_TAB_OPTIONS.map((tab) => (
          <label key={tab} className="ins-device-toggle" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={opts.tabs.includes(tab)}
              onChange={() => toggleTab(tab)}
            />
            <span>{tabLabel(tab)}</span>
          </label>
        ))}
      </div>
      <div className="ins-prop-row" style={{ flexWrap: "wrap", gap: 10 }}>
        <label className="ins-device-toggle" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={opts.smallHeader}
            onChange={(e) => apply({ smallHeader: e.target.checked })}
          />
          <span>작은 헤더</span>
        </label>
        <label className="ins-device-toggle" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={opts.hideCover}
            onChange={(e) => apply({ hideCover: e.target.checked })}
          />
          <span>표지 숨김</span>
        </label>
        <label className="ins-device-toggle" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={opts.showFacepile}
            onChange={(e) => apply({ showFacepile: e.target.checked })}
          />
          <span>친구 얼굴</span>
        </label>
      </div>
      <div className="ins-hmf-notice" style={{ marginTop: 8 }}>
        <i className="fa-solid fa-circle-info" aria-hidden />
        <span>폭은 Facebook 정책상 180~500px로 제한됩니다. 변경 후 저장하면 퍼블리시에 반영됩니다.</span>
      </div>
    </Section>
  );
}

/* ─── Google Maps embed section (2026-06-13) ────────────────────────────
 * Same pattern as FacebookSection: appears when the selected element holds a
 * Google Maps iframe. Accepts a plain address (→ basic map) OR a pasted Google
 * Maps embed code / embed URL (→ rich place card), plus width/height. */
function GoogleMapSection({ layerId }: { layerId: string }) {
  const initial = (): GoogleMapEmbedOpts =>
    parseGoogleMapEmbed(
      typeof document !== "undefined" ? document.getElementById(layerId) : null,
    ) ?? GMAP_DEFAULTS;
  const [opts, setOpts] = useState<GoogleMapEmbedOpts>(initial);

  const apply = (patch: Partial<GoogleMapEmbedOpts>) => {
    const next = { ...opts, ...patch };
    setOpts(next);
    const host = document.getElementById(layerId);
    if (!host) return;
    applyGoogleMapEmbed(host, next);
    if (patch.width != null || patch.height != null) {
      useEditorStore.getState().setFrame(layerId, {
        w: clampMapSize(next.width),
        h: clampMapSize(next.height),
      });
    }
  };

  // Show the clean address for a q-form src; the full src for a pasted embed.
  const display = (() => {
    try {
      const u = new URL(opts.src, "https://maps.google.com");
      const q = u.searchParams.get("q");
      if (q) return q;
    } catch {
      /* not a parseable URL — fall through */
    }
    return opts.src;
  })();

  return (
    <Section title="Google 지도 설정">
      <div className="ins-prop-row">
        <TextField
          label="주소 또는 임베드 코드"
          value={display}
          placeholder="예: 1751 Pittwater Rd, Mona Vale NSW"
          onCommit={(v) => apply({ src: resolveMapInput(v) })}
          wide
        />
      </div>
      <div className="ins-prop-row">
        <TextField
          label="폭(px)"
          value={String(opts.width)}
          onCommit={(v) => apply({ width: clampMapSize(parseInt(v, 10) || opts.width) })}
        />
        <TextField
          label="높이(px)"
          value={String(opts.height)}
          onCommit={(v) => apply({ height: clampMapSize(parseInt(v, 10) || opts.height) })}
        />
      </div>
      <div className="ins-hmf-notice" style={{ marginTop: 8 }}>
        <i className="fa-solid fa-circle-info" aria-hidden />
        <span>
          Google 지도에서 ‘공유 → 지도 퍼가기(iframe)’ 코드를 붙여넣으면 상세 카드가
          표시됩니다. 주소만 입력하면 기본 지도가 표시됩니다.
        </span>
      </div>
    </Section>
  );
}

/* ─── Header settings panel (2026-06-13) ────────────────────────────────
 * Shown in the Design tab when nothing is selected, ABOVE the body/footer
 * panels (matches page order). Controls the site header (#hns_header):
 * background color + min-height + sticky — SITE-WIDE (all pages, persisted via
 * the HNS-HEADER-LAYOUT pageCss block by applyHeaderLayout). Mirrors the
 * footer panel so the header is no longer the only region without settings. */
function HeaderSettingsPanel({
  headerLayout,
  onApply,
}: {
  headerLayout?: HmfHeaderLayout;
  onApply?: (next: HmfHeaderLayout) => void;
}) {
  const layout = headerLayout ?? { sticky: false, height: "auto", background: "" };
  const heightPx =
    layout.height && layout.height !== "auto" ? parseInt(layout.height, 10) || 0 : 0;
  return (
    <Section title="헤더 설정">
      <SwatchEditor
        label="배경색"
        value={layout.background || "#ffffff"}
        onChange={(v) => onApply?.({ ...layout, background: v })}
      />
      <div className="ins-prop-row" style={{ marginTop: 8 }}>
        <TextField
          label="최소 높이(px)"
          value={heightPx > 0 ? String(heightPx) : ""}
          placeholder="자동"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            onApply?.({
              ...layout,
              height: Number.isFinite(n) && n > 0 ? `${n}px` : "auto",
            });
          }}
          wide
        />
      </div>
      <div className="ins-prop-row" style={{ marginTop: 8 }}>
        <label className="ins-device-toggle" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={layout.sticky}
            onChange={(e) => onApply?.({ ...layout, sticky: e.target.checked })}
          />
          <span>상단 고정 (sticky)</span>
        </label>
      </div>
      <div className="ins-hmf-notice" style={{ marginTop: 8 }}>
        <i className="fa-solid fa-circle-info" aria-hidden />
        <span>헤더 배경·높이는 모든 페이지에 공통 적용됩니다.</span>
      </div>
    </Section>
  );
}

/* ─── Body settings panel (2026-06-13) ──────────────────────────────────
 * Shown in the Design tab when nothing is selected. Controls the page body
 * region (#hns_body): background color + min-height for the ACTIVE device.
 * "높이 자동" resets to content height (removes the body↔footer gap). Reads the
 * live #hns_body so it reflects the current state; writes via onApply. */
function BodySettingsPanel({
  onApply,
}: {
  onApply?: (patch: { background?: string; minHeight?: number }) => void;
}) {
  const bodyEl = () =>
    typeof document !== "undefined" ? document.getElementById("hns_body") : null;
  const [bg, setBg] = useState<string>(() => {
    const el = bodyEl();
    if (!el) return "#ffffff";
    const inline = (el.style.background || el.style.backgroundColor || "").trim();
    if (inline) return inline;
    // No inline override → reflect the live background; default to WHITE (the
    // page background) rather than the swatch's #000000 fallback.
    const computed = window.getComputedStyle(el).backgroundColor;
    if (!computed || computed === "transparent" || /rgba?\(0,\s*0,\s*0,\s*0\)/.test(computed)) {
      return "#ffffff";
    }
    return rgbToHex(computed) || "#ffffff";
  });
  const [minH, setMinH] = useState<string>(() => {
    const el = bodyEl();
    return el ? String(parseInt(el.style.minHeight, 10) || el.offsetHeight || 0) : "";
  });

  return (
    <>
      <Section title="본문 설정">
        <SwatchEditor
          label="배경색"
          value={bg}
          onChange={(v) => {
            setBg(v);
            onApply?.({ background: v });
          }}
        />
        <div className="ins-prop-row" style={{ marginTop: 8 }}>
          <TextField
            label="최소 높이(px)"
            value={minH}
            onCommit={(v) => {
              const n = parseInt(v, 10);
              const val = Number.isFinite(n) && n > 0 ? n : 0;
              setMinH(String(val || 0));
              onApply?.({ minHeight: val });
            }}
            wide
          />
        </div>
        <div className="ins-prop-row">
          <button
            type="button"
            className="ins-btn"
            style={{
              flex: 1,
              padding: "8px 10px",
              background: "#1f2937",
              color: "#e5e7eb",
              border: "1px solid #374151",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
            onClick={() => {
              setMinH("0");
              onApply?.({ minHeight: 0 });
            }}
          >
            <i className="fa-solid fa-arrows-up-to-line" style={{ marginRight: 6 }} />
            높이 자동 맞춤 (공백 제거)
          </button>
        </div>
        <div className="ins-hmf-notice" style={{ marginTop: 8 }}>
          <i className="fa-solid fa-circle-info" aria-hidden />
          <span>
            현재 보고 있는 기기(PC·태블릿·모바일) 기준으로 적용됩니다. ‘높이 자동
            맞춤’은 콘텐츠 높이에 맞춰 본문↔푸터 사이 공백을 없앱니다.
          </span>
        </div>
      </Section>
    </>
  );
}

/* ─── Footer settings panel (2026-06-13) ────────────────────────────────
 * Shown alongside BodySettingsPanel when nothing is selected. Controls the
 * site footer (#hns_footer) background + min-height — SITE-WIDE (all pages,
 * persisted in the footer `<style data-hns-footer>` block via the HMF save)
 * and PER-DEVICE (edits the ACTIVE viewport's values; @media for publish). */
function FooterSettingsPanel({
  footerStyle,
  onApply,
}: {
  footerStyle?: FooterStyle;
  onApply?: (next: FooterStyle) => void;
}) {
  const viewportMode = useEditorStore(selectViewportMode);
  const device = viewportMode as FooterDevice;
  const style = footerStyle ?? emptyFooterStyle();
  const cur = style[device];
  const deviceLabel = device === "tablet" ? "태블릿" : device === "mobile" ? "모바일" : "PC";

  // Effective background shown in the swatch: this device's value, else the
  // desktop base, else white. Editing writes to THIS device only.
  const bgValue = cur.background || style.desktop.background || "#ffffff";

  const update = (patch: Partial<FooterDeviceStyle>) => {
    const next: FooterStyle = { ...style, [device]: { ...cur, ...patch } };
    onApply?.(next);
  };

  return (
    <Section title={`푸터 설정 · ${deviceLabel}`}>
      <SwatchEditor
        label="배경색"
        value={bgValue}
        onChange={(v) => update({ background: v })}
      />
      <div className="ins-prop-row" style={{ marginTop: 8 }}>
        <TextField
          label="최소 높이(px)"
          value={cur.minHeight > 0 ? String(cur.minHeight) : ""}
          placeholder="150 (기본)"
          onCommit={(v) => {
            const n = parseInt(v, 10);
            update({ minHeight: Number.isFinite(n) && n > 0 ? n : 0 });
          }}
          wide
        />
      </div>
      <div className="ins-hmf-notice" style={{ marginTop: 8 }}>
        <i className="fa-solid fa-circle-info" aria-hidden />
        <span>
          {deviceLabel} 기준 푸터 배경색·높이입니다. <b>모든 페이지에 공통</b>으로
          적용됩니다. 검은 영역에 텍스트가 묻히면 배경색을 밝게 바꾸세요. (기기별로
          상단 PC·태블릿·모바일 전환 후 각각 설정)
        </span>
      </div>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ins-section">
      <h5>{title}</h5>
      {children}
    </section>
  );
}

// Silence unused-var warning for LayerInteraction used only as a type.
export type __InspectorInteractionRef = LayerInteraction;
