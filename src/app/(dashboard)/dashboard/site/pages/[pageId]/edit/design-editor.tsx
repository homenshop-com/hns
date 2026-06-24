"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense, type CSSProperties } from "react";
import { useStore } from "zustand";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import BrandMark from "@/components/BrandMark";
import "./editor-styles.css";
// Sprint 9i (2026-04-22) — Figma-inspired dark theme overlay, recreating
// "Editor Canvas.html" from Claude Design. Must import AFTER editor-styles.css
// so its higher specificity rules win.
import "./editor-figma-theme.css";
import { useEditorStore, type ViewportMode } from "./store/editor-store";
import {
  applySelection as syncApplySelection,
  normalizeAnchorImageBoxes,
  syncStoreToDom,
  syncHeaderSceneToDom,
  syncFooterSceneToDom,
} from "./store/editor-sync";
import { snapRect, type Rect as SnapRect } from "./store/snap";
import {
  stripMobileCssBlock,
  buildDeviceMediaCss,
  stripDeviceMediaCss,
  applyDeviceOverridesFromScene,
  legacyHmfToScene,
  sceneToLegacyHtml,
  stripFooterPinnedTop,
  parsePageWidthCss,
  upsertPageWidthCss,
  type SceneGraph,
} from "@/lib/scene";
// Sprint 9k — section preset library for LeftPalette "섹션 블록" list.
import { SECTION_PRESETS } from "./components/section-library";
import { findFontIdByStack } from "./components/font-catalog";
// Phase 1 (mutable-baking-falcon) — paradigm-neutral theme-CSS utilities
// extracted to edit/shared/ so both dedicated editors share one source.
import {
  THEME_MARK_START,
  THEME_MARK_END,
  type ThemeTokens,
  cssManagedBlockRegex,
  buildThemeCssBlock,
  inferThemePresetId,
  parseThemeTokens,
} from "./shared/theme-css";
import {
  boostImportant,
  escapeHtml,
  stripPinnedGeometryCss,
  collectSceneGeometryOwners,
  updatePluginRealSizeCss,
  collectInlineGeometryOwners,
} from "./shared/css-utils";
// HMF (header/menu/footer) per-device positioning. HMF is raw-injected (not
// scene-managed), so per-device geometry is persisted as a <style
// data-hns-device> @media block embedded in the container's own HTML, and the
// editor paints the active device via inline styles on device switch.
import {
  type HmfDeviceMap,
  type HmfBaseMap,
  type HmfDevice,
  type HmfViewport,
  parseHmfDeviceStyle,
  recordHmfDeviceFrame,
  writeHmfDeviceStyle,
  snapshotHmfContainerBase,
  applyHmfDevicePreview,
} from "./shared/hmf-device";
import {
  type FooterStyle,
  type FooterDevice,
  parseFooterStyle,
  applyFooterStyleToDom,
  applyFooterLivePreview,
} from "./shared/footer-style";

const TiptapModal = lazy(() => import("./tiptap-modal"));
// LayerPanel is rendered by InspectorPanel's "레이어" tab; no direct
// reference here (lazy-imported inside InspectorPanel).
// Sprint 9j — Figma-style side rails and canvas rulers.
const LeftPalette = lazy(() => import("./components/LeftPalette"));
const InspectorPanel = lazy(() => import("./components/InspectorPanel"));
const CanvasRulers = lazy(() => import("./components/CanvasRulers"));
// Sprint 9k — drag-to-insert ghost + drop indicator
const DragInsertLayer = lazy(() => import("./components/DragInsertLayer"));
const CanvasOverlay = lazy(() => import("./components/CanvasOverlay"));
const HeaderImageOverlay = lazy(() => import("./components/HeaderImageOverlay"));
const MenuManagerModal = lazy(() => import("./components/MenuManagerModal"));
const HeaderEditModal = lazy(() => import("./components/HeaderEditModal"));
const FooterEditModal = lazy(() => import("./components/FooterEditModal"));

/** Module-scoped clipboard for V2 copy/paste. Lives for the page
 *  session, cleared on navigation. We also mirror to navigator.clipboard
 *  as JSON so the user can paste into another tab of the same editor. */
let v2Clipboard: unknown[] = [];

/** Editor-only transient classes that must never be saved into the site-wide
 *  HMF HTML nor count as a "change" when diffing for save. */
const HMF_TRANSIENT_CLASSES = [
  "de-selected",
  "de-editing",
  "de-text-editing",
  "de-hmf-droptarget",
];

const BODY_LAYOUT_MARK_START = "/* HNS-BODY-LAYOUT:START */";
const BODY_LAYOUT_MARK_END = "/* HNS-BODY-LAYOUT:END */";
const BODY_BOTTOM_PADDING = 80;
const BODY_MIN_HEIGHT_FLOOR = 240;
type BodyLayoutHeights = Partial<Record<ViewportMode, number>>;

function bodyLayoutBlockRegex() {
  return new RegExp(
    String.raw`/\*\s*HNS-BODY-LAYOUT:START\s*\*/[\s\S]*?/\*\s*HNS-BODY-LAYOUT:END\s*\*/`,
    "g",
  );
}

function stripBodyLayoutCss(css: string): string {
  return (css || "").replace(bodyLayoutBlockRegex(), "").trim();
}

function normalizeBodyHeightValue(value: number | null | undefined): number | undefined {
  if (!value || value <= 0 || !Number.isFinite(value)) return undefined;
  return Math.max(BODY_MIN_HEIGHT_FLOOR, Math.round(value));
}

function parseBodyLayoutCss(css: string): BodyLayoutHeights {
  const block = (css || "").match(bodyLayoutBlockRegex())?.[0] ?? "";
  const heights: BodyLayoutHeights = {};
  const desktopMatch = /#hns_body\s*\{[^}]*min-height\s*:\s*([\d.]+)px/i.exec(block);
  heights.desktop = normalizeBodyHeightValue(desktopMatch ? parseFloat(desktopMatch[1]!) : undefined);

  const tabletMatch = /@media\s*\(\s*max-width\s*:\s*1024px\s*\)\s*\{\s*#hns_body\s*\{[^}]*min-height\s*:\s*([\d.]+)px/i.exec(block);
  heights.tablet = normalizeBodyHeightValue(tabletMatch ? parseFloat(tabletMatch[1]!) : undefined);

  const mobileMatch = /@media\s*\(\s*max-width\s*:\s*767px\s*\)\s*\{\s*#hns_body\s*\{[^}]*min-height\s*:\s*([\d.]+)px/i.exec(block);
  heights.mobile = normalizeBodyHeightValue(mobileMatch ? parseFloat(mobileMatch[1]!) : undefined);
  return heights;
}

/* ── Body STYLE block (background) — separate from the per-device min-height
   HNS-BODY-LAYOUT block above. Managed by the "본문 설정" Inspector panel. */
const BODY_STYLE_MARK_START = "/* HNS-BODY-STYLE:START */";
const BODY_STYLE_MARK_END = "/* HNS-BODY-STYLE:END */";
function bodyStyleBlockRegex() {
  return new RegExp(
    String.raw`/\*\s*HNS-BODY-STYLE:START\s*\*/[\s\S]*?/\*\s*HNS-BODY-STYLE:END\s*\*/`,
    "g",
  );
}
function upsertBodyStyleCss(css: string, background: string): string {
  const base = (css || "").replace(bodyStyleBlockRegex(), "").trim();
  const bg = (background || "").trim();
  if (!bg || bg === "transparent") return base;
  const block = `${BODY_STYLE_MARK_START}\n#hns_body { background: ${bg} !important; }\n${BODY_STYLE_MARK_END}`;
  return base + (base ? "\n\n" : "") + block + "\n";
}


function upsertBodyLayoutCss(css: string, heights: BodyLayoutHeights): string {
  const base = stripBodyLayoutCss(css);
  const desktop = normalizeBodyHeightValue(heights.desktop);
  const tablet = normalizeBodyHeightValue(heights.tablet);
  const mobile = normalizeBodyHeightValue(heights.mobile);
  if (!desktop && !tablet && !mobile) return base;
  const lines = [BODY_LAYOUT_MARK_START];
  if (desktop) lines.push(`#hns_body{min-height:${desktop}px;}`);
  if (tablet) lines.push(`@media (max-width:1024px){#hns_body{min-height:${tablet}px;}}`);
  if (mobile) lines.push(`@media (max-width:767px){#hns_body{min-height:${mobile}px;}}`);
  lines.push(BODY_LAYOUT_MARK_END);
  const block = lines.join("\n");
  return base ? `${base}\n\n${block}` : block;
}

type SerializableSceneLayer = {
  id?: string;
  type?: string;
  html?: string;
  innerHtml?: string;
  legacyInnerHtml?: string;
  legacyClassName?: string;
  frameKeys?: string[];
  frameImportant?: string[];
  tabletFrame?: unknown;
  mobileFrame?: unknown;
  children?: SerializableSceneLayer[];
};

function cloneSceneForDesktopSave(scene: SceneGraph, bodyEl: HTMLElement | null): SceneGraph {
  const cloned = JSON.parse(JSON.stringify(scene)) as SceneGraph;
  const syncLiveInnerHtml = (layer: SerializableSceneLayer) => {
    if (layer.id && bodyEl) {
      const el = bodyEl.querySelector<HTMLElement>(`#${CSS.escape(layer.id)}`);
      if (el) {
        if (layer.type === "text") layer.html = el.innerHTML;
        else if (layer.type === "image" || layer.type === "box") layer.innerHtml = el.innerHTML;
        else if (/\b[A-Za-z]+Plugin\b/.test(layer.legacyClassName ?? "")) layer.legacyInnerHtml = el.innerHTML;
      }
    }
    layer.children?.forEach(syncLiveInnerHtml);
  };
  syncLiveInnerHtml(cloned.root as unknown as SerializableSceneLayer);
  return cloned;
}

/**
 * Normalized signature of an HMF container's content — its innerHTML with
 * editor-only selection/edit classes and `contenteditable` stripped. Used to
 * (a) detect whether the header/footer was actually edited this session (so a
 * page that didn't touch it can't clobber the site-wide copy), and (b) produce
 * a clean value to persist (no `de-selected` leaking into the published page).
 */
function hmfSignature(el: HTMLElement | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll<HTMLElement>(HMF_TRANSIENT_CLASSES.map((c) => `.${c}`).join(","))
    .forEach((n) => {
      HMF_TRANSIENT_CLASSES.forEach((c) => n.classList.remove(c));
      if (!n.getAttribute("class")) n.removeAttribute("class");
    });
  clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  return clone.innerHTML;
}

/* ─── Types ─── */
export interface LayerData {
  id: string;
  type: "text" | "image" | "box" | "board" | "product" | "exhibition" | "menu" | "login" | "mail";
  content: string;
  style: Record<string, string>;
  className: string;
}

interface PageInfo {
  id: string;
  title: string;
  slug: string;
  isHome: boolean;
  parentId?: string | null;
  showInMenu?: boolean;
  menuTitle?: string | null;
  externalUrl?: string | null;
}

interface DesignEditorProps {
  siteId: string;
  shopId: string;
  siteName: string;
  defaultLanguage: string;
  tempDomain: string;
  templatePath: string;
  headerHtml: string;
  menuHtml: string;
  footerHtml: string;
  cssText: string;
  pageCss: string;
  templateCss: string;
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  pages: PageInfo[];
  bodyHtml: string;
  /** Saved scene graph (`content.layers`) from the last V2 save, if any.
   *  Used to losslessly re-hydrate per-device overrides (tablet/mobile
   *  frames, hidden, cascade) on editor load — the freshly HTML-parsed
   *  scene only carries the desktop base. */
  bodyLayers?: SceneGraph | null;
  published: boolean;
  currentLang: string;
  siteLanguages: string[];
  langPageMap?: Record<string, string>;
  /** Editor V2 (scene-graph + LayerPanel) enabled for this user. Default off. */
  editorV2Enabled?: boolean;
  /** true = source template is mobile-responsive (Agency, Plus Academy,
   *  HomeBuilder etc.). When true, we hide the PC/Mobile viewport toggle
   *  in the toolbar — the layout flows automatically and there's no
   *  separate "mobile" coordinate system to edit. */
  isResponsiveTemplate?: boolean;
  /** Resolved editing paradigm from the server (`Site.editorMode` column if
   *  set, else the `isResponsiveTemplate` heuristic). This is the source of
   *  truth for which editor behaviors apply — the device viewport toggle and
   *  the mode badge key on this, NOT the raw heuristic, so an admin override
   *  via `Site.editorMode` is honored. */
  editorMode?: "absolute" | "flow";
  /** Topbar brand for the .de-logo mark. White-label reseller hosts get the
   *  reseller's siteName/logo; the canonical host falls back to "homeNshop".
   *  Computed in the server parent via getResellerForHost(). */
  brand?: { brandName: string; logoUrl: string | null; whiteLabel: boolean };
}

/* ─── Component ─── */
export default function DesignEditor({
  siteId,
  shopId,
  siteName,
  defaultLanguage,
  tempDomain,
  templatePath,
  headerHtml,
  menuHtml,
  footerHtml,
  cssText,
  pageCss,
  templateCss,
  pageId,
  pageTitle,
  pageSlug,
  pages: initialPages,
  bodyHtml,
  bodyLayers = null,
  published: initialPublished,
  currentLang,
  siteLanguages,
  langPageMap = {},
  editorV2Enabled = false,
  isResponsiveTemplate = false,
  editorMode,
  brand = { brandName: "homeNshop", logoUrl: null, whiteLabel: false },
}: DesignEditorProps) {
  const router = useRouter();
  const t = useTranslations("editor");

  // Resolved paradigm. Prefer the explicit prop (which already folds in the
  // Site.editorMode admin override); fall back to the heuristic for any caller
  // that doesn't pass it. "absolute" = legacy fixed-coordinate (3-mode device
  // editing); "flow" = responsive block-flow (auto-reflow, no device toggle).
  const resolvedEditorMode: "absolute" | "flow" =
    editorMode ?? (isResponsiveTemplate ? "flow" : "absolute");
  const isAbsoluteMode = resolvedEditorMode === "absolute";

  // V2: keep the scene graph store in sync with the body HTML that the
  // DOM-first editor is rendering. Importing a fresh scene on every
  // bodyHtml change is cheap and guarantees the LayerPanel reflects AI
  // edits, undo, page switches, etc. Skip entirely when the flag is off.
  useEffect(() => {
    if (!editorV2Enabled) return;
    // Pass the saved scene JSON so per-device overrides re-hydrate
    // losslessly on load (desktop base comes from the HTML parse).
    useEditorStore.getState().importHtml(bodyHtml || "", pageCss, bodyLayers);
  }, [editorV2Enabled, bodyHtml, pageId, pageCss, bodyLayers]);

  // State
  const [currentBodyHtml, setCurrentBodyHtml] = useState(bodyHtml);
  const [currentPageCss, setCurrentPageCss] = useState(pageCss);

  // 테마 tab selection (LeftPalette). Persisted into cssText via a
  // managed `:root{}` block (comment-delimited so we can update it in-
  // place without stepping on other site CSS).
  const [currentThemeId, setCurrentThemeId] = useState<string | null>(null);
  const [currentFontId, setCurrentFontId] = useState<string | null>(null);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);

  useEffect(() => {
    const css = pageCss || "";
    const parsed = parseThemeTokens(css);
    if (parsed.brand && parsed.accent) {
      setCurrentThemeId(inferThemePresetId(parsed.brand, parsed.accent));
    } else {
      setCurrentThemeId(null);
    }
    setCurrentFontId(parsed.fontStack ? findFontIdByStack(parsed.fontStack) : null);

    /* Legacy theme-block migration (2026-04-26 fix) ────────────────
     * Older blocks used `:where(...)` selectors and the broken
     * `[style*="border-radius"]` attribute matcher that repainted every
     * shape on the page with the accent color (red circle → gray
     * disc). Detect those tells and rewrite the block in-place using
     * the current builder. The user just needs to save once for the
     * cleaned CSS to land on disk and reach the published page. */
    const blockMatch = css.match(cssManagedBlockRegex(THEME_MARK_START, THEME_MARK_END));
    if (blockMatch && parsed.brand && parsed.accent) {
      const block = blockMatch[0];
      const isLegacy =
        block.includes('[style*="border-radius"]') ||
        block.includes(':where(#hns_body') ||
        block.includes('a[style*="background"]');
      if (isLegacy) {
        const rebuilt = buildThemeCssBlock({
          brand: parsed.brand,
          accent: parsed.accent,
          surface: parsed.surface,
          text: parsed.text,
          fontStack: parsed.fontStack,
        });
        setCurrentPageCss(css.replace(cssManagedBlockRegex(THEME_MARK_START, THEME_MARK_END), rebuilt));
      }
    }
  }, [pageCss, pageId]);
  // Legacy top-toolbar tabs (page/object/settings/position/AI) were merged
  // into the single-row App bar + left rail + right inspector in the
  // 2026-04-22 UI consolidation. The state variable is retained only for
  // the sub-toolbar guard logic (always "page" now) so existing code
  // paths don't need to be audited for every touch.
  const activeTab: "page" = "page";

  // Site settings modal — opens from ⋯ overflow menu (holds what used to
  // be in the old "설정" tab: header/logo, menu mode, footer reset).
  const [showSiteSettings, setShowSiteSettings] = useState(false);
  // Menu manager modal — drag-reorder + showInMenu toggle + label edit
  // for the entire pages tree. Opens from settings or canvas affordance.
  const [showMenuManager, setShowMenuManager] = useState(false);
  // Header edit modal — one-stop editor for logo / texts / menu / lang /
  // layout. Opens from the SectionsTab "헤더" pinned row.
  const [showHeaderEdit, setShowHeaderEdit] = useState(false);
  // Footer edit modal — same pattern as header but trimmed to the
  // surfaces footers actually have (images / texts / links / style).
  const [showFooterEdit, setShowFooterEdit] = useState(false);
  // Hidden file input for logo replace via the settings modal "로고 변경"
  // button. The canvas-side ↻ floating button has its own picker; this
  // one keeps the modal flow consistent.
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  // Local mirror of the `pages` prop so the menu manager modal can
  // mutate the in-memory list. buildMenuHtml() reads from this state
  // (was `pages` prop directly), so menu changes show on the canvas
  // immediately without a parent re-fetch.
  const [pages, setPages] = useState<PageInfo[]>(initialPages);
  useEffect(() => {
    setPages(initialPages);
  }, [initialPages]);
  // Header layout tokens (sticky/height/background). Persisted as a
  // managed `:root{}` block in pageCss — see applyHeaderLayout helper.
  type HeaderLayout = {
    sticky: boolean;
    height: string; // e.g. "auto" | "64px"
    background: string; // hex / var() / "transparent"
  };
  const [headerLayout, setHeaderLayout] = useState<HeaderLayout>({
    sticky: false,
    height: "auto",
    background: "transparent",
  });
  // Site-wide, per-device footer style (background / min-height). Parsed from
  // the managed `<style data-hns-footer>` block inside footerHtml (SiteHmf).
  const [footerStyle, setFooterStyle] = useState<FooterStyle>(() =>
    parseFooterStyle(footerHtml),
  );
  // Hydrate from existing pageCss on mount (idempotent).
  useEffect(() => {
    const css = pageCss ?? "";
    const re = /\/\* HNS-HEADER-LAYOUT:START \*\/[\s\S]*?\/\* HNS-HEADER-LAYOUT:END \*\//;
    const m = css.match(re);
    if (!m) return;
    const block = m[0];
    const sticky = /sticky\s*:\s*1/.test(block);
    const heightMatch = block.match(/--hns-header-height:\s*([^;]+);/);
    const bgMatch = block.match(/--hns-header-bg:\s*([^;]+);/);
    setHeaderLayout({
      sticky,
      height: heightMatch?.[1]?.trim() ?? "auto",
      background: bgMatch?.[1]?.trim() ?? "transparent",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Page tab context menu (right-click on a page tab in the App bar).
  const [pageCtxMenu, setPageCtxMenu] = useState<{ pageId: string; x: number; y: number } | null>(null);
  // Undo/Redo button enable state — subscribe to zundo's temporal store
  // so the icon buttons in the toolbar disable when there's nothing to
  // undo or redo. Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z) are wired
  // separately in the global keydown handler below.
  const canUndo = useStore(
    useEditorStore.temporal,
    (s) => s.pastStates.length > 0,
  );
  const canRedo = useStore(
    useEditorStore.temporal,
    (s) => s.futureStates.length > 0,
  );

  // Undo/redo. The body scene→DOM subscription re-applies BODY geometry
  // automatically, but the HMF (header/footer) sync skips geometry (it's owned
  // by the live drag), so undoing a header/footer MOVE/RESIZE reverted the scene
  // without moving the DOM node back — "실행취소가 안 됨". After undo/redo there's
  // no live drag, so push the reverted header/footer geometry onto their
  // raw-injected DOM.
  const reapplyHmfGeometry = useCallback(() => {
    const s = useEditorStore.getState();
    if (headerRef.current && s.headerScene) {
      syncHeaderSceneToDom(s.headerScene, headerRef.current, {
        applyGeometry: true,
        geometryDevice: s.viewportMode,
      });
    }
    if (footerRef.current && s.footerScene) {
      syncFooterSceneToDom(s.footerScene, footerRef.current, {
        applyGeometry: true,
        geometryDevice: s.viewportMode,
      });
    }
  }, []);
  const runUndo = useCallback(() => {
    useEditorStore.temporal.getState().undo();
    reapplyHmfGeometry();
  }, [reapplyHmfGeometry]);
  const runRedo = useCallback(() => {
    useEditorStore.temporal.getState().redo();
    reapplyHmfGeometry();
  }, [reapplyHmfGeometry]);

  // Subscribe to viewport mode (for toolbar button highlighting + canvas width).
  const [viewportMode, setLocalViewportMode] = useState<ViewportMode>("desktop");
  useEffect(() => {
    if (!editorV2Enabled) return;
    setLocalViewportMode(useEditorStore.getState().viewportMode);
    const unsub = useEditorStore.subscribe((s) => {
      setLocalViewportMode((prev) => (prev === s.viewportMode ? prev : s.viewportMode));
    });
    return unsub;
  }, [editorV2Enabled]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  // Sprint 9i — Figma-style zoom + cursor coord for the status bar / floating
  // zoom pill. Zoom only drives a CSS transform on the canvas; drag math is
  // unaffected (handlers use getBoundingClientRect which reflects the scale).
  const [zoom, setZoom] = useState(100);
  // Horizontal shift (viewport px) applied with the zoom transform so the
  // device-mode fit centers the actual CONTENT (which may spill past the
  // artboard) rather than the artboard box. 0 in desktop / normal zoom.
  const [fitOffsetX, setFitOffsetX] = useState(0);
  const [cursorCoord, setCursorCoord] = useState<[number, number] | null>(null);
  // Live layer count for the status bar — updated from the store.
  const [layerCount, setLayerCount] = useState(0);
  useEffect(() => {
    if (!editorV2Enabled) return;
    const countLayers = (node: unknown): number => {
      const n = node as { children?: unknown[] };
      let c = 0;
      if (Array.isArray(n?.children)) for (const ch of n.children) c += 1 + countLayers(ch);
      return c;
    };
    setLayerCount(countLayers(useEditorStore.getState().scene.root));
    return useEditorStore.subscribe((s) => {
      setLayerCount(countLayers(s.scene.root));
    });
  }, [editorV2Enabled]);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [tiptapTarget, setTiptapTarget] = useState<{ elId: string; html: string } | null>(null);
  const tiptapElRef = useRef<HTMLElement | null>(null);

  // "⋯" dropdown menu next to the publish button, + save-as-template modal
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showSaveTplModal, setShowSaveTplModal] = useState(false);
  const [saveTplName, setSaveTplName] = useState("");
  const [saveTplDesc, setSaveTplDesc] = useState("");
  const [saveTplThumb, setSaveTplThumb] = useState("");
  const [saveTplBusy, setSaveTplBusy] = useState(false);
  const [saveTplError, setSaveTplError] = useState("");
  const [atomizeBusy, setAtomizeBusy] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close the "⋯" menu on any outside click.
  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (!moreMenuRef.current) return;
      if (!moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreMenuOpen]);

  async function submitSaveAsTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!saveTplName.trim()) {
      setSaveTplError(t("saveTemplateModal.nameRequired"));
      return;
    }
    setSaveTplBusy(true);
    setSaveTplError("");
    try {
      const res = await fetch("/api/templates/save-from-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          name: saveTplName.trim(),
          description: saveTplDesc.trim() || undefined,
          thumbnailUrl: saveTplThumb.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveTplError(err.error || `${t("saveTemplateModal.saveFailed")} (${res.status})`);
        setSaveTplBusy(false);
        return;
      }
      setSaveTplBusy(false);
      setShowSaveTplModal(false);
      setSaveTplName("");
      setSaveTplDesc("");
      setSaveTplThumb("");
      alert(t("saveTemplateModal.savedSuccess"));
    } catch (err) {
      setSaveTplError(String(err));
      setSaveTplBusy(false);
    }
  }

  // Wrap bare h1/h2/p/img/a.btn/ul/table in .dragable so the editor can
  // select & edit them. The page may have unsaved DOM edits, so we save
  // first (atomize reads from the DB), then refresh to pull the rewrapped
  // HTML back into the canvas.
  async function runAtomize() {
    setMoreMenuOpen(false);
    const bodyEl = bodyRef.current;
    const liveHtml = bodyEl ? bodyEl.innerHTML : currentBodyHtml;
    const hasUnsaved = liveHtml !== currentBodyHtml || saveStatus === "error";
    if (hasUnsaved) {
      if (!confirm(t("topbar.atomizeUnsavedConfirm"))) return;
      await saveContent();
    }
    setAtomizeBusy(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/pages/${pageId}/atomize`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || t("topbar.atomizeError"));
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { changed?: boolean };
      if (data.changed === false) {
        alert(t("topbar.atomizeNoChange"));
        return;
      }
      alert(t("topbar.atomizeDone"));
      router.refresh();
    } catch (err) {
      console.error("[atomize]", err);
      alert(t("topbar.atomizeError"));
    } finally {
      setAtomizeBusy(false);
    }
  }

  // Header/Menu/Footer settings
  const [menuMode, setMenuMode] = useState<"auto" | "custom">("auto");
  const [logoUrl, setLogoUrl] = useState("");

  // Multi-select state (Shift+click)
  const multiSelectedRef = useRef<Set<string>>(new Set());
  const [multiSelectCount, setMultiSelectCount] = useState(0); // triggers re-render for highlight

  // AI edit state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<"" | "success" | "error">("");
  const [aiError, setAiError] = useState("");
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditCost, setCreditCost] = useState<number>(5);
  const [insufficientCredits, setInsufficientCredits] = useState<{ required: number; balance: number } | null>(null);
  const aiPrevHtmlRef = useRef<string | null>(null);

  // Drag state
  /** Persistent fixed-position blue line gizmo for section reorder
   *  drops. Created once on first reorder; reused. Hidden between
   *  drags by setting display:none. */
  const sectionReorderIndicatorRef = useRef<HTMLDivElement | null>(null);

  const dragRef = useRef<{
    el: HTMLElement;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    // For multi-drag: store initial positions of all selected elements
    others: Array<{ el: HTMLElement; origLeft: number; origTop: number }>;
  } | null>(null);

  // Resize state
  const resizeRef = useRef<{
    el: HTMLElement;
    handle: string;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
    origWidth: number;
    origHeight: number;
    importantPin?: boolean;
  } | null>(null);
  const bodyResizeRef = useRef<{
    startY: number;
    startHeight: number;
  } | null>(null);
  const bodyManualMinHeightRef = useRef<BodyLayoutHeights>(parseBodyLayoutCss(pageCss));
  const bodyHeightRafRef = useRef<number | null>(null);
  const [bodyHandleTop, setBodyHandleTop] = useState(0);

  // Last pointer position during an active drag/resize gesture. Used at
  // mouse/touch-up to decide whether a body element was dropped over the
  // header zone (goal 2: cross-container drag body → header section).
  const lastPointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  // Outer scroll container — referenced by CanvasRulers to track scrollLeft /
  // scrollTop so the ruler origin stays glued to the artboard.
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);

  /* ─── Set initial content via refs (not dangerouslySetInnerHTML) so DOM edits persist ─── */
  const headerInitedRef = useRef(false);
  const menuInitedRef = useRef(false);
  const footerInitedRef = useRef(false);

  /* ─── HMF baseline signatures (header/footer are SITE-WIDE) ───
   * The header/footer are shared across every page. Saving a page used to
   * ALWAYS write the site-wide header/footer back, so opening page B (which
   * loaded the header BEFORE page A's edit) and saving it would clobber page
   * A's header edits with B's stale copy. We capture the header/footer DOM
   * signature at load and only re-save them when THIS page actually changed
   * them — so a page that never touched the header can't overwrite it. */
  const initialHeaderSigRef = useRef<string>("");
  const initialFooterSigRef = useRef<string>("");
  // Cross-tab sync channel for the site-wide header/footer (option A): a tab
  // that saves the HMF broadcasts it so other open editor tabs of the same
  // site+lang refresh their header/footer instead of holding a stale copy.
  const hmfChannelRef = useRef<BroadcastChannel | null>(null);

  /* ─── HMF per-device geometry (Wix-style 3-mode independence) ───
   * HMF blocks are raw-injected, not part of the scene graph, so their
   * per-device overrides can't live on scene layers. Instead we keep them in
   * these refs (id → device → box) plus an authored desktop-base snapshot for
   * "restore to PC". They are persisted into each container's HTML as a
   * <style data-hns-device> @media block on save (writeHmfDeviceStyle), and
   * painted in the editor via inline styles on device switch. */
  const hmfDeviceFramesRef = useRef<HmfDeviceMap>({});
  const hmfBaseFramesRef = useRef<HmfBaseMap>({});

  /* Hydrate saved per-device overrides from a freshly-injected HMF container
   * and snapshot each overridden element's AUTHORED inline geometry as its PC
   * base. Capturing the base now (from the authored HTML, before any device
   * preview runs) is essential: the editor's wide viewport ignores the
   * embedded @media block, so el.style.* still holds the PC values here — and
   * "restore to PC" needs that target before we ever paint a device. */
  const hydrateHmfDevice = useCallback((container: HTMLElement | null) => {
    if (!container) return;
    const parsed = parseHmfDeviceStyle(container);
    Object.assign(hmfDeviceFramesRef.current, parsed);
    // Capture the desktop base for EVERY draggable now — while the container
    // still shows its authored PC inline geometry and before any device
    // preview runs. Elements with a prior @media override are included by
    // virtue of being .dragable; fresh elements (no override yet) get their
    // PC base captured here so the first tablet/mobile edit can't corrupt it.
    snapshotHmfContainerBase(container, hmfBaseFramesRef.current);
  }, []);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = bodyHtml;
    }
  }, [bodyHtml]);

  useEffect(() => {
    bodyManualMinHeightRef.current = parseBodyLayoutCss(pageCss);
  }, [pageCss, pageId]);

  /* ─── V2 store → DOM sync ───
   * Subscribes once to the store. Every mutation runs a cheap DOM
   * reconcile pass: prune deleted layers, reorder, apply visibility/
   * lock, then apply selection highlighting. No component re-render —
   * we use the subscribe API directly on the ref'd container. */
  useEffect(() => {
    if (!editorV2Enabled) return;
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    // Run once on mount with the current state.
    // `isInitialLoad: true` seeds the section-background WeakMap without
    // triggering overlay suppression — editor opens identical to the
    // published page (WYSIWYG). Subsequent scene changes use the default
    // (isInitialLoad: false) and can suppress/restore overlays on demand.
    {
      const s = useEditorStore.getState();
      syncStoreToDom(s.scene, bodyEl, s.viewportMode, { isInitialLoad: true });
      syncApplySelection(s.selectedId, s.multiSelectedIds, bodyEl);
    }
    // Zustand v5 default subscribe fires on every state change. Cache
    // the last-seen references so we only touch the DOM when something
    // we care about actually changed.
    let lastScene = useEditorStore.getState().scene;
    let lastPrimary = useEditorStore.getState().selectedId;
    let lastMulti = useEditorStore.getState().multiSelectedIds;
    let lastViewport = useEditorStore.getState().viewportMode;
    let lastHeaderScene = useEditorStore.getState().headerScene;
    let headerSeeded = false;
    let lastFooterScene = useEditorStore.getState().footerScene;
    let footerSeeded = false;
    const unsub = useEditorStore.subscribe((s) => {
      const el = bodyRef.current;
      if (!el) return;
      if (s.scene !== lastScene || s.viewportMode !== lastViewport) {
        lastScene = s.scene;
        lastViewport = s.viewportMode;
        syncStoreToDom(s.scene, el, s.viewportMode);
        // Re-apply selection after order/visibility changes.
        syncApplySelection(s.selectedId, s.multiSelectedIds, el);
      }
      // Header scene → raw-injected header DOM (property edits only; geometry
      // stays owned by the live drag + @media path). Site-wide persistence.
      if (s.headerScene !== lastHeaderScene && headerRef.current) {
        const prevHeaderScene = lastHeaderScene;
        lastHeaderScene = s.headerScene;
        if (s.headerScene) {
          // Surgical DOM prune: when a header object is removed from the scene
          // (LayerPanel / 섹션 tab delete), the raw-injected header DOM node
          // must also go so the site-wide save (innerHTML) drops it. We remove
          // ONLY ids that existed in the previous header scene but are absent
          // from the new one — never a blanket prune — because header objects
          // can contain nested .dragable children not tracked as scene layers.
          if (prevHeaderScene && headerSeeded) {
            const newIds = new Set<string>();
            const gather = (l: { id: string; children?: unknown[] }) => {
              newIds.add(l.id);
              (l.children as typeof l[] | undefined)?.forEach(gather);
            };
            gather(s.headerScene.root as unknown as { id: string; children?: unknown[] });
            const prune = (l: { id: string; children?: unknown[] }) => {
              (l.children as typeof l[] | undefined)?.forEach(prune);
              if (!newIds.has(l.id)) {
                const node = headerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(l.id)}`);
                if (node) node.remove();
              }
            };
            prune(prevHeaderScene.root as unknown as { id: string; children?: unknown[] });
          }
          syncHeaderSceneToDom(s.headerScene, headerRef.current, { isInitialLoad: !headerSeeded });
          headerSeeded = true;
        }
      }
      // Footer scene → raw-injected footer DOM (mirror of the header branch).
      if (s.footerScene !== lastFooterScene && footerRef.current) {
        const prevFooterScene = lastFooterScene;
        lastFooterScene = s.footerScene;
        if (s.footerScene) {
          // Surgical DOM prune — same contract as the header: only remove ids
          // present in the previous footer scene but absent from the new one.
          if (prevFooterScene && footerSeeded) {
            const newIds = new Set<string>();
            const gather = (l: { id: string; children?: unknown[] }) => {
              newIds.add(l.id);
              (l.children as typeof l[] | undefined)?.forEach(gather);
            };
            gather(s.footerScene.root as unknown as { id: string; children?: unknown[] });
            const prune = (l: { id: string; children?: unknown[] }) => {
              (l.children as typeof l[] | undefined)?.forEach(prune);
              if (!newIds.has(l.id)) {
                const node = footerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(l.id)}`);
                if (node) node.remove();
              }
            };
            prune(prevFooterScene.root as unknown as { id: string; children?: unknown[] });
          }
          syncFooterSceneToDom(s.footerScene, footerRef.current, { isInitialLoad: !footerSeeded });
          footerSeeded = true;
        }
      }
      if (s.selectedId !== lastPrimary || s.multiSelectedIds !== lastMulti) {
        lastPrimary = s.selectedId;
        lastMulti = s.multiSelectedIds;
        syncApplySelection(s.selectedId, s.multiSelectedIds, el);
        // Header objects live outside bodyRef — mirror selection there too so
        // the .de-selected outline tracks LayerPanel clicks on header layers.
        if (headerRef.current) {
          syncApplySelection(s.selectedId, s.multiSelectedIds, headerRef.current);
        }
        // Footer objects also live outside bodyRef — mirror selection there too.
        if (footerRef.current) {
          syncApplySelection(s.selectedId, s.multiSelectedIds, footerRef.current);
        }
        // Mirror LayerPanel selection → legacy canvas state so the
        // drag/resize handles and keyboard shortcuts pick up the target.
        // (The old auto-switch to 위치 tab is gone — the right Inspector
        // panel's 디자인 tab now always shows selection details.)
        if (s.selectedId) {
          setSelectedElId(s.selectedId);
        } else {
          setSelectedElId(null);
        }
      }
    });
    return () => unsub();
  }, [editorV2Enabled]);

  /* ─── V2 keyboard shortcuts ───
   * Bound to window, gated by the flag, and skipped while the user is
   * typing in a form field / contenteditable so they don't fight TipTap. */
  useEffect(() => {
    if (!editorV2Enabled) return;
    function inEditable(t: EventTarget | null): boolean {
      const el = t as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }
    function onKey(e: KeyboardEvent) {
      if (inEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const s = useEditorStore.getState();
      // Undo / Redo
      if (mod && !e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        runUndo();
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "z") ||
        (mod && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        runRedo();
        return;
      }
      // Group / Ungroup
      if (mod && !e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const ids: string[] = [];
        if (s.selectedId) ids.push(s.selectedId);
        s.multiSelectedIds.forEach((id) => {
          if (!ids.includes(id)) ids.push(id);
        });
        if (ids.length >= 2) s.group(ids);
        return;
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (s.selectedId) s.ungroup(s.selectedId);
        return;
      }
      // Delete
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!s.selectedId && s.multiSelectedIds.size === 0) return;
        e.preventDefault();
        const toRemove = new Set<string>(s.multiSelectedIds);
        if (s.selectedId) toRemove.add(s.selectedId);
        toRemove.forEach((id) => s.remove(id));
        return;
      }
      // Duplicate (Ctrl/Cmd + D)
      if (mod && !e.shiftKey && e.key.toLowerCase() === "d") {
        if (!s.selectedId) return;
        e.preventDefault();
        s.duplicateLayer(s.selectedId);
        return;
      }
      // Copy (Ctrl/Cmd + C)
      if (mod && !e.shiftKey && e.key.toLowerCase() === "c") {
        const ids: string[] = [];
        if (s.selectedId) ids.push(s.selectedId);
        s.multiSelectedIds.forEach((id) => { if (!ids.includes(id)) ids.push(id); });
        if (ids.length === 0) return;
        e.preventDefault();
        const collected: unknown[] = [];
        const find = (root: any, id: string): any => {
          if (root.id === id) return root;
          if (root.type === "group") for (const c of root.children) {
            const f = find(c, id); if (f) return f;
          }
          return null;
        };
        for (const id of ids) {
          const l = find(s.scene.root, id);
          if (l) collected.push(JSON.parse(JSON.stringify(l)));
        }
        v2Clipboard = collected;
        // Best-effort cross-tab via system clipboard.
        try {
          navigator.clipboard?.writeText(JSON.stringify({ __hns_v2: true, layers: collected }));
        } catch {}
        return;
      }
      // Paste (Ctrl/Cmd + V)
      if (mod && !e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const applyPaste = (layers: unknown[]) => {
          if (!layers || layers.length === 0) return;
          useEditorStore.getState().pasteLayers(layers as any);
        };
        // Try system clipboard first (cross-tab); fall back to module var.
        (async () => {
          try {
            const text = await navigator.clipboard?.readText();
            if (text) {
              const parsed = JSON.parse(text);
              if (parsed && parsed.__hns_v2 && Array.isArray(parsed.layers)) {
                applyPaste(parsed.layers);
                return;
              }
            }
          } catch {}
          applyPaste(v2Clipboard);
        })();
        return;
      }
      // Arrow-key nudge on primary selection (+Shift = 10px).
      const isArrow =
        e.key === "ArrowLeft" || e.key === "ArrowRight" ||
        e.key === "ArrowUp"   || e.key === "ArrowDown";
      if (isArrow && s.selectedId) {
        // Find the layer's current frame so we know where "here" is.
        const find = (root: any): any => {
          if (root.id === s.selectedId) return root;
          if (root.type === "group") for (const c of root.children) {
            const f = find(c); if (f) return f;
          }
          return null;
        };
        const layer = find(s.scene.root);
        if (!layer) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const patch: { x?: number; y?: number } = {};
        if (e.key === "ArrowLeft")  patch.x = layer.frame.x - step;
        if (e.key === "ArrowRight") patch.x = layer.frame.x + step;
        if (e.key === "ArrowUp")    patch.y = layer.frame.y - step;
        if (e.key === "ArrowDown")  patch.y = layer.frame.y + step;
        s.setFrame(s.selectedId, patch);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorV2Enabled]);

  useEffect(() => {
    if (headerRef.current && !headerInitedRef.current) {
      headerRef.current.innerHTML = headerHtml;
      headerInitedRef.current = true;
      // Header is raw-injected (not scene-managed), so apply the same
      // image-anchor box normalization the scene parser does for the body —
      // fixes logos pinned in a tiny box (e.g. 406px logo in a 200px box).
      normalizeAnchorImageBoxes(headerRef.current);
      // Hydrate any saved per-device overrides embedded in the header HTML.
      hydrateHmfDevice(headerRef.current);
      // Detect logo URL
      const logoImg = headerRef.current.querySelector("#hns_h_logo img, .logo img, [id*=logo] img, a img") as HTMLImageElement | null;
      if (logoImg?.src) setLogoUrl(logoImg.src);

      // V2 — build the header SceneGraph so the header objects (logo, lang,
      // nav…) show up in the LayerPanel and are editable in the Inspector
      // "본문섹션처럼" (just like body sections). Stamp a stable id on every
      // header `.dragable` FIRST so the parsed scene ids match the live DOM,
      // enabling id-based property sync. Header edits persist site-wide.
      if (editorV2Enabled) {
        let n = 0;
        headerRef.current.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
          if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
        });
        useEditorStore.getState().setHeaderScene(legacyHmfToScene(headerRef.current.innerHTML));
      }
      // Baseline for the site-wide clobber guard (see save). Captured AFTER
      // all load-time normalization/id-stamping so an untouched save matches.
      initialHeaderSigRef.current = hmfSignature(headerRef.current);
    }
  }, [headerHtml, editorV2Enabled]);

  useEffect(() => {
    if (menuRef.current && !menuInitedRef.current) {
      // Decide what goes into #hns_menu:
      //
      // 1. If menuHtml already carries a real <ul><li> list → use it verbatim
      //    (user has a custom menu or a legacy template pre-seeded one).
      //
      // 2. If the site is a modern template (HNS-MODERN-TEMPLATE marker) OR
      //    headerHtml already contains a <nav>, the template provides its own
      //    navigation inside the header — injecting buildMenuHtml() here
      //    creates a DUPLICATE Korean `<ul class="mainmenu">` list that the
      //    template CSS doesn't style, so it renders as a vertical bulleted
      //    list and pushes hero content into a tiny remaining column.
      //    Mirrors the publisher dedup rule: "menuHtml 은 빈 래퍼, nav 는
      //    headerHtml 에만". Keep #hns_menu as an empty wrapper.
      //
      // 3. Legacy template without a pre-built menu → auto-generate from pages.
      const hasCompleteMenu = menuHtml && /<ul[^>]*>\s*<li/i.test(menuHtml);
      const headerHasNav = headerHtml && /<nav[\s>]/i.test(headerHtml);
      const modernTemplate =
        (cssText && cssText.includes("/* HNS-MODERN-TEMPLATE */")) ||
        (templateCss && templateCss.includes("/* HNS-MODERN-TEMPLATE */"));

      if (hasCompleteMenu) {
        menuRef.current.innerHTML = menuHtml;
      } else if (headerHasNav) {
        // Publisher behavior: when headerHtml already provides the <nav>,
        // suppress menuHtml entirely so the editor doesn't render a
        // duplicate top-of-canvas menu bar (mirroring
        // /api/published — `headerHasNavWithLinks ⇒ menuHtml = ""`).
        menuRef.current.innerHTML = "";
      } else if (modernTemplate) {
        menuRef.current.innerHTML = menuHtml || "";
      } else {
        menuRef.current.innerHTML = buildMenuHtml();
      }
      menuInitedRef.current = true;
      hydrateHmfDevice(menuRef.current);
    }
  }, []);

  useEffect(() => {
    if (footerRef.current && !footerInitedRef.current) {
      // Footer objects flow after the body (relative); strip any pinned
      // absolute top/position so they sit below the body on every page —
      // matching the published route (stripFooterPinnedTop there too).
      footerRef.current.innerHTML = stripFooterPinnedTop(footerHtml);
      footerInitedRef.current = true;
      normalizeAnchorImageBoxes(footerRef.current);
      hydrateHmfDevice(footerRef.current);
      // V2 — build the footer SceneGraph (mirrors the header effect above) so
      // footer objects appear in the "푸터 섹션" list and are Inspector-editable.
      // Stamp stable ids on every footer `.dragable` first so the parsed scene
      // ids match the live DOM. Footer edits persist site-wide.
      if (editorV2Enabled) {
        let n = 0;
        footerRef.current.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
          if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
        });
        useEditorStore.getState().setFooterScene(legacyHmfToScene(footerRef.current.innerHTML));
      }
      initialFooterSigRef.current = hmfSignature(footerRef.current);
    }
  }, [footerHtml, editorV2Enabled]);

  // Per-device footer live preview: the footer `<style>` @media only fires at
  // the real viewport, not the editor's wide browser, so paint the ACTIVE
  // device's footer background / min-height inline on #hns_footer. The inline
  // is on the container (not in innerHTML) so it is never persisted — the
  // `<style data-hns-footer>` block remains the single saved source.
  useEffect(() => {
    const fEl = footerRef.current;
    if (fEl) applyFooterLivePreview(fEl, footerStyle, viewportMode as FooterDevice);
  }, [viewportMode, footerStyle]);

  /* ─── Re-inject the site-wide header/footer from a fresh value ───
   * Used by cross-tab sync (A) and refresh-on-edit-entry (C): replace the
   * container's content, rebuild its scene + ids, and reset the clobber-guard
   * baseline so the freshly-applied copy isn't seen as a local edit. */
  const applyHeaderHtml = useCallback((html: string) => {
    const el = headerRef.current;
    if (!el || typeof html !== "string") return;
    multiSelectedRef.current.clear();
    useEditorStore.getState().clearSelection();
    el.innerHTML = html;
    normalizeAnchorImageBoxes(el);
    hydrateHmfDevice(el);
    if (editorV2Enabled) {
      let n = 0;
      el.querySelectorAll<HTMLElement>(".dragable").forEach((d) => {
        if (!d.id) d.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
      });
      useEditorStore.getState().setHeaderScene(legacyHmfToScene(el.innerHTML));
    }
    initialHeaderSigRef.current = hmfSignature(el);
  }, [editorV2Enabled]);

  const applyFooterHtml = useCallback((html: string) => {
    const el = footerRef.current;
    if (!el || typeof html !== "string") return;
    multiSelectedRef.current.clear();
    useEditorStore.getState().clearSelection();
    el.innerHTML = stripFooterPinnedTop(html);
    normalizeAnchorImageBoxes(el);
    hydrateHmfDevice(el);
    if (editorV2Enabled) {
      let n = 0;
      el.querySelectorAll<HTMLElement>(".dragable").forEach((d) => {
        if (!d.id) d.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
      });
      useEditorStore.getState().setFooterScene(legacyHmfToScene(el.innerHTML));
    }
    initialFooterSigRef.current = hmfSignature(el);
  }, [editorV2Enabled]);

  /* ─── (C) Refresh the site-wide HMF from the server ───
   * On entering "헤더/푸터 편집" mode, pull the freshest header/footer so the
   * user edits the current shared copy, not a stale one from page load. Skips
   * any container that has unsaved local edits (don't discard work). */
  /* ─── (A) Cross-tab header/footer sync via BroadcastChannel ─── */
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("hns-hmf");
    hmfChannelRef.current = ch;
    ch.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { siteId?: string; lang?: string; header?: string; footer?: string } | null;
      if (!m || m.siteId !== siteId || m.lang !== currentLang) return;
      // Only apply if this tab has NO unsaved local edits for that container.
      if (
        typeof m.header === "string" &&
        headerRef.current &&
        hmfSignature(headerRef.current) === initialHeaderSigRef.current
      ) {
        applyHeaderHtml(m.header);
      }
      if (
        typeof m.footer === "string" &&
        footerRef.current &&
        hmfSignature(footerRef.current) === initialFooterSigRef.current
      ) {
        applyFooterHtml(m.footer);
      }
    };
    return () => {
      ch.close();
      hmfChannelRef.current = null;
    };
  }, [siteId, currentLang, applyHeaderHtml, applyFooterHtml]);

  /* ─── HMF per-device preview paint ───
   * The editor canvas is a wide viewport with a narrow artboard, so the
   * embedded `<style data-hns-device>` @media block never fires here (it keys
   * on viewport width, not element width). On every device switch we paint the
   * active device onto the overridden HMF elements via inline styles — desktop
   * restores the PC base, tablet/mobile apply the cascaded geometry. This
   * mirrors the published @media cascade exactly (WYSIWYG). */
  useEffect(() => {
    if (!editorV2Enabled) return;
    const map = hmfDeviceFramesRef.current;
    const base = hmfBaseFramesRef.current;
    const dv = viewportMode as HmfViewport;
    for (const container of [headerRef.current, menuRef.current, footerRef.current]) {
      if (container) applyHmfDevicePreview(container, map, base, dv);
    }
  }, [editorV2Enabled, viewportMode]);

  /* ─── Auto zoom-to-fit in tablet/mobile (LEGACY ABSOLUTE) ───
   * The device artboard shrinks to 768/375, but legacy content authored at
   * the full design width (e.g. a header whose menu-bar image + nav icons sit
   * out to ~1130px) SPILLS past the artboard. Centered at 100%, that spill
   * lands under the fixed inspector panel where its resize handles are
   * unreachable, and the canvas reads as "skewed right / can't edit the right
   * edge". On entering a device mode we measure the REAL content extent and
   * zoom out so the whole thing (artboard + spill) fits the visible canvas
   * width, centered around the artboard center (transform-origin: top center).
   * Switching back to desktop resets to 100%. */
  useEffect(() => {
    if (!editorV2Enabled) return;
    if (viewportMode === "desktop") {
      setZoom(100);
      setFitOffsetX(0);
      return;
    }
    let cancelled = false;
    const fit = () => {
      if (cancelled) return;
      const wrap = canvasWrapperRef.current;
      const canvas = canvasRef.current;
      if (!wrap || !canvas) return;
      const cs = getComputedStyle(wrap);
      const padL = parseFloat(cs.paddingLeft) || 0;
      const padR = parseFloat(cs.paddingRight) || 0;
      const availInner = wrap.clientWidth - padL - padR - 48; // breathing room
      if (availInner <= 0) return;
      const cRect = canvas.getBoundingClientRect();
      const W = canvas.offsetWidth || 768; // unscaled artboard width
      const cur = cRect.width / W || 1; // current rendered scale
      const centerVp = cRect.left + cRect.width / 2; // artboard center (origin)
      let maxRvp = cRect.right;
      let minLvp = cRect.left;
      canvas.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > maxRvp) maxRvp = r.right;
        if (r.left < minLvp) minLvp = r.left;
      });
      // Convert the content's farthest edges to UNSCALED artboard-local px
      // (origin is top-center, so unscale around the artboard center).
      const minL = (minLvp - centerVp) / cur + W / 2;
      const maxR = (maxRvp - centerVp) / cur + W / 2;
      const contentCenter = (minL + maxR) / 2;
      const contentWidth = maxR - minL;
      let s: number;
      let tx: number;
      if (contentWidth > W * 1.8) {
        // Content is FAR wider than the artboard — i.e. legacy elements not
        // yet laid out for this device (e.g. a desktop header at ~1130 on a
        // 375 phone). Centering on the content center would shove the tiny
        // device frame into a corner. Keep the DEVICE FRAME centered (the
        // anchor the user arranges against) and zoom so the whole spill is
        // still visible to drag inward. tx=0 (artboard is margin-auto centered).
        const halfExtent = Math.max(maxR - W / 2, W / 2 - minL, 1);
        s = Math.max(0.25, Math.min(1, availInner / 2 / halfExtent));
        tx = 0;
      } else {
        // Content roughly fills the artboard (tablet, or an already-laid-out
        // device): center the CONTENT itself so it reads as balanced. The
        // artboard box is margin-auto centered, so translate the content-center
        // offset (scaled) back to the middle.
        const halfWidth = Math.max(contentWidth / 2, 1);
        s = Math.max(0.25, Math.min(1, availInner / 2 / halfWidth));
        tx = -(contentCenter - W / 2) * s;
      }
      setZoom(Math.round(s * 100));
      setFitOffsetX(Math.round(tx));
    };
    const t1 = setTimeout(fit, 120);
    const t2 = setTimeout(fit, 480);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editorV2Enabled, viewportMode]);

  /* ─── Load AI credit balance + cost ─── */
  const reloadBalance = useCallback(async () => {
    try {
      const r = await fetch("/api/credits/balance");
      if (!r.ok) return;
      const data = await r.json();
      if (typeof data.balance === "number") setCreditBalance(data.balance);
      if (typeof data.costs?.AI_EDIT === "number") setCreditCost(data.costs.AI_EDIT);
    } catch {
      // silent — badge simply won't render until we have a number
    }
  }, []);
  useEffect(() => {
    reloadBalance();
  }, [reloadBalance]);

  const measureBodyContentHeight = useCallback((padding = BODY_BOTTOM_PADDING) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return BODY_MIN_HEIGHT_FLOOR;
    let maxBottom = 0;
    const children = bodyEl.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i] as HTMLElement;
      if (child.classList.contains("de-resize-handle")) continue;
      // Skip layers hidden on the active device (LayerPanel eye toggle OR the
      // per-device "이 기기에서 숨기기"). They're display:none on the published
      // page for this device, so counting them would inflate #hns_body's
      // min-height and leave a large empty gap before the footer.
      if (child.hasAttribute("data-de-hidden")) continue;
      // Skip elements parked ENTIRELY off the right edge of the canvas (e.g.
      // per-device / mobile-only content positioned at left ≥ canvas width on
      // desktop, or stray off-screen pastes). They aren't visible in this
      // layout, but their (often large) `top` would otherwise inflate
      // #hns_body's min-height and leave a huge empty gap before the footer.
      const cw = bodyEl.offsetWidth;
      if (cw > 0) {
        const left =
          parseInt(child.style.left) ||
          parseInt(window.getComputedStyle(child).left) ||
          0;
        if (left >= cw) continue;
      }
      const top = parseInt(child.style.top) || parseInt(window.getComputedStyle(child).top) || 0;
      const height = child.offsetHeight || 0;
      maxBottom = Math.max(maxBottom, top + height);
    }
    return Math.max(BODY_MIN_HEIGHT_FLOOR, Math.ceil(maxBottom + padding));
  }, []);

  const applyBodyHeight = useCallback((height: number, opts?: { manual?: boolean; device?: ViewportMode }) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const device = opts?.device ?? useEditorStore.getState().viewportMode;
    const next = Math.max(BODY_MIN_HEIGHT_FLOOR, Math.round(height));
    bodyEl.style.minHeight = `${next}px`;
    setBodyHandleTop(bodyEl.offsetTop + next);
    if (opts?.manual) {
      bodyManualMinHeightRef.current = {
        ...bodyManualMinHeightRef.current,
        [device]: next,
      };
      setSaveStatus("");
    }
  }, []);

  const syncBodyHeight = useCallback((opts?: { manualHeight?: number; device?: ViewportMode }) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const device = opts?.device ?? useEditorStore.getState().viewportMode;
    const manualHeight = opts?.manualHeight ?? bodyManualMinHeightRef.current[device] ?? 0;
    // Floor: with NO manual override, hug content + the default 80px buffer
    // (auto-fit look). Once the user has MANUALLY set a body height (drag handle
    // / 최소 높이 입력), floor only at the RAW content bottom (no buffer) so they
    // can pull the body↔footer gap down to ~0 and it WON'T bounce back to
    // content+80 on the next sync.
    const floor =
      manualHeight > 0 ? measureBodyContentHeight(0) : measureBodyContentHeight();
    applyBodyHeight(Math.max(floor, manualHeight), {
      manual: opts?.manualHeight !== undefined,
      device,
    });
  }, [applyBodyHeight, measureBodyContentHeight]);

  const scheduleBodyHeightSync = useCallback(() => {
    if (bodyHeightRafRef.current != null) return;
    bodyHeightRafRef.current = requestAnimationFrame(() => {
      bodyHeightRafRef.current = null;
      syncBodyHeight();
    });
  }, [syncBodyHeight]);

  const startBodyResize = useCallback((clientY: number) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    bodyResizeRef.current = {
      startY: clientY,
      startHeight: bodyEl.offsetHeight,
    };
    multiSelectedRef.current.clear();
    useEditorStore.getState().clearSelection();
    setSelectedElId(null);
    setEditingTextId(null);
  }, []);

  useEffect(() => {
    syncBodyHeight();
    // Async content (FB embed iframe, board/product plugins, images) finishes
    // laying out AFTER the immediate measure, so the first pass can be too
    // short — leaving the footer in the middle of the content on the device
    // just switched to. Re-measure on a couple of delays (mirrors the
    // published min-height script) so the footer settles below the lowest
    // object. Cleared on unmount / next device change.
    const t1 = setTimeout(() => syncBodyHeight(), 350);
    const t2 = setTimeout(() => syncBodyHeight(), 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [viewportMode, zoom, fitOffsetX, syncBodyHeight]);

  /* ─── Calculate hns_body min-height from content + manual body handle ─── */
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    function recalcBodyHeight() {
      syncBodyHeight();
    }

    // Recalculate after images load
    const images = bodyEl.querySelectorAll("img");
    let loaded = 0;
    const total = images.length;
    function onLoad() {
      loaded++;
      if (loaded >= total) recalcBodyHeight();
    }
    images.forEach((img) => {
      if (img.complete) { loaded++; } else { img.addEventListener("load", onLoad); img.addEventListener("error", onLoad); }
    });

    // Initial calculation (with small delay for CSS to apply)
    recalcBodyHeight();
    setTimeout(recalcBodyHeight, 100);
    setTimeout(recalcBodyHeight, 500);

    return () => {
      images.forEach((img) => { img.removeEventListener("load", onLoad); img.removeEventListener("error", onLoad); });
      if (bodyHeightRafRef.current != null) {
        cancelAnimationFrame(bodyHeightRafRef.current);
        bodyHeightRafRef.current = null;
      }
    };
  }, [bodyHtml, syncBodyHeight]);

  /* ─── Save ─── */
  const saveContent = useCallback(async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      // Get the current body HTML from the canvas, stripping editor artifacts
      const bodyEl = bodyRef.current;
      if (bodyEl) {
        // Remove resize handles before saving
        bodyEl.querySelectorAll(".de-resize-handle").forEach((h) => h.remove());
        // Remove de-selected class
        bodyEl.querySelectorAll(".de-selected").forEach((el) => el.classList.remove("de-selected"));
        // Strip in-place text-edit artifacts so the saved HTML is clean.
        bodyEl.querySelectorAll('[contenteditable="true"]').forEach((el) => {
          el.removeAttribute("contenteditable");
          el.removeAttribute("spellcheck");
        });
        bodyEl.querySelectorAll(".de-text-editing").forEach((el) => el.classList.remove("de-text-editing"));
        // WYSIWYG capture for PLUGINS (boardPlugin slideshow/grid, productPlugin…).
        // A plugin's store frame can desync from the live canvas — e.g. the hero
        // board is an auto-advancing slideshow whose JS mutates its DOM, which can
        // let the scene frame drift back to the stale full size while the canvas
        // still shows the user's resize. Result: a width resize is VISIBLE in the
        // editor but reverts to full width on save ("게시판2 리사이즈 후 저장하면
        // 풀폭 복귀"). Snapshot each plugin's CURRENTLY DISPLAYED size into the
        // store (device-aware via setFrame) BEFORE the re-syncs below read the
        // scene, so the save persists exactly what's on screen. No-op for plugins
        // already in sync; only w/h (position is applied via inline and stays).
        if (editorV2Enabled) {
          const store0 = useEditorStore.getState();
          bodyEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
            if (!el.id || !/\b[A-Za-z]+Plugin\b/.test(el.className)) return;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            if (w > 0 && h > 0) store0.setFrame(el.id, { w, h });
          });
        }
        // For elements with margin:auto (centered), remove left/top that conflict
        bodyEl.querySelectorAll(".dragable").forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.style.margin && htmlEl.style.margin.includes("auto")) {
            htmlEl.style.removeProperty("left");
            htmlEl.style.removeProperty("top");
          }
        });
      }
      // `content.html` MUST be the DESKTOP base. The canvas DOM currently
      // reflects whichever device is previewed (tablet/mobile) — reading it
      // as-is bakes that device's geometry (e.g. a mobile-shrunk hero) into
      // the base html, so on reload `legacyHtmlToScene(html)` parses the
      // shrunk size as the base and EVERY device inherits it. Re-sync the body
      // to desktop before reading, then restore the preview. Device overrides
      // persist separately (content.layers + pageCss `@media`), so nothing is
      // lost. Mirrors the HMF save's desktop reset. (Sprint: per-device fix.)
      const saveDevice = editorV2Enabled
        ? (useEditorStore.getState().viewportMode as ViewportMode)
        : "desktop";
      if (bodyEl && saveDevice !== "desktop") {
        syncStoreToDom(useEditorStore.getState().scene, bodyEl, "desktop");
      }
      const bodyLayoutHeights: BodyLayoutHeights = { ...bodyManualMinHeightRef.current };
      const captureCurrentBodyHeight = (device: ViewportMode) => {
        if (!bodyEl) return;
        syncBodyHeight({ device });
        const manual = bodyManualMinHeightRef.current[device] ?? 0;
        // Floor the saved body height at the content bottom so the footer never
        // overlaps content. BUT when the user has MANUALLY shrunk the body (drag
        // handle / 최소 높이), floor at the RAW content bottom (no +80 buffer) —
        // otherwise the save re-inflates the body↔footer gap back to content+80
        // and the footer drops below the gray area again on every save.
        const contentFloor =
          manual > 0 ? measureBodyContentHeight(0) : measureBodyContentHeight();
        bodyLayoutHeights[device] = Math.max(
          contentFloor,
          manual,
          parseInt(bodyEl.style.minHeight) || bodyEl.offsetHeight || 0,
        );
      };
      if (bodyEl) captureCurrentBodyHeight("desktop");
      // Auto-measure TABLET + MOBILE too, so the footer (which flows after
      // #hns_body) sits below the lowest object on EVERY device — not only the
      // one currently being edited. Re-render the body at each device, measure,
      // then restore to desktop for the base-html read below. Without this,
      // adding/moving objects only refreshed the active device's body height;
      // other devices kept a stale (often short) min-height, so the footer
      // landed in the MIDDLE of the content (e.g. tablet footer overlapping the
      // board/QR). Device overrides persist separately, so the re-render is safe.
      if (bodyEl && editorV2Enabled) {
        for (const dev of ["tablet", "mobile"] as ViewportMode[]) {
          syncStoreToDom(useEditorStore.getState().scene, bodyEl, dev);
          captureCurrentBodyHeight(dev);
        }
        syncStoreToDom(useEditorStore.getState().scene, bodyEl, "desktop");
        // CRITICAL: the loop above measured tablet THEN mobile, leaving
        // bodyEl.style.minHeight at the MOBILE height (often far taller than
        // desktop). syncStoreToDom restores element POSITIONS but not the body
        // min-height. When the editing device IS desktop, the non-desktop
        // restore below (saveDevice !== "desktop") is skipped — so without this
        // the live canvas keeps the mobile min-height and the footer jumps
        // ~1000–2000px below the desktop content right after Save. Re-apply the
        // desktop body height. (A non-desktop editing device re-restores its own
        // height at the saveDevice block below, overriding this.)
        applyBodyHeight(bodyLayoutHeights.desktop ?? measureBodyContentHeight(), {
          device: "desktop",
        });
      }
      // Plugins (boardPlugin/productPlugin/…) are CSS-governed: their real
      // size lives in the page CSS real-size rule (+ device `@media`).
      // `applyFrameToEl` writes a plugin's frame inline with `!important` for
      // live-canvas preview, but a *persisted* inline `!important` geometry
      // beats BOTH the CSS rule AND the mobile `@media` (inline `!important`
      // wins the cascade), pinning the plugin to one size on every device and
      // silently defeating the user's per-device override. For plugins that
      // carry a tablet/mobile override in the scene, strip the inline geometry
      // before persisting so the CSS cascade (desktop rule + `@media`) governs.
      // Scoped to overridden plugins only → zero effect on single-size plugins.
      // Captured plugin inline geometry, restored after the HTML is built so the
      // LIVE canvas doesn't FLASH to the (not-yet-updated) CSS rule size between
      // this strip and the post-save re-render. Persistence reads the scene
      // (sceneToLegacyHtml below), not these inline props, so stripping then
      // restoring is invisible to the saved output.
      const pluginGeomRestore: Array<{ el: HTMLElement; decls: Array<[string, string]> }> = [];
      if (bodyEl && editorV2Enabled) {
        type WalkNode = {
          id?: string;
          tabletFrame?: unknown;
          mobileFrame?: unknown;
          children?: WalkNode[];
        };
        const overridden = new Set<string>();
        const walk = (n: WalkNode | undefined): void => {
          if (!n) return;
          if (n.id && (n.tabletFrame || n.mobileFrame)) overridden.add(n.id);
          n.children?.forEach(walk);
        };
        walk(useEditorStore.getState().scene.root as unknown as WalkNode);
        bodyEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
          if (!/\b[A-Za-z]+Plugin\b/.test(el.className)) return;
          if (!el.id || !overridden.has(el.id)) return;
          const decls: Array<[string, string]> = [];
          for (const p of ["left", "top", "width", "height"] as const) {
            const v = el.style.getPropertyValue(p);
            if (v) decls.push([p, v]);
            el.style.removeProperty(p);
          }
          if (decls.length) pluginGeomRestore.push({ el, decls });
        });
      }
      // Build the persisted body from the scene's DESKTOP base, not from the
      // currently painted canvas DOM. The DOM is only a preview surface and can
      // contain tablet/mobile inline geometry after the last edited device.
      const v2Scene = editorV2Enabled
        ? cloneSceneForDesktopSave(useEditorStore.getState().scene, bodyEl)
        : null;
      const rawHtml = v2Scene
        ? sceneToLegacyHtml(v2Scene)
        : (bodyEl ? bodyEl.innerHTML : currentBodyHtml);
      // Restore the stripped plugin inline geometry so the live canvas keeps
      // showing the resized size through the rest of the save (the updated CSS
      // real-size rule already matches, so there's no visible jump on re-render).
      for (const { el, decls } of pluginGeomRestore) {
        for (const [p, v] of decls) el.style.setProperty(p, v, "important");
      }
      // Strip canvas-only `!important` annotations from inline background
      // styles before persisting. `applyStyleToEl` writes background with
      // `!important` so it beats CSS rules on the canvas; the saved HTML
      // should carry the clean value so published pages and future parses
      // see a plain inline `background:…` without the flag.
      const html = rawHtml.replace(
        /\bbackground\s*:\s*([^;!}"']*?)\s*!important\s*([;}"'])/gi,
        "background: $1$2",
      );
      if (bodyEl && saveDevice !== "desktop") {
        // Restore the device preview the user was editing in.
        syncStoreToDom(useEditorStore.getState().scene, bodyEl, saveDevice);
        captureCurrentBodyHeight(saveDevice);
      }

      // Device viewport overrides (tablet ≤1024 + mobile ≤767 + hidden +
      // cascade) → single `@media` block inside pageCss via the shared
      // emitter that the published route also calls (WYSIWYG guarantee).
      // Strip BOTH the new device block and any legacy mobile-only block
      // (SCENE-MOBILE-OVERRIDES) left by older saves before re-emitting.
      let finalPageCss = currentPageCss;
      if (v2Scene) {
        let base = stripDeviceMediaCss(finalPageCss);
        base = stripMobileCssBlock(base);
        const deviceBlock = buildDeviceMediaCss(v2Scene);
        finalPageCss = deviceBlock
          ? (base ? `${base}\n\n${deviceBlock}` : deviceBlock)
          : base;
      }
      if (bodyEl) finalPageCss = upsertBodyLayoutCss(finalPageCss, bodyLayoutHeights);
      if (v2Scene) {
        // Sync each plugin's base "real-size" CSS rule to its desktop frame.
        // Plugins are sized by that CSS rule (not inline) — the editor + parser
        // read the plugin's geometry from it — but resizing only updates the
        // frame/inline, leaving the rule stale so the plugin snaps back to its
        // old size on reload ("게시판2 리사이즈 후 풀폭 복귀"). Walk the saved
        // desktop scene and rewrite the matching rule's left/top/width/height.
        const pluginFrames = new Map<
          string,
          { x: number; y: number; w: number; h: number }
        >();
        const PLUGIN_TYPES = new Set(["board", "product", "exhibition", "menu", "login", "mail"]);
        const collect = (node: { id?: string; type?: string; frame?: { x: number; y: number; w: number; h: number }; children?: unknown[] }) => {
          if (node.id && node.type && PLUGIN_TYPES.has(node.type) && node.frame) {
            pluginFrames.set(node.id, node.frame);
          }
          if (Array.isArray(node.children)) {
            for (const c of node.children) collect(c as typeof node);
          }
        };
        collect(v2Scene.root as unknown as Parameters<typeof collect>[0]);
        finalPageCss = updatePluginRealSizeCss(finalPageCss, pluginFrames);
      }
      const cssChanged = finalPageCss !== pageCss;

      // Save page body + CSS
      const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            html,
            ...(v2Scene && { layers: v2Scene, schemaVersion: 1 }),
          },
          ...(cssChanged && { css: finalPageCss }),
        }),
      });

      // Save header/menu/footer HMF changes
      const hEl = headerRef.current;
      const mEl = menuRef.current;
      const fEl = footerRef.current;
      if (hEl || mEl || fEl) {
        // HMF serialization must capture the PC layout as the inline base —
        // per-device geometry lives ONLY in the embedded `<style
        // data-hns-device>` @media block. If we're previewing a device, the
        // painted inline styles are the device geometry; restore the PC base
        // inline BEFORE reading innerHTML, then re-apply the active device so
        // editing continues uninterrupted.
        const dv = editorV2Enabled
          ? (useEditorStore.getState().viewportMode as HmfViewport)
          : "desktop";
        const map = hmfDeviceFramesRef.current;
        const base = hmfBaseFramesRef.current;
        if (dv !== "desktop") {
          for (const c of [hEl, mEl, fEl]) {
            if (c) applyHmfDevicePreview(c, map, base, "desktop");
          }
        }
        // Menu persistence:
        //  - If the menu carries per-device geometry (a managed `<style
        //    data-hns-device>` block, written by writeHmfDeviceStyle when the
        //    user drags #v-wdg-nav in tablet/mobile mode), it MUST be saved even
        //    in "auto" mode. Discarding it makes the publisher fall back to the
        //    fixed-position legacy Site.menuHtml, freezing the menu at desktop
        //    coords on every device. hmfSignature() keeps that device <style>
        //    child; the publisher still refreshes link labels inside
        //    `ul.mainmenu` from the pages list, so auto link-sync is preserved.
        //  - Otherwise: auto → empty wrapper (dynamic gen); custom → DOM as-is.
        const menuSig = mEl ? hmfSignature(mEl) : undefined;
        const menuHtmlToSave =
          menuSig !== undefined && menuSig.includes("data-hns-device")
            ? menuSig
            : (menuMode === "auto" ? "" : (mEl ? mEl.innerHTML : undefined));
        // Header/footer are SITE-WIDE. Only re-save them when THIS page actually
        // changed them (signature differs from what it loaded) — otherwise a
        // page that never touched the header would overwrite the shared copy
        // with its now-stale version, wiping header edits made on another page.
        // The signature is also the cleaned value we persist (no editor-only
        // `de-selected` / contenteditable leaking into the published page).
        const headerSig = hEl ? hmfSignature(hEl) : undefined;
        const footerSig = fEl ? hmfSignature(fEl) : undefined;
        const headerHtmlToSave =
          headerSig !== undefined && headerSig !== initialHeaderSigRef.current
            ? headerSig
            : undefined;
        const footerHtmlToSave =
          footerSig !== undefined && footerSig !== initialFooterSigRef.current
            ? footerSig
            : undefined;
        if (dv !== "desktop") {
          for (const c of [hEl, mEl, fEl]) {
            if (c) applyHmfDevicePreview(c, map, base, dv);
          }
        }
        const sendHmf =
          headerHtmlToSave !== undefined ||
          footerHtmlToSave !== undefined ||
          menuHtmlToSave !== undefined;
        const hmfRes = sendHmf
          ? await fetch(`/api/sites/${siteId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                hmfLang: currentLang,
                ...(headerHtmlToSave !== undefined && { headerHtml: headerHtmlToSave }),
                ...(menuHtmlToSave !== undefined && { menuHtml: menuHtmlToSave }),
                ...(footerHtmlToSave !== undefined && { footerHtml: footerHtmlToSave }),
              }),
            })
          : null;
        // Header/footer edits are now persisted site-wide → clear both dirty
        // flags and advance the baseline so subsequent saves diff against the
        // just-saved state.
        if ((hmfRes === null || hmfRes.ok) && editorV2Enabled) {
          useEditorStore.getState().markHeaderClean();
          useEditorStore.getState().markFooterClean();
          if (headerHtmlToSave !== undefined && headerSig !== undefined)
            initialHeaderSigRef.current = headerSig;
          if (footerHtmlToSave !== undefined && footerSig !== undefined)
            initialFooterSigRef.current = footerSig;
          // (A) Tell other open editor tabs of the same site+lang to refresh
          // their site-wide header/footer with what we just saved.
          if (
            hmfRes &&
            hmfRes.ok &&
            hmfChannelRef.current &&
            (headerHtmlToSave !== undefined || footerHtmlToSave !== undefined)
          ) {
            hmfChannelRef.current.postMessage({
              siteId,
              lang: currentLang,
              ...(headerHtmlToSave !== undefined && { header: headerHtmlToSave }),
              ...(footerHtmlToSave !== undefined && { footer: footerHtmlToSave }),
            });
          }
        }
      }

      if (res.ok) {
        setCurrentBodyHtml(html);
        if (editorV2Enabled) setCurrentPageCss(finalPageCss);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 2000);
        return true;
      } else {
        setSaveStatus("error");
        return false;
      }
    } catch {
      setSaveStatus("error");
      return false;
    } finally {
      setSaving(false);
    }
  }, [siteId, pageId, currentBodyHtml, currentPageCss, pageCss, currentLang, menuMode, editorV2Enabled]);

  /* ─── AI Edit ─── */
  const executeAiEdit = useCallback(async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    setAiLoading(true);
    setAiStatus("");
    setAiError("");

    // Save current state for undo (body + header + menu + footer + css)
    aiPrevHtmlRef.current = JSON.stringify({
      body: bodyEl.innerHTML,
      header: headerRef.current?.innerHTML || "",
      menu: menuRef.current?.innerHTML || "",
      footer: footerRef.current?.innerHTML || "",
      pageCss: currentPageCss || "",
    });

    try {
      // Build selected element context for AI
      let selectedContext = "";
      if (selectedElId) {
        const selEl = document.getElementById(selectedElId);
        if (selEl) {
          const section = selEl.closest("#hns_header") ? "header"
            : selEl.closest("#hns_menu") ? "menu"
            : selEl.closest("#hns_footer") ? "footer" : "body";
          selectedContext = `[Selected element: id="${selectedElId}", section="${section}", outerHTML:\n${selEl.outerHTML.substring(0, 1500)}]`;
        }
      }

      const res = await fetch("/api/ai/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: bodyEl.innerHTML,
          headerHtml: headerRef.current?.innerHTML || "",
          menuHtml: menuRef.current?.innerHTML || "",
          footerHtml: footerRef.current?.innerHTML || "",
          pageCss: currentPageCss || "",
          css: cssText || "",
          templateCss: templateCss || "",
          prompt: aiPrompt.trim(),
          selectedElement: selectedContext || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402 && data.code === "INSUFFICIENT_CREDITS") {
          setInsufficientCredits({
            required: typeof data.required === "number" ? data.required : creditCost,
            balance: typeof data.balance === "number" ? data.balance : 0,
          });
          setAiStatus("");
          setAiError("");
          return;
        }
        setAiStatus("error");
        setAiError(data.error || t("ai.errorGeneric"));
        return;
      }

      // Apply results to the appropriate sections
      if (data.body !== undefined) {
        bodyEl.innerHTML = data.body;
        setCurrentBodyHtml(data.body);
      }
      if (data.header !== undefined && headerRef.current) {
        headerRef.current.innerHTML = data.header;
      }
      if (data.menu !== undefined && menuRef.current) {
        menuRef.current.innerHTML = data.menu;
      }
      if (data.footer !== undefined && footerRef.current) {
        footerRef.current.innerHTML = stripFooterPinnedTop(data.footer);
      }
      if (data.pageCss !== undefined) {
        setCurrentPageCss(data.pageCss);
      }
      setAiStatus("success");
      reloadBalance();
    } catch {
      setAiStatus("error");
      setAiError(t("ai.networkError"));
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt, aiLoading, currentPageCss, cssText, templateCss, selectedElId, creditCost, reloadBalance]);

  const undoAiEdit = useCallback(() => {
    if (aiPrevHtmlRef.current !== null) {
      try {
        const prev = JSON.parse(aiPrevHtmlRef.current);
        if (bodyRef.current) {
          bodyRef.current.innerHTML = prev.body;
          setCurrentBodyHtml(prev.body);
        }
        if (headerRef.current && prev.header) {
          headerRef.current.innerHTML = prev.header;
        }
        if (menuRef.current && prev.menu) {
          menuRef.current.innerHTML = prev.menu;
        }
        if (footerRef.current && prev.footer) {
          footerRef.current.innerHTML = stripFooterPinnedTop(prev.footer);
        }
        if (prev.pageCss !== undefined) {
          setCurrentPageCss(prev.pageCss);
        }
      } catch {
        if (bodyRef.current) {
          bodyRef.current.innerHTML = aiPrevHtmlRef.current;
          setCurrentBodyHtml(aiPrevHtmlRef.current);
        }
      }
      aiPrevHtmlRef.current = null;
      setAiStatus("");
    }
  }, []);

  /* ─── Publish ─── */
  const publishSite = useCallback(async () => {
    setPublishing(true);
    try {
      // Publish must use the same device-safe serializer as Save. Reading
      // `bodyRef.current.innerHTML` here bakes the active preview DOM
      // (mobile/tablet) into desktop `content.html`.
      const saved = await saveContent();
      if (!saved) return;

      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          published: true,
          hmfLang: currentLang,
        }),
      });
      if (res.ok) {
        setIsPublished(true);
        setShowPublishModal(true);
      }
    } catch {
      // ignore
    } finally {
      setPublishing(false);
    }
  }, [siteId, currentLang, saveContent]);

  /* ─── Keyboard shortcuts ─── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveContent();
        return;
      }
      // Cmd/Ctrl+D — duplicate selected layer(s). Browsers' default
      // for Cmd+D is "bookmark this page", which is intercepted here.
      if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
        // Skip when typing in inputs / contenteditable so users editing
        // text can still use any custom Cmd+D in their workflow.
        const ae = document.activeElement as HTMLElement | null;
        if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.isContentEditable)) {
          return;
        }
        if (!editorV2Enabled) return;
        e.preventDefault();
        const ms = multiSelectedRef.current;
        const ids = ms.size > 0 ? Array.from(ms) : selectedElId ? [selectedElId] : [];
        if (ids.length === 0) return;
        const store = useEditorStore.getState();
        let lastNewId: string | null = null;
        for (const id of ids) {
          const newId = store.duplicateLayer(id, { dx: 16, dy: 16 });
          if (newId) lastNewId = newId;
        }
        if (lastNewId) {
          store.select(lastNewId);
          setSelectedElId(lastNewId);
        }
        return;
      }
      if (!selectedElId || editingTextId || document.querySelector("[data-tiptap-modal]")) return;

      const el = document.getElementById(selectedElId);
      if (!el) return;

      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.ctrlKey || e.metaKey) {
          el.remove();
          multiSelectedRef.current.delete(selectedElId);
          setSelectedElId(null);
          setMultiSelectCount(multiSelectedRef.current.size);
        }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        // Collect all elements to move (primary + multi-selected)
        const elIds = new Set(multiSelectedRef.current);
        elIds.add(selectedElId);
        elIds.forEach((id) => {
          const target = document.getElementById(id);
          if (!target) return;
          // V2 + body elements: the V2 keydown handler (useEditorStore) already
          // called s.setFrame which routes through applyFrameToEl with !important.
          // Writing plain inline here would overwrite the !important and snap the
          // element back to its CSS-declared position.
          if (editorV2Enabled && bodyRef.current?.contains(target)) return;
          // Use computed style for accurate current position — inline style may be
          // empty or stale if CSS (boostImportant) positions the element.
          const cs = window.getComputedStyle(target);
          const top = parseInt(cs.top) || 0;
          const left = parseInt(cs.left) || 0;
          // HMF (raw-injected) and plugin elements need !important to beat the
          // boostImportant'd page CSS, same as drag/resize paths.
          const needsImportant = !!(
            headerRef.current?.contains(target) ||
            menuRef.current?.contains(target) ||
            footerRef.current?.contains(target) ||
            /\b[A-Za-z]+Plugin\b/.test(target.className)
          );
          const setPos = (prop: "top" | "left", val: number) => {
            if (needsImportant) target.style.setProperty(prop, val + "px", "important");
            else target.style[prop] = val + "px";
          };
          if (e.key === "ArrowUp")    setPos("top",  top  - step);
          if (e.key === "ArrowDown")  setPos("top",  top  + step);
          if (e.key === "ArrowLeft")  setPos("left", left - step);
          if (e.key === "ArrowRight") setPos("left", left + step);
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElId, editingTextId, saveContent, editorV2Enabled]);

  /* ─── Clipboard image paste — replaces selected image dragable ──────
   * When the user has an image dragable (or a box layer that contains
   * an <img>) selected and presses Cmd/Ctrl+V with an image in the
   * clipboard, upload + swap the src. Skips when the active element is
   * a contenteditable (text edit takes priority).
   */
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Don't intercept when user is typing into an input/textarea/contenteditable.
      const ae = document.activeElement as HTMLElement | null;
      if (ae) {
        const tag = ae.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (ae.isContentEditable) return;
      }
      if (!selectedElId) return;
      // Only proceed if the selected layer is an image, OR a box whose
      // innerHtml contains an <img> (e.g., the Company Preview .frame
      // pattern from the atomization session).
      const el = document.getElementById(selectedElId);
      if (!el) return;
      const isImage = el.tagName === "IMG" || el.querySelector(":scope > img") !== null;
      // Box-with-img: innerHtml has at least one <img> and the wrapper
      // itself has dragable class.
      const hasInnerImg = el.querySelector("img") !== null;
      const isDragable = el.classList.contains("dragable");
      if (!isDragable || !hasInnerImg) {
        // Either the layer isn't an image-bearing dragable, or it's
        // already in text-edit. Don't block other paste handlers.
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;
      let imgFile: File | null = null;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          imgFile = it.getAsFile();
          if (imgFile) break;
        }
      }
      if (!imgFile) return;

      e.preventDefault();
      // Upload + apply via setImage so undo/redo + save serialize work.
      void (async () => {
        try {
          const fd = new FormData();
          fd.append("file", imgFile!);
          fd.append("folder", "site-uploads");
          fd.append("compress", "true");
          if (siteId) fd.append("siteId", siteId);
          const res = await fetch("/api/upload", { method: "POST", body: fd });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(j.error || `${t("inspector.image.uploadFailed")} (${res.status})`);
          }
          const { url } = (await res.json()) as { url?: string };
          if (typeof url !== "string") return;
          if (editorV2Enabled) {
            useEditorStore.getState().setImage(selectedElId, { src: url });
          } else {
            // V1 fallback — patch DOM img directly.
            const img = el.querySelector("img");
            if (img) img.setAttribute("src", url);
          }
        } catch (err) {
          console.error("[paste] image upload failed:", err);
          alert(err instanceof Error ? err.message : t("alerts.imagePasteFailed"));
        }
      })();
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [selectedElId, siteId, editorV2Enabled]);

  /* ─── Helper: get canvas scale factor for touch coordinate compensation ─── */
  function getCanvasScale(): number {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return 1;
    const transform = window.getComputedStyle(canvasEl).transform;
    if (transform && transform !== "none") {
      const match = transform.match(/matrix\(([^,]+)/);
      if (match) return parseFloat(match[1]) || 1;
    }
    return 1;
  }

  /* ─── Section reorder via canvas drag ───────────────────────────────
   * When the user mousedown-drags on a section (flow `.dragable` with
   * dragable descendants), instead of the no-op pixel drag we enter
   * REORDER mode. A horizontal blue line follows the cursor showing
   * the insertion slot; on mouseup we call `moveLayer` to swap order.
   *
   * Scope: only sections that are direct children of the body container
   * (the common case for templates). Sections nested inside groups
   * fall through to a no-op so we don't accidentally pull them out of
   * their parent.
   */
  function startSectionReorder(sectionEl: HTMLElement, startX: number, startY: number) {
    const bodyEl = bodyRef.current;
    if (!bodyEl || sectionEl.parentElement !== bodyEl) return;

    // Snapshot top-level sibling sections (other top-level .dragable kids of body).
    const siblings = Array.from(bodyEl.children).filter(
      (n): n is HTMLElement =>
        n instanceof HTMLElement && n.classList.contains("dragable"),
    );
    const myIndex = siblings.indexOf(sectionEl);
    if (myIndex === -1) return;

    // Lazily-built fixed-position indicator. Reused across drags via ref.
    if (!sectionReorderIndicatorRef.current) {
      const ind = document.createElement("div");
      ind.style.cssText =
        "position:fixed;height:3px;background:#2a79ff;box-shadow:0 0 8px rgba(42,121,255,0.6);pointer-events:none;z-index:9999;border-radius:2px;display:none;";
      document.body.appendChild(ind);
      sectionReorderIndicatorRef.current = ind;
    }
    const ind = sectionReorderIndicatorRef.current;

    let movedFar = false;
    let dropIndex: number | null = null;
    const originalOpacity = sectionEl.style.opacity; // preserve before drag temporarily changes it

    const computeDropIndex = (clientY: number): number => {
      // Walk siblings; whatever's mid-Y is above the cursor pushes the
      // drop index past it. Result is the slot index in the original
      // siblings list (pre-removal).
      let idx = 0;
      for (let i = 0; i < siblings.length; i++) {
        const r = siblings[i]!.getBoundingClientRect();
        if (clientY > r.top + r.height / 2) idx = i + 1;
        else break;
      }
      return idx;
    };

    const showIndicator = (idx: number) => {
      let r: DOMRect;
      let topY: number;
      if (idx <= 0) {
        r = siblings[0]!.getBoundingClientRect();
        topY = r.top - 1;
      } else if (idx >= siblings.length) {
        r = siblings[siblings.length - 1]!.getBoundingClientRect();
        topY = r.bottom - 1;
      } else {
        const above = siblings[idx - 1]!.getBoundingClientRect();
        const below = siblings[idx]!.getBoundingClientRect();
        r = above;
        topY = (above.bottom + below.top) / 2 - 1;
      }
      ind.style.top = `${topY}px`;
      ind.style.left = `${r.left}px`;
      ind.style.width = `${r.width}px`;
      ind.style.display = "block";
    };

    const onMove = (e: PointerEvent) => {
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (!movedFar && (dx > 5 || dy > 5)) {
        movedFar = true;
        sectionEl.style.opacity = "0.5";
        sectionEl.style.cursor = "grabbing";
        document.body.style.cursor = "grabbing";
      }
      if (!movedFar) return;
      dropIndex = computeDropIndex(e.clientY);
      showIndicator(dropIndex);
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      sectionEl.style.opacity = originalOpacity; // restore — don't clobber opacity:0 user settings
      sectionEl.style.cursor = "";
      document.body.style.cursor = "";
      ind.style.display = "none";

      if (!movedFar || dropIndex === null) return;
      // Adjust for removal of the dragged element when moving downward.
      let newIdx = dropIndex;
      if (newIdx > myIndex) newIdx -= 1;
      if (newIdx === myIndex) return; // no change

      if (editorV2Enabled) {
        // Sections are top-level children of the scene root. moveLayer
        // takes (fromId, toParentId, toIndex) — the root is the parent.
        const rootId = useEditorStore.getState().scene.root.id;
        useEditorStore.getState().moveLayer(sectionEl.id, rootId, newIdx);
      } else {
        // V1 fallback: shuffle DOM directly. (V1 path is rare now.)
        const target = newIdx >= siblings.length ? null : siblings[newIdx]!;
        if (target) bodyEl.insertBefore(sectionEl, target);
        else bodyEl.appendChild(sectionEl);
        setCurrentBodyHtml(bodyEl.innerHTML);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  /* ─── Shared: start drag on an element ─── */
  function startDragOnElement(target: HTMLElement, clientX: number, clientY: number, shiftKey?: boolean) {
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (!dragable) {
      // Click on empty area: clear all selections
      setSelectedElId(null);
      setEditingTextId(null);
      multiSelectedRef.current.clear();
      setMultiSelectCount(0);
      return;
    }
    if ((target as HTMLElement).dataset?.resizeHandle) return;

    if (!dragable.id) {
      dragable.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }

    const ms = multiSelectedRef.current;

    if (shiftKey) {
      // Shift+click: toggle this element in multi-selection
      if (ms.has(dragable.id)) {
        ms.delete(dragable.id);
      } else {
        ms.add(dragable.id);
      }
      // Also include current primary selection if it exists
      if (selectedElId && selectedElId !== dragable.id) {
        ms.add(selectedElId);
      }
      ms.add(dragable.id);
      setSelectedElId(dragable.id);
      setMultiSelectCount(ms.size);
      if (editorV2Enabled) {
        useEditorStore.getState().select(dragable.id, { additive: true });
      }
    } else if (!ms.has(dragable.id)) {
      // Normal click on element not in multi-selection: clear multi-select
      ms.clear();
      setSelectedElId(dragable.id);
      setMultiSelectCount(0);
      // V2: mirror to store so LayerPanel highlight follows canvas clicks.
      if (editorV2Enabled) useEditorStore.getState().select(dragable.id);
    } else {
      // Normal click on element already in multi-selection: keep group, set as primary
      setSelectedElId(dragable.id);
    }

    // Footer direct children are RELATIVE-FLOW by default. To make them freely
    // draggable like HEADER objects (absolute, can leave the footer region, stay
    // footer objects), PROMOTE this one to absolute on first drag — positioned
    // relative to the footer (which we turn into a positioning context so the
    // coords are footer-local, not page-local; the latter caused the old
    // "한참 아래로 순간이동" teleport). A `data-hns-footer-free` marker opts it
    // out of the relative-flow strip (stripFooterPinnedTop) + the
    // `#hns_footer > .dragable:not([data-hns-footer-free])` CSS so the absolute
    // position survives reload + publish. Un-dragged footer objects keep
    // flowing exactly as before. Once absolute, it falls through to the normal
    // drag path below.
    {
      const fEl = footerRef.current;
      const fpos = window.getComputedStyle(dragable).position;
      if (
        fEl &&
        dragable.parentElement === fEl &&
        fpos !== "absolute" &&
        fpos !== "fixed"
      ) {
        // Make the footer a positioning context so this object's offsetTop/Left
        // (captured by the flow path below) are FOOTER-local, and so a later
        // absolute pin resolves against the footer (not the whole page — the
        // old teleport). The actual promote-to-absolute + data-hns-footer-free
        // marker happens on the FIRST real move (handleMove), so a plain click
        // or double-click-to-edit-text leaves the object flowing as before.
        if (window.getComputedStyle(fEl).position === "static") {
          fEl.style.setProperty("position", "relative", "important");
        }
        // fall through — drag like a body flow child
      }
    }

    // DEVICE 3-MODE — In tablet/mobile mode, BODY layers commit their
    // per-device geometry to scene frames (tabletFrame / mobileFrame) via
    // store.setFrame. Header / menu / footer elements (incl. the logo) are
    // raw-injected and NOT part of the scene graph, so they instead persist
    // per-device geometry into the container's own `<style data-hns-device>`
    // @media block (see onEnd → hmf-device helpers). Both are allowed to drag
    // independently per device; the routing happens on mouseup.

    // Build drag data with all multi-selected elements' positions
    const computedStyle = window.getComputedStyle(dragable);

    // Sprint 9a/9f — FLOW-ELEMENT HANDLING.
    // A `.dragable` that isn't absolute/fixed-positioned is either:
    //   (a) A page section containing other dragables — moving it would
    //       rip the page layout. Abort drag.
    //   (b) An atomic flow child (button / image / text wrapper inside a
    //       section). Allow drag — we'll promote to absolute on mousemove
    //       with the correct starting offset so it doesn't visually jump.
    const pos = computedStyle.position;
    const isFlow = pos !== "absolute" && pos !== "fixed";
    const hasDragableChildren = dragable.querySelector(".dragable") !== null;
    if (isFlow && hasDragableChildren) {
      // Page section / group container — pixel drag would rip the
      // page layout. Instead, enter reorder mode: user drags the
      // section up/down to swap its order among siblings. A blue
      // insert-line gizmo follows the cursor; on mouseup we call
      // moveLayer to commit. Selection (set above) remains.
      startSectionReorder(dragable, clientX, clientY);
      return;
    }
    // Flow atomic child — ensure the nearest section ancestor is
    // `position: relative` so our absolute offset is interpreted within
    // the section, not the outer page. (No-op if already positioned.)
    if (isFlow) {
      let ancestor = dragable.parentElement;
      while (ancestor && !ancestor.classList.contains("dragable")) {
        ancestor = ancestor.parentElement;
      }
      if (ancestor) {
        const ancestorPos = window.getComputedStyle(ancestor).position;
        if (ancestorPos === "static") {
          ancestor.style.position = "relative";
        }
      }
    }

    const others: Array<{ el: HTMLElement; origLeft: number; origTop: number }> = [];
    if (ms.size > 0) {
      ms.forEach((id) => {
        if (id === dragable.id) return;
        const otherEl = document.getElementById(id);
        if (otherEl) {
          const cs = window.getComputedStyle(otherEl);
          others.push({
            el: otherEl,
            origLeft: parseInt(cs.left) || parseInt(otherEl.style.left) || 0,
            origTop: parseInt(cs.top) || parseInt(otherEl.style.top) || 0,
          });
        }
      });
    }

    // V2: cache sibling rects (in container-local coords) for snap.
    let snapSiblings: SnapRect[] | null = null;
    let snapContainer: HTMLElement | null = null;
    // Only snap body scene layers to their siblings — HMF elements live in a
    // separate raw-injected container and shouldn't snap to body geometry.
    if (editorV2Enabled && (bodyRef.current?.contains(dragable) ?? false)) {
      const host = bodyRef.current;
      if (host) {
        const hostRect = host.getBoundingClientRect();
        const movingIds = new Set<string>([dragable.id, ...others.map((o) => o.el.id)]);
        const sibs: SnapRect[] = [];
        host.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
          if (!el.id || movingIds.has(el.id)) return;
          const r = el.getBoundingClientRect();
          sibs.push({
            x: r.left - hostRect.left,
            y: r.top - hostRect.top,
            w: r.width,
            h: r.height,
          });
        });
        snapSiblings = sibs;
        snapContainer = host;
      }
    }

    // For flow atomic children, initial "origLeft/origTop" from computed
    // left/top is 0 (no inline position), which would make the element
    // jump to (0,0) relative to its positioned ancestor on first move.
    // Use offsetLeft/offsetTop instead — the element's current rendered
    // position within its offsetParent. On first mousemove, the store's
    // setFrame will promote the layer to absolute at these coordinates.
    let origLeft: number;
    let origTop: number;
    if (isFlow) {
      origLeft = dragable.offsetLeft;
      origTop = dragable.offsetTop;
      // Also pre-apply inline width/height so the element keeps its
      // current rendered size once it becomes absolute. Otherwise
      // `position: absolute` with only left/top would shrink it to
      // content size.
      if (!dragable.style.width) dragable.style.width = `${dragable.offsetWidth}px`;
      if (!dragable.style.height) dragable.style.height = `${dragable.offsetHeight}px`;
    } else {
      origLeft = parseInt(computedStyle.left) || parseInt(dragable.style.left) || 0;
      origTop = parseInt(computedStyle.top) || parseInt(dragable.style.top) || 0;
    }

    dragRef.current = {
      el: dragable,
      startX: clientX,
      startY: clientY,
      origLeft,
      origTop,
      others,
      snapSiblings,
      snapContainer,
      // Raw-injected HMF elements need their inline geometry written as
      // !important to beat boostImportant'd page CSS (see setGeom in handleMove).
      // Plugin elements (boardPlugin/productPlugin/…) keep their CSS-driven size
      // (excluded from geometry strip), so their inline drag/resize must also be
      // !important to overcome that retained CSS !important.
      importantPin: !!(
        headerRef.current?.contains(dragable) ||
        menuRef.current?.contains(dragable) ||
        footerRef.current?.contains(dragable) ||
        /\b[A-Za-z]+Plugin\b/.test(dragable.className)
      ),
    } as any;
  }

  /* ─── Make dragable elements interactive (mouse + touch) ─── */
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    function handleMouseDown(e: MouseEvent) {
      const t = e.target as HTMLElement;
      // If the click is inside a contenteditable element, let the browser
      // handle caret positioning — never start a drag during in-place edit.
      if (t.closest('[contenteditable="true"]')) return;
      if (t.closest(".dragable")) {
        e.preventDefault();
        // Don't stopPropagation — allow dblclick to bubble to canvasEl
      }
      startDragOnElement(t, e.clientX, e.clientY, e.shiftKey);
    }

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      const t = e.target as HTMLElement;
      if (t.closest('[contenteditable="true"]')) return;
      startDragOnElement(t, touch.clientX, touch.clientY);
      if (t.closest(".dragable")) {
        e.preventDefault();
      }
    }

    bodyEl.addEventListener("mousedown", handleMouseDown);
    bodyEl.addEventListener("touchstart", handleTouchStart, { passive: false });
    return () => {
      bodyEl.removeEventListener("mousedown", handleMouseDown);
      bodyEl.removeEventListener("touchstart", handleTouchStart);
    };
  }, []);

  /* ─── Block all link navigation inside the canvas ─── */
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    function blockLinks(e: Event) {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (anchor) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    canvasEl.addEventListener("click", blockLinks, true);
    canvasEl.addEventListener("auxclick", blockLinks, true);
    return () => {
      canvasEl.removeEventListener("click", blockLinks, true);
      canvasEl.removeEventListener("auxclick", blockLinks, true);
    };
  }, []);

  // Also attach to header and footer
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const headerEl = canvasEl.querySelector("#hns_header");
    const menuEl = canvasEl.querySelector("#hns_menu");
    const footerEl = canvasEl.querySelector("#hns_footer");

    function handleStructDown(e: Event) {
      const me = e as MouseEvent | TouchEvent;
      let clientX: number, clientY: number;
      let shiftKey = false;
      if ("touches" in me) {
        const touch = me.touches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = me.clientX;
        clientY = me.clientY;
        shiftKey = (me as MouseEvent).shiftKey;
      }
      const target = e.target as HTMLElement;
      if (!target.closest(".dragable")) return;
      me.preventDefault();
      startDragOnElement(target, clientX, clientY, shiftKey);
    }

    headerEl?.addEventListener("mousedown", handleStructDown);
    headerEl?.addEventListener("touchstart", handleStructDown, { passive: false });
    menuEl?.addEventListener("mousedown", handleStructDown);
    menuEl?.addEventListener("touchstart", handleStructDown, { passive: false });
    footerEl?.addEventListener("mousedown", handleStructDown);
    footerEl?.addEventListener("touchstart", handleStructDown, { passive: false });
    return () => {
      headerEl?.removeEventListener("mousedown", handleStructDown);
      headerEl?.removeEventListener("touchstart", handleStructDown);
      menuEl?.removeEventListener("mousedown", handleStructDown);
      menuEl?.removeEventListener("touchstart", handleStructDown);
      footerEl?.removeEventListener("mousedown", handleStructDown);
      footerEl?.removeEventListener("touchstart", handleStructDown);
    };
  }, []);

  /* ─── Mouse/Touch move/up for drag and resize ─── */
  useEffect(() => {
    // Goal 2: the header "drop zone" is the whole canvas band ABOVE #hns_body
    // (i.e. everything occupied by #hns_header + #hns_menu). We define it by
    // body-top rather than the header rect because legacy headers collapse to
    // ~0 height in the editor (their logo/nav are absolutely positioned), so
    // headerEl.getBoundingClientRect() is a thin sliver and almost never
    // catches the pointer. The band-above-body test is collapse-proof and also
    // covers the separate #hns_menu (nav) container.
    const overHeaderZone = (clientX: number, clientY: number): boolean => {
      const headerEl = headerRef.current;
      const bodyEl = bodyRef.current;
      if (!headerEl || !bodyEl) return false;
      const inner = document.getElementById("de-canvas-inner");
      const innerRect = (inner ?? headerEl).getBoundingClientRect();
      const bodyTop = bodyEl.getBoundingClientRect().top;
      return (
        clientX >= innerRect.left &&
        clientX <= innerRect.right &&
        clientY >= innerRect.top &&
        clientY < bodyTop
      );
    };
    // Footer mirror of overHeaderZone: the band BELOW the body, down to the
    // canvas bottom (collapse-proof — covers a short/0-height footer too).
    const overFooterZone = (clientX: number, clientY: number): boolean => {
      const footerEl = footerRef.current;
      const bodyEl = bodyRef.current;
      if (!footerEl || !bodyEl) return false;
      const inner = document.getElementById("de-canvas-inner");
      const innerRect = (inner ?? footerEl).getBoundingClientRect();
      const bodyBottom = bodyEl.getBoundingClientRect().bottom;
      return (
        clientX >= innerRect.left &&
        clientX <= innerRect.right &&
        clientY > bodyBottom &&
        clientY <= innerRect.bottom
      );
    };
    function handleMove(clientX: number, clientY: number) {
      // Block drag/resize while any modal is open
      if (document.querySelector(".de-modal-overlay, [data-tiptap-modal]")) return;
      lastPointerRef.current = { x: clientX, y: clientY };
      if (bodyResizeRef.current) {
        const scale = getCanvasScale();
        const dy = (clientY - bodyResizeRef.current.startY) / scale;
        // Manual drag floors at the RAW content bottom (no +80 buffer) so the
        // user can drag the body↔footer gap down to ~0. (The auto-fit default
        // still adds the 80px buffer when no manual height is set.)
        const next = Math.max(
          measureBodyContentHeight(0),
          bodyResizeRef.current.startHeight + dy,
        );
        applyBodyHeight(next, { manual: true, device: useEditorStore.getState().viewportMode });
        return;
      }
      // Goal 2: while dragging a BODY element, highlight the header zone as a
      // drop target when the pointer hovers over it. Dropping there relocates
      // the element into the site-wide header section (see onEnd).
      const headerEl = headerRef.current;
      if (headerEl && editorV2Enabled && dragRef.current && (dragRef.current as any).moved) {
        const fromBody = bodyRef.current?.contains(dragRef.current.el) ?? false;
        const over = fromBody && overHeaderZone(clientX, clientY);
        headerEl.classList.toggle("de-hmf-droptarget", over);
        menuRef.current?.classList.toggle("de-hmf-droptarget", over);
        // Footer is a symmetric drop target — highlight it when hovered.
        const overFooter = fromBody && overFooterZone(clientX, clientY);
        footerRef.current?.classList.toggle("de-hmf-droptarget", overFooter);
        // Float the dragged body element above the header/menu (z-index 100/200)
        // so it stays VISIBLE while crossing into the header band — otherwise it
        // slides behind the opaque header and the user thinks the drag failed.
        // The raised z-index is temporary; onEnd restores/clears it before
        // committing geometry so it never leaks into the saved HTML.
        if (fromBody) {
          const dragAny = dragRef.current as any;
          if (dragAny.tempZRaised !== true) {
            dragAny.origZIndex = dragRef.current.el.style.zIndex;
            dragRef.current.el.style.setProperty("z-index", "99999", "important");
            dragAny.tempZRaised = true;
          }
        }
      }
      const scale = getCanvasScale();
      // Write a geometry prop as `!important` when the element is raw-injected
      // HMF. WHY: the editor boosts page CSS position/size props to !important
      // (boostImportant), so a plain inline `left` written by drag/resize loses
      // to a boosted `#id{left:..!important}` rule and the element won't move.
      // Body scene layers avoid this via frameImportant; HMF elements have no
      // such path, so we pin their drag/resize output as important directly.
      const setGeom = (el: HTMLElement, prop: string, value: string, important: boolean) => {
        if (important) el.style.setProperty(prop, value, "important");
        else el.style.setProperty(prop, value);
      };
      if (dragRef.current) {
        const { el, startX, startY, origLeft, origTop, others } = dragRef.current;
        const dragAny = dragRef.current as any;
        const imp = !!dragAny.importantPin;
        let dx = (clientX - startX) / scale;
        let dy = (clientY - startY) / scale;
        // Flag "actually moved" so click-without-drag doesn't commit
        // a spurious setFrame on mouseup. 2px threshold absorbs pointer
        // jitter on trackpads.
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragAny.moved = true;
        if (!dragAny.moved) return;
        // FOOTER FREE-DRAG: a footer direct child flows by default. On the FIRST
        // real move, promote it to absolute and mark it (data-hns-footer-free) so
        // it drags freely like a header object and keeps its position on
        // reload/publish (the marker opts it out of stripFooterPinnedTop + the
        // relative-flow CSS). origLeft/origTop were captured footer-local at drag
        // start (footer is now position:relative), so it doesn't jump.
        if (
          footerRef.current?.contains(el) &&
          el.parentElement === footerRef.current &&
          !el.hasAttribute("data-hns-footer-free")
        ) {
          const cs = window.getComputedStyle(el);
          if (cs.position !== "absolute" && cs.position !== "fixed") {
            if (!el.style.width) el.style.setProperty("width", `${el.offsetWidth}px`, "important");
            if (!el.style.height) el.style.setProperty("height", `${el.offsetHeight}px`, "important");
            el.style.setProperty("position", "absolute", "important");
            el.setAttribute("data-hns-footer-free", "1");
          }
        }
        // V2 snap (disabled with Alt). Applies a single nudge to dx/dy so
        // the whole group drags together and keeps relative offsets.
        if (dragAny.snapSiblings && dragAny.snapContainer && !(window as any).__hnsAltDown) {
          const liveX = origLeft + dx;
          const liveY = origTop + dy;
          const liveW = el.offsetWidth;
          const liveH = el.offsetHeight;
          const snapped = snapRect(
            { x: liveX, y: liveY, w: liveW, h: liveH },
            dragAny.snapSiblings,
            6,
          );
          dx += snapped.x - liveX;
          dy += snapped.y - liveY;
        }
        setGeom(el, "left", (origLeft + dx) + "px", imp);
        setGeom(el, "top", (origTop + dy) + "px", imp);
        if (bodyRef.current?.contains(el)) scheduleBodyHeightSync();
        // Move all other multi-selected elements by the same delta
        others.forEach((o) => {
          setGeom(o.el, "left", (o.origLeft + dx) + "px", imp);
          setGeom(o.el, "top", (o.origTop + dy) + "px", imp);
        });
        if (others.some((o) => bodyRef.current?.contains(o.el))) scheduleBodyHeightSync();
      }
      if (resizeRef.current) {
        const r = resizeRef.current;
        const rimp = !!(r as any).importantPin;
        const dx = (clientX - r.startX) / scale;
        const dy = (clientY - r.startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) (r as any).moved = true;
        if (!(r as any).moved) return;
        if (r.handle.includes("e")) setGeom(r.el, "width", Math.max(30, r.origWidth + dx) + "px", rimp);
        if (r.handle.includes("w")) {
          setGeom(r.el, "width", Math.max(30, r.origWidth - dx) + "px", rimp);
          setGeom(r.el, "left", (r.origLeft + dx) + "px", rimp);
        }
        if (r.handle.includes("s")) setGeom(r.el, "height", Math.max(20, r.origHeight + dy) + "px", rimp);
        if (r.handle.includes("n")) {
          setGeom(r.el, "height", Math.max(20, r.origHeight - dy) + "px", rimp);
          setGeom(r.el, "top", (r.origTop + dy) + "px", rimp);
        }
        // Image-anchor boxes (logo, menu-bar image, …): a global rule pins the
        // inner <img> to `max-width:100%; height:auto` (responsive), so the
        // box's HEIGHT change has NO effect on the image — only width "works".
        // Make the image FILL the box so both dimensions of the resize apply:
        //  • width/height:100% (inline !important beats the #hns_h_logo
        //    height:auto rule and the `.dragable img` responsive rule);
        //  • object-fit opts the img out of the `img:not([style*="object-fit"])`
        //    responsive selectors. Preserve an existing object-fit if set.
        const rimg = r.el.querySelector("img");
        if (rimg instanceof HTMLImageElement) {
          rimg.style.setProperty("width", "100%", "important");
          rimg.style.setProperty("height", "100%", "important");
          if (!rimg.style.objectFit) {
            rimg.style.setProperty("object-fit", "fill", "important");
          }
        }
        if (bodyRef.current?.contains(r.el)) scheduleBodyHeightSync();
      }
    }

    function onMouseMove(e: MouseEvent) { handleMove(e.clientX, e.clientY); }
    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current && !resizeRef.current && !bodyResizeRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX, touch.clientY);
    }
    function onEnd() {
      if (bodyResizeRef.current) {
        const device = useEditorStore.getState().viewportMode;
        syncBodyHeight({ manualHeight: bodyManualMinHeightRef.current[device], device });
        bodyResizeRef.current = null;
      }
      // V2: commit the final DOM position/size back to the scene so
      // LayerPanel / overlay / undo stack reflect the legacy drag-resize.
      // Only if the gesture ACTUALLY moved — a plain click leaves the
      // element where it was (and may not have inline left/top at all,
      // which would otherwise collapse the element to 0,0).
      if (editorV2Enabled) {
        const store = useEditorStore.getState();
        const dv = store.viewportMode as HmfViewport;

        // ─── Goal 2: cross-container drop (body element → header section) ───
        // If a body-scene element was dragged and released over the header
        // zone, physically relocate it into the header container and re-home
        // it into the header scene (persisted site-wide), removing it from the
        // body scene. Only the desktop (PC base) layout owns the header HTML,
        // so restrict the relocation to the desktop viewport.
        const headerEl = headerRef.current;
        if (headerEl) headerEl.classList.remove("de-hmf-droptarget");
        menuRef.current?.classList.remove("de-hmf-droptarget");
        footerRef.current?.classList.remove("de-hmf-droptarget");
        // Undo the temporary raised z-index applied during the drag (handleMove)
        // so it never persists into the element's inline style / saved HTML.
        if (dragRef.current && (dragRef.current as any).tempZRaised) {
          const dEl = dragRef.current.el;
          const oz = (dragRef.current as any).origZIndex;
          if (oz) dEl.style.zIndex = oz;
          else dEl.style.removeProperty("z-index");
          (dragRef.current as any).tempZRaised = false;
        }
        if (
          headerEl &&
          dv === "desktop" &&
          dragRef.current &&
          (dragRef.current as any).moved &&
          (bodyRef.current?.contains(dragRef.current.el) ?? false)
        ) {
          const dragEl = dragRef.current.el;
          const px = lastPointerRef.current.x;
          const py = lastPointerRef.current.y;
          const overHeader = overHeaderZone(px, py);
          // id-less body objects (generated scene id never reached the DOM)
          // must still be relocatable — stamp a stable id before the move so
          // the rebuilt header scene + selection reference the same node.
          if (overHeader && !dragEl.id) {
            dragEl.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          }
          if (overHeader && dragEl.id) {
            // Destination container: prefer the inner header content wrapper so
            // the element sits where authored header objects live.
            let dest: HTMLElement =
              (headerEl.querySelector("#hns_header_content") as HTMLElement | null) ||
              headerEl;
            // legacyHmfToScene's collect() pushes the FIRST .dragable ancestor and
            // never recurses into it. In some templates #hns_header_content IS itself
            // the single header .dragable ("박스 1"), or lives inside one — appending
            // there would nest the moved object so it never surfaces as a top-level
            // 헤더 섹션 object. Append as a SIBLING of the outermost dragable instead.
            const dragableAncestor = dest.closest<HTMLElement>(".dragable");
            if (dragableAncestor?.parentElement) {
              dest = dragableAncestor.parentElement;
            }
            // Compute header-local coordinates from the element's CURRENT
            // rendered rect (where the user dragged it), before the DOM move.
            const scale = getCanvasScale();
            const destRect = dest.getBoundingClientRect();
            const elRect = dragEl.getBoundingClientRect();
            const newLeft = (elRect.left - destRect.left) / scale;
            const newTop = (elRect.top - destRect.top) / scale;
            const w = dragEl.offsetWidth;
            const h = dragEl.offsetHeight;
            // Drop selection state tied to body before re-homing.
            multiSelectedRef.current.clear();
            // Move the DOM node into the header container.
            dest.appendChild(dragEl);
            // Native header objects are `.dragable`; `legacyHmfToScene` only
            // collects `.dragable` top-level children. A relocated body inline
            // (el_*) / non-dragable layer would otherwise enter the header DOM
            // but never surface in the 헤더 섹션 list (and hide behind the nav).
            dragEl.classList.add("dragable");
            // Header objects must beat boosted page CSS → pin geometry as
            // !important (same contract as live HMF drag, see setGeom).
            dragEl.style.setProperty("position", "absolute", "important");
            dragEl.style.setProperty("left", `${newLeft}px`, "important");
            dragEl.style.setProperty("top", `${newTop}px`, "important");
            dragEl.style.setProperty("width", `${w}px`, "important");
            dragEl.style.setProperty("height", `${h}px`, "important");
            // Remove from the body scene (page-local) …
            store.remove(dragEl.id);
            // … and rebuild the header scene from the live header DOM so the
            // relocated element appears under the "헤더 섹션" group. Re-stamp
            // ids for any unnamed children, then mark the header dirty so the
            // site-wide save fires.
            let n = 0;
            headerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
              if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
            });
            const hStore = useEditorStore.getState();
            hStore.setHeaderScene(legacyHmfToScene(headerEl.innerHTML));
            hStore.markHeaderDirty();
            // Reselect the element in its new home.
            hStore.select(dragEl.id);
            setSelectedElId(dragEl.id);
            dragRef.current = null;
            resizeRef.current = null;
            return;
          }
          // ─── Symmetric footer drop (body element → footer section) ───
          const footerEl = footerRef.current;
          const overFooter = overFooterZone(px, py);
          if (footerEl && overFooter && !dragEl.id) {
            dragEl.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
          }
          if (footerEl && overFooter && dragEl.id) {
            let dest: HTMLElement =
              (footerEl.querySelector("#hns_footer_content") as HTMLElement | null) ||
              footerEl;
            // Same nesting guard as the header: append as a SIBLING of the
            // outermost footer .dragable so legacyHmfToScene.collect() surfaces
            // the moved object as a top-level "푸터 섹션" item.
            const dragableAncestor = dest.closest<HTMLElement>(".dragable");
            if (dragableAncestor?.parentElement) {
              dest = dragableAncestor.parentElement;
            }
            const scale = getCanvasScale();
            const destRect = dest.getBoundingClientRect();
            const elRect = dragEl.getBoundingClientRect();
            const newLeft = (elRect.left - destRect.left) / scale;
            const w = dragEl.offsetWidth;
            const h = dragEl.offsetHeight;
            multiSelectedRef.current.clear();
            dest.appendChild(dragEl);
            dragEl.classList.add("dragable");
            // Footer objects flow after the body (relative), not absolutely
            // pinned — keep left as a relative offset + size, drop top so the
            // object stacks below existing footer content (matches the header's
            // counterpart being absolute, but footer is flow per design).
            dragEl.style.setProperty("position", "relative", "important");
            dragEl.style.removeProperty("top");
            dragEl.style.setProperty("left", `${newLeft}px`, "important");
            dragEl.style.setProperty("width", `${w}px`, "important");
            dragEl.style.setProperty("height", `${h}px`, "important");
            store.remove(dragEl.id);
            let n = 0;
            footerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
              if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
            });
            const fStore = useEditorStore.getState();
            fStore.setFooterScene(legacyHmfToScene(footerEl.innerHTML));
            fStore.markFooterDirty();
            fStore.select(dragEl.id);
            setSelectedElId(dragEl.id);
            dragRef.current = null;
            resizeRef.current = null;
            return;
          }
        }

        // Which raw-injected HMF container (if any) owns this element? Body
        // scene layers return null and take the store.setFrame path.
        const hmfContainerOf = (el: HTMLElement): HTMLElement | null => {
          if (headerRef.current?.contains(el)) return headerRef.current;
          if (menuRef.current?.contains(el)) return menuRef.current;
          if (footerRef.current?.contains(el)) return footerRef.current;
          return null;
        };
        // Commit one element's final DOM geometry to the right place:
        //   • HMF + device  → per-device @media block (hmf-device helpers)
        //   • HMF + desktop → refresh PC base snapshot (inline persists via
        //                     innerHTML on save)
        //   • body layer    → scene frame (store.setFrame, device-aware)
        const commit = (el: HTMLElement, withSize: boolean) => {
          const container = hmfContainerOf(el);
          if (container) {
            if (dv === "desktop") {
              // Editing the PC base. Keep the base snapshot in sync so future
              // tablet/mobile cascades resolve against the new PC geometry.
              if (el.id && hmfDeviceFramesRef.current[el.id]) {
                hmfBaseFramesRef.current[el.id] = {
                  left: el.style.left || undefined,
                  top: el.style.top || undefined,
                  width: el.style.width || undefined,
                  height: el.style.height || undefined,
                };
              }
              // If this is a HEADER or FOOTER object tracked in its scene,
              // mirror the final geometry into the scene frame so the
              // LayerPanel / Inspector position stay in sync. store.setFrame
              // routes to the header/footer scene + dirty bit via mutateOwning,
              // and no-ops if the id isn't in any scene (e.g. V2 off / menu
              // object). The live inline geometry the drag wrote stays
              // authoritative for the DOM — the HMF sync never writes it back.
              if (el.id && (container === headerRef.current || container === footerRef.current)) {
                const hx = parseInt(el.style.left) || 0;
                const hy = parseInt(el.style.top) || 0;
                if (withSize) {
                  store.setFrame(el.id, { x: hx, y: hy, w: el.offsetWidth, h: el.offsetHeight });
                } else {
                  store.setFrame(el.id, { x: hx, y: hy });
                }
              }
              return;
            }
            const box = {
              left: el.style.left || undefined,
              top: el.style.top || undefined,
              ...(withSize && {
                width: el.style.width || undefined,
                height: el.style.height || undefined,
              }),
            };
            recordHmfDeviceFrame(el, hmfDeviceFramesRef.current, dv, box);
            writeHmfDeviceStyle(container, hmfDeviceFramesRef.current);
            return;
          }
          if (!el.id) return;
          const x = parseInt(el.style.left) || 0;
          const y = parseInt(el.style.top) || 0;
          if (withSize) {
            store.setFrame(el.id, { x, y, w: el.offsetWidth, h: el.offsetHeight });
          } else {
            store.setFrame(el.id, { x, y });
          }
        };
        if (dragRef.current && (dragRef.current as any).moved) {
          const els: HTMLElement[] = [dragRef.current.el, ...dragRef.current.others.map((o: any) => o.el)];
          for (const el of els) commit(el, false);
        }
        if (resizeRef.current && (resizeRef.current as any).moved) {
          commit(resizeRef.current.el, true);
        }
      }
      dragRef.current = null;
      resizeRef.current = null;
      bodyResizeRef.current = null;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  /* ─── Selection highlight and resize handles ─── */
  useEffect(() => {
    // Remove old selection
    document.querySelectorAll(".de-selected").forEach((el) => {
      el.classList.remove("de-selected");
    });
    document.querySelectorAll(".de-resize-handle").forEach((el) => el.remove());

    // Highlight all multi-selected elements
    const ms = multiSelectedRef.current;
    ms.forEach((id) => {
      const msEl = document.getElementById(id);
      if (msEl) msEl.classList.add("de-selected");
    });

    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el) return;

    el.classList.add("de-selected");

    // When V2 is enabled, CanvasOverlay renders resize handles as fixed-position
    // gizmos that track the element via getBoundingClientRect() — scale-aware
    // and always positioned outside the scaled canvas transform. Adding the
    // legacy .de-resize-handle divs (position:absolute inside the element)
    // on top of those creates two overlapping handle sets.
    // Exception: HMF elements (header/menu/footer) are NOT inside bodyRef, so
    // CanvasOverlay skips them (line 136 guard) → they still need legacy handles.
    const inBody = !!bodyRef.current?.contains(el);
    if (editorV2Enabled && inBody) {
      // .de-selected outline stays; CanvasOverlay provides the resize handles.
      return;
    }

    // Sprint 9a — FLOW-ELEMENT GUARD (resize side).
    // Don't render resize handles on flow-positioned sections; resizing
    // them via inline width/height would fight the template's responsive
    // CSS and look broken. Selection still works so the LayerPanel can
    // display/rename/visibility-toggle the section.
    // EXCEPTION: plugin elements (boardPlugin hero/grid/…) and raw-injected
    // HMF objects are explicit, freely-sized objects the user expects to
    // resize even if the template positions them in flow — they carry an
    // importantPin so their inline width/height beats the page CSS cleanly.
    {
      const pos = window.getComputedStyle(el).position;
      const isPinEligible =
        /\b[A-Za-z]+Plugin\b/.test(el.className) ||
        !!headerRef.current?.contains(el) ||
        !!menuRef.current?.contains(el) ||
        !!footerRef.current?.contains(el);
      if (pos !== "absolute" && pos !== "fixed" && !isPinEligible) return;
    }

    // Add resize handles only to primary selection (not multi-selected others)
    const handles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
    handles.forEach((h) => {
      const handle = document.createElement("div");
      handle.className = `de-resize-handle de-handle-${h}`;
      handle.dataset.resizeHandle = "true";

      function startResize(clientX: number, clientY: number) {
        if (!el) return;
        const computedStyle = window.getComputedStyle(el);
        resizeRef.current = {
          el,
          handle: h,
          startX: clientX,
          startY: clientY,
          origLeft: parseInt(computedStyle.left) || parseInt(el.style.left) || 0,
          origTop: parseInt(computedStyle.top) || parseInt(el.style.top) || 0,
          origWidth: el.offsetWidth,
          origHeight: el.offsetHeight,
          // Raw-injected HMF elements: write geometry as !important to beat
          // boostImportant'd page CSS (mirrors drag path in handleMove).
          // Plugin elements keep their CSS size (excluded from geometry strip),
          // so their inline resize must also be !important to overcome it.
          importantPin: !!(
            headerRef.current?.contains(el) ||
            menuRef.current?.contains(el) ||
            footerRef.current?.contains(el) ||
            /\b[A-Za-z]+Plugin\b/.test(el.className)
          ),
        };
      }

      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startResize(e.clientX, e.clientY);
      });
      handle.addEventListener("touchstart", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const touch = e.touches[0];
        if (touch) startResize(touch.clientX, touch.clientY);
      }, { passive: false });
      el.appendChild(handle);
    });

    return () => {
      el?.querySelectorAll(".de-resize-handle").forEach((h) => h.remove());
    };
  }, [selectedElId, multiSelectCount, editorV2Enabled]);

  /* ─── Double-click / Double-tap text editing ─── */
  const lastTapRef = useRef<{ time: number; id: string }>({ time: 0, id: "" });

  // Text-level tags: edit only the innermost text element, not its parent container
  const TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "SPAN", "A", "LI", "TD", "TH", "LABEL", "BLOCKQUOTE"]);

  // Tags that are leaf-text (no structural children expected)
  const LEAF_TEXT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6", "P", "LI", "TD", "TH", "LABEL", "BLOCKQUOTE"]);

  /**
   * Check if a .dragable element is a simple "legacy" layer
   * (contains only text/inline content, no nested structural elements).
   * Legacy dragables have absolute positioning + simple text.
   * Custom template dragables wrap entire sections with complex HTML.
   */
  function isSimpleDragable(el: HTMLElement): boolean {
    // Sections with promoted inline children (id=el_*) must never be
    // edited as a single blob — each inline is its own selectable layer.
    if (el.querySelector('[id^="el_"]')) return false;
    // If it has no child elements at all (text-only), it's simple
    if (el.children.length === 0) return true;
    // If it has only inline children (span, a, strong, em, br, img), it's simple
    // Block-level children (h1-h6, p, div, etc.) mean each block should be edited individually
    // Exclude .de-resize-handle divs (editor UI, not content)
    const structural = el.querySelectorAll("div:not(.de-resize-handle), section, article, aside, main, ul, ol, table, form, header, nav, footer, h1, h2, h3, h4, h5, h6, p");
    return structural.length === 0;
  }

  /**
   * Find the best edit target for a double-click.
   * Priority: innermost leaf-text element > simple dragable > skip
   */
  function findEditTarget(target: HTMLElement): HTMLElement | null {
    const body = document.getElementById("hns_body");
    const header = document.getElementById("hns_header");
    const footer = document.getElementById("hns_footer");
    // Allow editing inside header / footer as well as body. The dblclick
    // handler can route any text-leaf inside the canvas into in-place
    // editing — restricting to body only meant header text (logo
    // wordmark, contact info, nav labels) had no edit path on canvas.
    const inEditable =
      (body && body.contains(target)) ||
      (header && header.contains(target)) ||
      (footer && footer.contains(target));
    if (!inEditable) return null;
    // Reuse `body` reference name below for the loop guard so we don't
    // bail out at the header's parent.
    const editableRoot =
      body && body.contains(target)
        ? body
        : header && header.contains(target)
          ? header
          : footer!;

    // Walk up from target to find the innermost leaf-text element
    let el: HTMLElement | null = target;
    let leafText: HTMLElement | null = null;
    while (el && el !== editableRoot) {
      if (LEAF_TEXT_TAGS.has(el.tagName)) {
        leafText = el;
        break;  // Found innermost leaf-text, use it
      }
      // SPAN with no structural children and has meaningful text
      if (el.tagName === "SPAN" && el.children.length === 0 && el.textContent?.trim()) {
        leafText = el;
        break;
      }
      el = el.parentElement;
    }
    // If we found an inline leaf (SPAN, A), check if parent dragable is simple
    // — if so, edit the whole dragable so surrounding text is included
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (leafText) {
      const isBlock = LEAF_TEXT_TAGS.has(leafText.tagName); // h1-h6, p, li, etc.
      if (isBlock) return leafText;
      // Inline leaf (SPAN, A) — prefer whole dragable if it's simple
      if (dragable && editableRoot.contains(dragable) && isSimpleDragable(dragable)) {
        return dragable;
      }
      return leafText;
    }

    // Try .dragable — but only if it's a simple one (legacy absolute positioned)
    if (dragable && editableRoot.contains(dragable) && isSimpleDragable(dragable)) {
      return dragable;
    }

    // For complex dragables (custom template section wrappers),
    // find the nearest text element the user likely intended to edit
    if (dragable && editableRoot.contains(dragable)) {
      // Walk up from click target
      el = target;
      while (el && el !== dragable) {
        if (TEXT_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
      // If clicked on dragable itself (empty space), find first text child
      const firstText = dragable.querySelector("h1, h2, h3, h4, h5, h6, p, span, li, td, th, label, blockquote");
      if (firstText) return firstText as HTMLElement;

      // Atomized text dragables wrap visible content in a styled <div>
      // (e.g., <div class="dragable sol-replacible-text"><div class="big">94%</div></div>).
      // The content has no LEAF_TEXT / SPAN / A tag so the loops above all
      // miss it. Fall back to editing the whole dragable when:
      //   - it's marked .sol-replacible-text (designed to be editable), OR
      //   - it has direct text content but no nested .dragable children
      //     (so we won't accidentally swallow a nested editable group).
      const hasNestedDragable = dragable.querySelector(".dragable");
      if (
        (dragable.classList.contains("sol-replacible-text") || dragable.textContent?.trim()) &&
        !hasNestedDragable
      ) {
        return dragable;
      }
    }

    // Header / footer don't use `.dragable` wrappers — they have plain
    // HTML (template-baked nav, brand text, contact info). When the
    // editable root is header/footer and we already located a leafText
    // (LEAF_TEXT_TAGS or SPAN), allow editing it directly. For body, we
    // still require a `.dragable` parent so we don't accidentally edit
    // structural-only blocks like grid wrappers.
    const isBody = body !== null && editableRoot === body;
    if (!isBody && leafText) {
      return leafText;
    }
    if (!isBody) {
      // Walk up from target to nearest TEXT_TAGS — last-chance for
      // header/footer clicks that landed on a wrapper.
      el = target;
      while (el && el !== editableRoot) {
        if (TEXT_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
    }

    return null;
  }

  function enterTextEdit(editEl: HTMLElement, clientX?: number, clientY?: number) {
    // Cancel any in-progress drag
    dragRef.current = null;
    resizeRef.current = null;

    if (!editEl.id) {
      editEl.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }
    setSelectedElId(editEl.id);

    // In-place edit: enable contenteditable on the element itself so the user
    // can type directly on the canvas (Claude-design style). The right-side
    // Inspector handles font/size/color/etc. — no separate modal.
    editEl.setAttribute("contenteditable", "true");
    editEl.setAttribute("spellcheck", "false");
    editEl.classList.add("de-text-editing");
    setEditingTextId(editEl.id);

    // Defer focus + caret placement to next tick so the contenteditable
    // attribute has settled before we try to position the cursor.
    setTimeout(() => {
      try {
        editEl.focus({ preventScroll: true });
      } catch {
        editEl.focus();
      }
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      // Place cursor at the click position when available, else at end of content.
      let placed = false;
      if (clientX != null && clientY != null) {
        const docAny = document as Document & {
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        };
        let r: Range | null = null;
        if (typeof docAny.caretRangeFromPoint === "function") {
          r = docAny.caretRangeFromPoint(clientX, clientY);
        } else if (typeof docAny.caretPositionFromPoint === "function") {
          const pos = docAny.caretPositionFromPoint(clientX, clientY);
          if (pos) {
            r = document.createRange();
            r.setStart(pos.offsetNode, pos.offset);
            r.collapse(true);
          }
        }
        if (r && editEl.contains(r.startContainer)) {
          sel.addRange(r);
          placed = true;
        }
      }
      if (!placed) {
        const r = document.createRange();
        r.selectNodeContents(editEl);
        r.collapse(false);
        sel.addRange(r);
      }
    }, 0);
  }

  // Exit in-place text editing for the given element id (or the currently
  // editing one). Strips contenteditable and clears the editing state.
  function exitTextEdit(elId?: string) {
    const id = elId ?? editingTextId;
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
      el.classList.remove("de-text-editing");
      // Drop the browser selection so the next click doesn't keep a caret
      // visible inside the element.
      const sel = window.getSelection();
      if (sel && el.contains(sel.anchorNode)) sel.removeAllRanges();
    }
    setEditingTextId(null);
  }

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    // Desktop: dblclick
    function handleDblClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const editEl = findEditTarget(target);
      if (!editEl) return;
      e.preventDefault();
      e.stopPropagation();
      enterTextEdit(editEl, e.clientX, e.clientY);
    }

    // Mobile: detect double-tap (two taps within 400ms on same element)
    function handleTapForEdit(e: TouchEvent) {
      const target = e.target as HTMLElement;
      const editEl = findEditTarget(target);
      if (!editEl) return;

      if (!editEl.id) {
        editEl.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      }
      const elId = editEl.id;
      const now = Date.now();
      const last = lastTapRef.current;

      if (elId && elId === last.id && now - last.time < 400) {
        // Double-tap detected
        e.preventDefault();
        const t = e.changedTouches[0];
        enterTextEdit(editEl, t?.clientX, t?.clientY);
        lastTapRef.current = { time: 0, id: "" };
      } else {
        lastTapRef.current = { time: now, id: elId };
      }
    }

    canvasEl.addEventListener("dblclick", handleDblClick);
    canvasEl.addEventListener("touchend", handleTapForEdit, { passive: false });
    return () => {
      canvasEl.removeEventListener("dblclick", handleDblClick);
      canvasEl.removeEventListener("touchend", handleTapForEdit);
    };
  }, []);

  // While in-place text edit is active, listen for Escape (commit + exit)
  // and outside clicks (commit + exit). Clicks inside the InspectorPanel
  // (font / size / color tweaks) must NOT exit, so the user can adjust
  // formatting while still typing.
  useEffect(() => {
    if (!editingTextId) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        exitTextEdit();
      }
    }
    function onMouseDown(e: MouseEvent) {
      const id = editingTextId;
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) {
        exitTextEdit();
        return;
      }
      const tgt = e.target as Node | null;
      if (!tgt) return;
      if (el.contains(tgt)) return;            // click inside the editing element
      const t = tgt as HTMLElement;
      if (t.closest && t.closest(".inspector-rail")) return;  // tweaking inspector
      if (t.closest && t.closest("[data-tiptap-modal]")) return; // (legacy modal, kept inert)
      exitTextEdit();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [editingTextId]);

  // TipTap modal save handler — directly modify DOM element (no React state sync needed)
  const handleTiptapSave = useCallback((html: string) => {
    const el = tiptapElRef.current;
    if (el) {
      // For text-level elements (h1-h6, p, span, a, li, etc.), TipTap wraps output in <p> tags.
      // Strip the outer <p> wrapper to preserve the original element's tag.
      if (TEXT_TAGS.has(el.tagName) || el.tagName === "LI") {
        // If TipTap returned a single <p>...</p>, extract just the inner content
        const stripped = html.replace(/^<p>([\s\S]*?)<\/p>$/, "$1").trim();
        el.innerHTML = stripped || html;
      } else {
        el.innerHTML = html;
      }
    }
    tiptapElRef.current = null;
    setTiptapTarget(null);
  }, []);

  /* ─── Property panel helpers ─── */
  function getSelectedElProps() {
    if (!selectedElId) return null;
    const el = document.getElementById(selectedElId);
    if (!el) return null;
    const cs = window.getComputedStyle(el);
    return {
      x: parseInt(cs.left) || parseInt(el.style.left) || 0,
      y: parseInt(cs.top) || parseInt(el.style.top) || 0,
      w: el.offsetWidth,
      h: el.offsetHeight,
      z: parseInt(cs.zIndex) || 0,
    };
  }

  function handlePropertyChange(field: string, value: string) {
    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el) return;
    const numVal = parseInt(value);
    if (isNaN(numVal)) return;
    switch (field) {
      case "x": el.style.left = numVal + "px"; break;
      case "y": el.style.top = numVal + "px"; break;
      case "w": el.style.width = numVal + "px"; break;
      case "h": el.style.height = numVal + "px"; break;
      case "z": el.style.zIndex = String(numVal); break;
    }
    // Force re-render of position panel
    setSelectedElId((prev) => prev);
  }

  function changeZIndex(direction: "up" | "down" | "top" | "bottom") {
    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el) return;
    const currentZ = parseInt(el.style.zIndex) || parseInt(window.getComputedStyle(el).zIndex) || 0;
    switch (direction) {
      case "up": el.style.zIndex = String(currentZ + 1); break;
      case "down": el.style.zIndex = String(Math.max(0, currentZ - 1)); break;
      case "top": el.style.zIndex = "999"; break;
      case "bottom": el.style.zIndex = "0"; break;
    }
  }

  function cloneSelected() {
    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el || !el.parentElement) return;
    const clone = el.cloneNode(true) as HTMLElement;
    clone.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const left = parseInt(el.style.left) || parseInt(window.getComputedStyle(el).left) || 0;
    const top = parseInt(el.style.top) || parseInt(window.getComputedStyle(el).top) || 0;
    clone.style.left = (left + 30) + "px";
    clone.style.top = (top + 30) + "px";
    clone.classList.remove("de-selected");
    clone.querySelectorAll(".de-resize-handle").forEach((h) => h.remove());
    el.parentElement.appendChild(clone);
    setSelectedElId(clone.id);
  }

  function deleteSelected() {
    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (el) el.remove();
    setSelectedElId(null);
  }

  /* ─── Alignment helpers ─── */
  function alignSelected(align: "center-h" | "left" | "right") {
    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el) return;

    const pos = window.getComputedStyle(el).position;

    if (align === "center-h") {
      if (pos === "absolute") {
        // Absolute: center via left = (parent.width - el.width) / 2
        const parent = el.parentElement;
        if (parent) {
          const pw = parent.offsetWidth;
          const ew = el.offsetWidth;
          el.style.left = Math.round((pw - ew) / 2) + "px";
        }
      } else {
        // Relative/static: use margin auto, remove left offset
        el.style.removeProperty("left");
        el.style.margin = "0 auto";
      }
    } else if (align === "left") {
      if (pos === "absolute") {
        el.style.left = "0px";
      } else {
        el.style.removeProperty("left");
        el.style.removeProperty("margin");
      }
    } else if (align === "right") {
      if (pos === "absolute") {
        const parent = el.parentElement;
        if (parent) {
          const pw = parent.offsetWidth;
          const ew = el.offsetWidth;
          el.style.left = (pw - ew) + "px";
        }
      } else {
        el.style.removeProperty("left");
        el.style.margin = "0 0 0 auto";
      }
    }

    // Force re-render
    setSelectedElId((prev) => prev);
  }

  /* ─── Add new element ─── */
  /**
   * Sprint 9k — insert a prebuilt multi-element section preset from the
   * LeftPalette's "섹션 블록" list. The preset HTML follows atomic layering
   * rules so the scene parser types every sub-element correctly.
   *
   * We append the fragment to the end of #hns_body, then refresh the scene
   * graph so the new layers appear in the LayerPanel immediately. The
   * editor is marked dirty so the save pipeline knows to persist.
   */
  function insertSectionPreset(presetId: string, afterId: string | null = null) {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const preset = SECTION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const tpl = document.createElement("div");
    tpl.innerHTML = preset.build();
    // Resolve anchor: when afterId is provided we insert AFTER that sibling
    // (via element.after()); otherwise append at the end of bodyEl.
    const anchor = afterId ? bodyEl.querySelector<HTMLElement>(`#${CSS.escape(afterId)}`) : null;
    const frag = document.createDocumentFragment();
    while (tpl.firstChild) frag.appendChild(tpl.firstChild);
    if (anchor) anchor.after(frag);
    else bodyEl.appendChild(frag);
    setCurrentBodyHtml(bodyEl.innerHTML);
    if (editorV2Enabled) {
      useEditorStore.getState().importHtml(bodyEl.innerHTML, currentPageCss);
    }
  }

  /**
   * Find the nearest element that can host a flow-mode child:
   *   - If `fromId` itself is a section / group container, use it
   *   - Else walk up to the nearest ancestor `.dragable` that contains
   *     other `.dragable`s (i.e., a section / group, not a leaf)
   *   - If no selection or no matching ancestor, pick the container
   *     whose viewport rect is closest to the canvas center.
   * Returns null only when bodyEl has zero `.dragable` containers
   * (truly empty page) — caller falls back to bodyEl in that case.
   */
  function findResponsiveDropTarget(fromId: string | null): HTMLElement | null {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return null;

    const isContainer = (e: HTMLElement): boolean =>
      e.classList.contains("dragable") && e.querySelector(".dragable") !== null;

    if (fromId) {
      const start = bodyEl.querySelector<HTMLElement>(`#${CSS.escape(fromId)}`);
      if (start) {
        if (isContainer(start)) return start;
        let p: HTMLElement | null = start.parentElement;
        while (p && p !== bodyEl) {
          if (p.classList.contains("dragable") && isContainer(p)) return p;
          p = p.parentElement;
        }
      }
    }

    // Fallback — pick the container whose center is nearest to the
    // canvas viewport center. Matches the user's mental "I'm looking
    // at this section, drop here."
    const candidates = Array.from(
      bodyEl.querySelectorAll<HTMLElement>(".dragable"),
    ).filter(isContainer);
    if (candidates.length === 0) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = vw / 2;
    const cy = vh / 2;
    let best: HTMLElement | null = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const r = c.getBoundingClientRect();
      // Skip containers fully off-screen.
      if (r.bottom < 0 || r.top > vh) continue;
      const dx = (r.left + r.width / 2) - cx;
      const dy = (r.top + r.height / 2) - cy;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best ?? candidates[0]!;
  }

  /** Apply CSS that turns a generic .dragable into a specific shape.
   *  Used by both the responsive flow path and the absolute fix path so
   *  the look stays consistent across template types.
   *  Defaults to a 200×200 wrapper (square) — Inspector resize/handles
   *  let the user adjust later. Line is 4px tall.
   */
  function applyShapeStyle(el: HTMLElement, kind: string) {
    const fill = "#2a79ff";
    el.style.background = fill;
    switch (kind) {
      case "shape:rect":
        // No clip-path / radius — plain rectangle.
        break;
      case "shape:rounded":
        el.style.borderRadius = "12px";
        break;
      case "shape:circle":
        el.style.borderRadius = "50%";
        break;
      case "shape:triangle":
        el.style.clipPath = "polygon(50% 0%, 100% 100%, 0% 100%)";
        break;
      case "shape:diamond":
        el.style.clipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
        break;
      case "shape:star":
        el.style.clipPath =
          "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)";
        break;
      case "shape:arrow":
        el.style.clipPath =
          "polygon(0% 35%, 65% 35%, 65% 15%, 100% 50%, 65% 85%, 65% 65%, 0% 65%)";
        break;
      case "shape:line":
        // Line is a thin filled rectangle. Override defaults set by caller.
        el.style.borderRadius = "2px";
        break;
    }
  }

  function buildFlowElement(type: string, id: string): HTMLElement {
    const el = document.createElement("div");
    el.id = id;
    switch (type) {
      case "text":
        el.className = "dragable sol-replacible-text";
        el.innerHTML = `<p>${t("canvasInsert.textPlaceholder")}</p>`;
        break;
      case "image": {
        // Must contain exactly one <img> (no other structural children) so
        // the scene parser classifies this as type=image, not type=box —
        // otherwise the layer panel labels it as a generic box and the
        // Inspector image section never appears. Inline SVG data URI
        // keeps the placeholder offline-friendly and self-contained.
        el.className = "dragable";
        el.style.minHeight = "180px";
        const placeholderSvg =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'>" +
              "<rect width='600' height='400' fill='#1a1c24'/>" +
              "<g fill='#888' font-family='-apple-system,BlinkMacSystemFont,Pretendard,sans-serif'>" +
              "<circle cx='300' cy='180' r='32' fill='none' stroke='#666' stroke-width='2'/>" +
              "<path d='M286 180l9 9 19-22' fill='none' stroke='#666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>" +
              `<text x='300' y='250' text-anchor='middle' font-size='16'>${t("canvasInsert.imageLabel")}</text>` +
              `<text x='300' y='275' text-anchor='middle' font-size='12' opacity='.7'>${t("canvasInsert.imageReplaceTip")}</text>` +
              "</g>" +
              "</svg>",
          );
        el.innerHTML = `<img src="${placeholderSvg}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
        break;
      }
      case "box":
        // Button — distinct from a generic shape.
        el.className = "dragable";
        el.style.padding = "12px 20px";
        el.style.background = "#2a79ff";
        el.style.color = "#fff";
        el.style.borderRadius = "6px";
        el.style.display = "inline-block";
        el.style.minWidth = "120px";
        el.style.textAlign = "center";
        el.innerHTML = `<span style="font-size:14px;">${t("canvasInsert.buttonText")}</span>`;
        break;
      case "shape:rect":
      case "shape:rounded":
      case "shape:circle":
      case "shape:triangle":
      case "shape:diamond":
      case "shape:star":
      case "shape:arrow":
        el.className = "dragable";
        el.style.width = "180px";
        el.style.height = "180px";
        applyShapeStyle(el, type);
        break;
      case "shape:line":
        el.className = "dragable";
        el.style.width = "240px";
        el.style.height = "4px";
        applyShapeStyle(el, type);
        break;
      case "board":
        el.className = "dragable sol-replacible-text boardPlugin";
        el.innerHTML =
          `<div style="padding:10px;color:#333"><strong>${t("canvasInsert.boardTitle")}</strong><ul style="margin-top:8px"><li style="line-height:22px">${t("canvasInsert.boardItem")} 1</li><li style="line-height:22px">${t("canvasInsert.boardItem")} 2</li><li style="line-height:22px">${t("canvasInsert.boardItem")} 3</li></ul></div>`;
        break;
      case "product":
        el.className = "dragable sol-replacible-text productPlugin";
        el.innerHTML =
          `<div style="padding:10px;color:#333"><strong>${t("canvasInsert.productTitle")}</strong><div style="display:flex;gap:10px;margin-top:8px"><div style="width:80px;height:80px;background:#eee;border:1px solid #ddd"></div><div style="width:80px;height:80px;background:#eee;border:1px solid #ddd"></div><div style="width:80px;height:80px;background:#eee;border:1px solid #ddd"></div></div></div>`;
        break;
      default:
        el.className = "dragable sol-replacible-text";
        el.innerHTML = `<div style="padding:10px">${type}</div>`;
    }
    return el;
  }

  /**
   * Re-parse the live body DOM into the scene graph and select the
   * given id. Called after any add / drop / paste that mutates DOM
   * directly so the LayerPanel + Inspector pick up the new element.
   * Without this, an `appendChild` ships the element visually but the
   * V2 scene graph (and therefore the layer tree) stays stale.
   */
  function syncSceneFromDomAndSelect(newId: string) {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    setCurrentBodyHtml(bodyEl.innerHTML);
    if (editorV2Enabled) {
      useEditorStore.getState().importHtml(bodyEl.innerHTML, currentPageCss);
      // importHtml clears selection; re-apply now so the new element is
      // immediately editable in the Inspector.
      useEditorStore.getState().select(newId);
      // Auto-hide on PC: an object added (or duplicated) while editing a
      // small-device view is device-specific by default, so it doesn't
      // clutter the desktop layout (the authoring base). Reversible via the
      // PC "이 기기에서 숨기기" toggle. Only fires in tablet/mobile mode.
      const vm = useEditorStore.getState().viewportMode;
      if (vm === "tablet" || vm === "mobile") {
        useEditorStore.getState().setHidden(newId, "desktop", true);
      }
    }
    setSelectedElId(newId);
  }

  /**
   * Insert an image asset (from the 에셋 tab) into the canvas. Routes
   * through the same flow / absolute branching as `addElement` so the
   * insert respects the responsive template flag.
   */
  function addImageAsset(url: string) {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    const id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    if (isResponsiveTemplate) {
      const target = findResponsiveDropTarget(selectedElId);
      const el = document.createElement("div");
      el.id = id;
      el.className = "dragable";
      el.style.minHeight = "180px";
      el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
      (target ?? bodyEl).appendChild(el);
      syncSceneFromDomAndSelect(id);
      return;
    }
    // Fix template — centered in the visible viewport, on top (max z+1), sized
    // to a reasonable default (300×200). User can resize via canvas handles.
    const el = document.createElement("div");
    el.id = id;
    el.className = "dragable";
    el.style.position = "absolute";
    el.style.width = "300px";
    el.style.height = "200px";
    const pos = computeInsertPosition(300, 200);
    el.style.left = pos.left + "px";
    el.style.top = pos.top + "px";
    el.style.zIndex = String(maxBodyZIndex() + 1);
    el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
    bodyEl.appendChild(el);
    syncSceneFromDomAndSelect(id);
  }

  /** Artboard-local (left,top) that centers a new w×h element in the CURRENTLY
   *  VISIBLE part of the canvas — so a freshly inserted object lands where the
   *  user is looking (accounting for scroll + zoom), not at a fixed top-left
   *  origin where it hides behind the header/logo. Intersecting the viewport
   *  with the artboard box keeps the center on-screen even when the artboard is
   *  scrolled past its top edge. Falls back to (100,100) if refs aren't ready. */
  function computeInsertPosition(elW: number, elH: number): { left: number; top: number } {
    const wrapper = canvasWrapperRef.current;
    const artboard = canvasRef.current;
    if (!wrapper || !artboard) return { left: 100, top: 100 };
    const aRect = artboard.getBoundingClientRect();
    if (aRect.width === 0) return { left: 100, top: 100 };
    const wRect = wrapper.getBoundingClientRect();
    const scale = (zoom || 100) / 100;
    const cs = getComputedStyle(wrapper);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padT = parseFloat(cs.paddingTop) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    // Visible content box of the scroll viewport (viewport coords).
    const viewLeft = wRect.left + padL;
    const viewTop = wRect.top + padT;
    const viewRight = wRect.left + wrapper.clientWidth - padR;
    const viewBottom = wRect.top + wrapper.clientHeight - padB;
    // Center on the VISIBLE part of the artboard.
    const ix0 = Math.max(viewLeft, aRect.left);
    const iy0 = Math.max(viewTop, aRect.top);
    const ix1 = Math.min(viewRight, aRect.right);
    const iy1 = Math.min(viewBottom, aRect.bottom);
    const cx = ix1 > ix0 ? (ix0 + ix1) / 2 : (viewLeft + viewRight) / 2;
    const cy = iy1 > iy0 ? (iy0 + iy1) / 2 : (viewTop + viewBottom) / 2;
    const aw = aRect.width / scale; // unscaled artboard width
    let localX = (cx - aRect.left) / scale - elW / 2;
    let localY = (cy - aRect.top) / scale - elH / 2;
    localX = Math.max(0, Math.min(localX, Math.max(0, aw - elW)));
    localY = Math.max(0, localY);
    return { left: Math.round(localX), top: Math.round(localY) };
  }

  /** Highest z-index among existing BODY objects (so a new object can sit one
   *  above, i.e. in front of everything). Reads inline first, then computed. */
  function maxBodyZIndex(): number {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return 10;
    let max = 0;
    bodyEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
      const raw = el.style.zIndex || getComputedStyle(el).zIndex || "0";
      const z = parseInt(raw, 10);
      if (Number.isFinite(z) && z > max) max = z;
    });
    return max;
  }

  function addElement(type: string) {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    const id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);

    // Responsive templates: drop into the selected/visible section as a
    // flow child. Avoids pinning new elements to absolute pixel coords
    // that would ignore the section's flex/grid layout. See
    // template-creation-guide §8.5 for the section/group philosophy.
    if (isResponsiveTemplate) {
      const target = findResponsiveDropTarget(selectedElId);
      const el = buildFlowElement(type, id);
      (target ?? bodyEl).appendChild(el);
      syncSceneFromDomAndSelect(id);
      return;
    }

    // Fix-template legacy path — absolute pixel positioning at a
    // hardcoded offset. User then drags / resizes via canvas handles.
    // className is set per-case below (NOT here) — applying
    // "sol-replacible-text" globally would mis-type image/box/shape
    // layers as text in the scene parser.
    const el = document.createElement("div");
    el.id = id;
    el.style.position = "absolute";

    switch (type) {
      case "text":
        el.className = "dragable sol-replacible-text";
        el.innerHTML = `<p>${t("canvasInsert.textPlaceholder")}</p>`;
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "300px";
        el.style.zIndex = "10";
        break;
      case "image": {
        // Must contain exactly one <img> so the scene parser classifies
        // this as type=image and the Inspector's image controls (replace,
        // alt, fit) appear. A styled div with placeholder text would get
        // typed as text. Inline SVG data URI keeps the placeholder
        // self-contained and offline-friendly.
        el.className = "dragable";
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "300px";
        el.style.height = "200px";
        el.style.zIndex = "10";
        const placeholderSvg =
          "data:image/svg+xml;charset=utf-8," +
          encodeURIComponent(
            "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'>" +
              "<rect width='600' height='400' fill='#1a1c24'/>" +
              "<g fill='#888' font-family='-apple-system,BlinkMacSystemFont,Pretendard,sans-serif'>" +
              "<circle cx='300' cy='180' r='32' fill='none' stroke='#666' stroke-width='2'/>" +
              "<path d='M286 180l9 9 19-22' fill='none' stroke='#666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>" +
              `<text x='300' y='250' text-anchor='middle' font-size='16'>${t("canvasInsert.imageLabel")}</text>` +
              `<text x='300' y='275' text-anchor='middle' font-size='12' opacity='.7'>${t("canvasInsert.imageReplaceTip")}</text>` +
              "</g>" +
              "</svg>",
          );
        el.innerHTML = `<img src="${placeholderSvg}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
        break;
      }
      case "box":
        el.className = "dragable";
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "300px";
        el.style.height = "200px";
        el.style.backgroundColor = "#f0f0f0";
        el.style.border = "1px solid #ccc";
        el.style.zIndex = "5";
        break;
      case "shape:rect":
      case "shape:rounded":
      case "shape:circle":
      case "shape:triangle":
      case "shape:diamond":
      case "shape:star":
      case "shape:arrow":
        el.className = "dragable";
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "180px";
        el.style.height = "180px";
        el.style.zIndex = "10";
        applyShapeStyle(el, type);
        break;
      case "shape:line":
        el.className = "dragable";
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "240px";
        el.style.height = "4px";
        el.style.zIndex = "10";
        applyShapeStyle(el, type);
        break;
      case "board":
        el.className = "dragable sol-replacible-text boardPlugin";
        el.innerHTML = `<div style="padding:10px;color:#ddd"><strong>${t("canvasInsert.boardTitle")}</strong><ul style="margin-top:8px"><li style="line-height:22px">${t("canvasInsert.boardItem")} 1</li><li style="line-height:22px">${t("canvasInsert.boardItem")} 2</li><li style="line-height:22px">${t("canvasInsert.boardItem")} 3</li></ul></div>`;
        el.style.left = "50px";
        el.style.top = "400px";
        el.style.width = "500px";
        el.style.zIndex = "10";
        break;
      case "product":
        el.className = "dragable sol-replacible-text productPlugin";
        el.innerHTML = `<div style="padding:10px;color:#ddd"><strong>${t("canvasInsert.productTitle")}</strong><div style="display:flex;gap:10px;margin-top:8px"><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div></div></div>`;
        el.style.left = "50px";
        el.style.top = "400px";
        el.style.width = "500px";
        el.style.zIndex = "10";
        break;
      default:
        el.className = "dragable sol-replacible-text";
        el.innerHTML = `<div style="padding:10px;color:#ddd">${type}</div>`;
        el.style.left = "100px";
        el.style.top = "200px";
        el.style.width = "250px";
        el.style.zIndex = "10";
        break;
    }

    // Place the new element at the center of the visible viewport and on top
    // of everything (max z-index + 1) — overriding the per-case top-left
    // defaults so it never spawns hidden behind the header/logo. (board/product
    // plugins keep their CSS-governed size; we still center + front them.)
    const elW = parseInt(el.style.width, 10) || 300;
    const elH = parseInt(el.style.height, 10) || 140;
    const pos = computeInsertPosition(elW, elH);
    el.style.left = pos.left + "px";
    el.style.top = pos.top + "px";
    el.style.zIndex = String(maxBodyZIndex() + 1);

    bodyEl.appendChild(el);
    syncSceneFromDomAndSelect(id);
  }

  /* ─── Build the template CSS for the canvas ─── */
  const tplFilesBase = `/tpl/${templatePath}/files`;
  const scopeAndRewrite = (css: string, stripTemplateBg = false) => {
    let result = css
      // Scope reset rules: "body,div,..." → "#de-canvas-inner, #de-canvas-inner div,..."
      .replace(
        /(?<![a-zA-Z-])body\s*,([\s\S]*?)\{/g,
        (_match: string, selectors: string) => {
          const scoped = selectors
            .split(",")
            .map((s: string) => `#de-canvas-inner ${s.trim()}`)
            .join(", ");
          return `#de-canvas-inner, ${scoped} {`;
        }
      )
      // Scope standalone "body {" to #de-canvas-inner
      .replace(/(?<![a-zA-Z-])body\s*\{/g, "#de-canvas-inner {")
      // Override overflow (from body) that clips the canvas
      .replace(/overflow\s*:\s*scroll/g, "overflow: visible")
      .replace(/overflow-x\s*:\s*hidden/g, "overflow-x: visible")
      // Rewrite relative url() to absolute /tpl/ paths
      .replace(
        /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
        (_, filename: string) => `url(${tplFilesBase}/${filename})`
      );
    // Strip body background-image only for template CSS (legacy bg.jpg/tm.gif)
    if (stripTemplateBg) {
      result = result.replace(
        /(#de-canvas-inner\s*\{[^}]*?)background\s*:\s*url\([^)]*\)[^;]*;?/gi,
        "$1"
      );
    }
    return result;
  };
  // boostImportant + escapeHtml are now shared/css-utils.ts (Phase 1).
  const canvasCss = [
    templateCss ? scopeAndRewrite(templateCss, true) : "",
    cssText ? scopeAndRewrite(cssText) : "",
    currentPageCss
      ? scopeAndRewrite(
          boostImportant(
            // Strip base-level geometry from page CSS for two groups:
            // 1. BODY scene layers — the scene owns their geometry; drag/resize
            //    writes it as plain inline, which would lose to CSS !important.
            // 2. HMF (header/menu/footer) elements — their positions are stored
            //    in SiteHmf (shared across all pages). Per-page CSS may contain
            //    legacy rules targeting the same element IDs with slightly
            //    different coordinates, making the header look different on every
            //    page. Stripping those rules lets the SiteHmf's plain inline
            //    styles govern, so the header is visually identical on all pages.
            // Device `@media` blocks (SCENE-DEVICE-OVERRIDES) are STRIPPED for
            // the canvas: the editor simulates each device via JS (per-device
            // frame cascade in applyFrameToEl + applyVisibilityAndLock), NOT
            // media queries. Media queries evaluate against the wide editor
            // browser viewport, not the artboard — so a desktop-hide block
            // (`@media (min-width:1025px){#id{display:none}}`) would match at
            // every artboard width and hide the object even in mobile mode.
            // The published page (real viewport = artboard) keeps the @media.
            stripPinnedGeometryCss(
              stripDeviceMediaCss(currentPageCss),
              (() => {
                const bodyOwned = collectSceneGeometryOwners(useEditorStore.getState().scene.root);
                const hmfOwned = collectInlineGeometryOwners(
                  (headerHtml ?? "") + (menuHtml ?? "") + (footerHtml ?? "")
                );
                return new Map([...bodyOwned, ...hmfOwned]);
              })(),
            ),
          ),
        )
      : "",
  ].filter(Boolean).join("\n");

  // Detect modern full-width templates so the canvas can stretch beyond
  // the legacy 1000px design viewport. Without this, a template like
  // Plus Academy or Agency that uses `max-width: 100%` would still look
  // identical to a fixed-1360px one because the canvas itself is capped.
  // Mirrors the publisher's isModernTemplate heuristic (route.ts ~L515).
  const isModernCanvas =
    (cssText?.includes("/* HNS-MODERN-TEMPLATE */") ?? false) ||
    (cssText?.includes("calc(-50vw + 50%)") ?? false) ||
    (templateCss?.includes("/* HNS-MODERN-TEMPLATE */") ?? false);

  // Some legacy sites are authored for a canvas wider than the default 1000px
  // design viewport — e.g. a 1130px layout whose right-most menu items / header
  // icons sit past the 1000px mark. The published page honors that authored
  // width via `#v_home_dft { width: NNNNpx }` / `.c_v_home_dft { width: NNNNpx }`,
  // but the editor's `#de-canvas-inner` is hard-capped at 1000px (editor-styles.css,
  // ID specificity beats the `.c_v_home_dft` class rule and `#v_home_dft` doesn't
  // exist in the editor DOM), so that content gets clipped and the editor no longer
  // matches the published layout. Detect the authored width and size the artboard
  // to match. Only ever widen (never below 1000) so the common case is untouched.
  const designCanvasWidth = (() => {
    if (isModernCanvas) return null;
    // Explicit user-set PC page width (페이지 탭 → 페이지 폭) takes precedence
    // over the inferred width — and is honored at ANY value (incl. < 1000).
    const managed = parsePageWidthCss(currentPageCss);
    if (managed) return managed;
    const sources = [currentPageCss, cssText, templateCss].filter(Boolean).join("\n");
    const re = /(?:#v_home_dft|\.c_v_home_dft)\s*\{[^}]*?(?<![a-z-])width\s*:\s*(\d+)px/gi;
    let max = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sources)) !== null) {
      const w = parseInt(m[1], 10);
      if (w > max) max = w;
    }
    return max > 1000 ? max : null;
  })();

  /* ─── Device artboard width (LEGACY ABSOLUTE 3-mode) ───
   * In tablet/mobile the white artboard SHRINKS to the real device width and
   * is centered by the wrapper's flex, so the device viewport reads as a
   * centered phone/tablet column (matching user expectation). The artboard
   * keeps `overflow: visible`, so any layer authored beyond the device width
   * (e.g. a PC hero at left:600 on a 375 phone) SPILLS into the dark margin
   * — still visible and draggable — and the user drags it into the column.
   * Coordinates stay anchored at the column's left edge (left:0 == device
   * left), so the editor stays WYSIWYG-faithful with the published page,
   * which also renders absolute coords at the real device width.
   * Flow (modern) sites never enter device mode via the toggle, so this only
   * affects the absolute paradigm. */
  const deviceArtboardWidth =
    !isModernCanvas && viewportMode === "mobile"
      ? 375
      : !isModernCanvas && viewportMode === "tablet"
        ? 768
        : null;
  const artboardWidth = deviceArtboardWidth ?? designCanvasWidth ?? null;
  const canvasWrapperStyle: CSSProperties | undefined = deviceArtboardWidth
    ? { "--de-device-artboard-width": `${deviceArtboardWidth}px` } as CSSProperties
    : undefined;

  const seedHmfViewportFromDesktop = useCallback((device: HmfDevice, desktopWidth: number, deviceWidth: number) => {
    const scale = desktopWidth > 0 ? deviceWidth / desktopWidth : 1;
    const map = hmfDeviceFramesRef.current;
    const base = hmfBaseFramesRef.current;
    const px = (value: string | undefined): number | null => {
      if (!value) return null;
      const n = parseFloat(value);
      return Number.isFinite(n) ? n : null;
    };
    const scaleCss = (value: string | undefined): string | undefined => {
      const n = px(value);
      return n == null ? value : `${Math.max(1, Math.round(n * scale))}px`;
    };

    for (const container of [headerRef.current, menuRef.current, footerRef.current]) {
      if (!container) continue;
      let changed = false;
      snapshotHmfContainerBase(container, base);
      container.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
        const id = el.id || undefined;
        if (!id) return;
        if (map[id]?.[device]) return;
        const box = base[id] ?? {
          left: el.style.left || undefined,
          top: el.style.top || undefined,
          width: el.style.width || undefined,
          height: el.style.height || undefined,
        };
        const next = {
          left: scaleCss(box.left),
          top: scaleCss(box.top),
          width: scaleCss(box.width),
          height: scaleCss(box.height),
        };
        recordHmfDeviceFrame(el, map, device, next);
        changed = true;
      });
      if (changed) {
        writeHmfDeviceStyle(container, map);
        if (container === headerRef.current) useEditorStore.getState().markHeaderDirty();
        if (container === footerRef.current) useEditorStore.getState().markFooterDirty();
      }
      applyHmfDevicePreview(container, map, base, device);
    }
  }, []);

  useEffect(() => {
    if (!editorV2Enabled || isModernCanvas || viewportMode === "desktop") return;
    const deviceWidth = viewportMode === "mobile" ? 375 : 768;
    const desktopWidth = designCanvasWidth ?? 1000;
    const store = useEditorStore.getState();
    store.seedViewportFromDesktop(viewportMode, desktopWidth, deviceWidth);
    seedHmfViewportFromDesktop(viewportMode, desktopWidth, deviceWidth);
  }, [
    editorV2Enabled,
    isModernCanvas,
    viewportMode,
    designCanvasWidth,
    seedHmfViewportFromDesktop,
  ]);

  const selectedProps = getSelectedElProps();

  /* ─── Header/Footer settings helpers ─── */
  function handleLogoChange() {
    // Triggers the hidden file input — actual upload + DOM swap happens
    // in `handleLogoFile` on the input's change event.
    logoFileInputRef.current?.click();
  }

  async function handleLogoFile(file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `${t("inspector.image.uploadFailed")} (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (typeof url !== "string") return;
      setLogoUrl(url);
      // Update the live header DOM so the change shows immediately.
      // The save flow picks up `headerRef.current.innerHTML` later.
      const hEl = headerRef.current;
      if (!hEl) return;
      const logoImg = hEl.querySelector(
        "#hns_h_logo img, .logo img, [id*=logo] img, a img",
      ) as HTMLImageElement | null;
      if (logoImg) logoImg.setAttribute("src", url);
    } catch (e) {
      alert(e instanceof Error ? e.message : t("alerts.logoUploadFailed"));
    }
  }

  function handleMenuModeChange(mode: "auto" | "custom") {
    setMenuMode(mode);
    const mEl = menuRef.current;
    if (!mEl) return;
    if (mode === "auto") {
      mEl.innerHTML = buildMenuHtml();
    }
    // "custom" keeps current DOM as-is
  }

  function handleResetFooter() {
    if (!confirm(t("siteSettingsModal.confirmFooterReset"))) return;
    const fEl = footerRef.current;
    if (fEl) {
      fEl.innerHTML = stripFooterPinnedTop(footerHtml);
    }
  }

  function handleResetHeader() {
    if (!confirm(t("siteSettingsModal.confirmHeaderReset"))) return;
    const hEl = headerRef.current;
    if (hEl) {
      hEl.innerHTML = headerHtml;
    }
  }

  /* ─── Theme tokens (LeftPalette 테마 tab) ─────────────────────────
   * Inject/replace a `:root{...}` rule managed via a comment-delimited
   * block so it can be updated in place without disturbing other page
   * CSS. Downstream: any CSS that references `var(--brand-color)` /
   * `var(--brand-accent)` / `var(--brand-font)` picks up the values.
   */
  /** Persist header layout tokens (sticky/height/background) into the
   *  page CSS as a managed `:root{}` block. Uses the same marker pattern
   *  as `applyTheme` so updates replace in place without disturbing
   *  surrounding CSS. The tokens are read by header CSS rules:
   *    #hns_header { background: var(--hns-header-bg); height: var(...) }
   *    body[data-header-sticky] #hns_header { position: sticky; top: 0; z-index: 100 }
   */
  function applyHeaderLayout(layout: { sticky: boolean; height: string; background: string }) {
    const MARK_START = "/* HNS-HEADER-LAYOUT:START */";
    const MARK_END = "/* HNS-HEADER-LAYOUT:END */";
    const heightLine =
      layout.height && layout.height !== "auto"
        ? `  --hns-header-height: ${layout.height};\n  #hns_header { height: var(--hns-header-height); min-height: var(--hns-header-height); }\n`
        : "";
    const bgLine =
      layout.background && layout.background !== "transparent"
        ? `  --hns-header-bg: ${layout.background};\n  #hns_header { background: var(--hns-header-bg); }\n`
        : "";
    const stickyLine = layout.sticky
      ? `  #hns_header { position: sticky; top: 0; z-index: 100; }\n  /* sticky:1 */\n`
      : `  /* sticky:0 */\n`;
    const block = `${MARK_START}\n:root {\n${heightLine}${bgLine}${stickyLine}}\n${MARK_END}`;
    const css = currentPageCss ?? "";
    const re = new RegExp(
      MARK_START.replace(/[/*]/g, "\\$&") + "[\\s\\S]*?" + MARK_END.replace(/[/*]/g, "\\$&"),
    );
    const next = re.test(css)
      ? css.replace(re, block)
      : css + (css.trim() ? "\n\n" : "") + block + "\n";
    setCurrentPageCss(next);
    // Apply live to the canvas so the user sees the change immediately.
    const hEl = headerRef.current;
    if (hEl) {
      hEl.style.position = layout.sticky ? "sticky" : "";
      hEl.style.top = layout.sticky ? "0" : "";
      hEl.style.zIndex = layout.sticky ? "100" : "";
      hEl.style.background = layout.background !== "transparent" ? layout.background : "";
      if (layout.height && layout.height !== "auto") {
        hEl.style.minHeight = layout.height;
      } else {
        hEl.style.minHeight = "";
      }
    }
  }

  /** Apply "본문 설정" panel changes to #hns_body. Background → an
   *  HNS-BODY-STYLE block in pageCss (+ live). Min-height → the existing
   *  per-device manual mechanism (bodyManualMinHeightRef + syncBodyHeight),
   *  which the save bakes via upsertBodyLayoutCss. `minHeight: 0` = auto. */
  function applyBodyLayout(patch: { background?: string; minHeight?: number }) {
    const bodyEl = bodyRef.current;
    const device = useEditorStore.getState().viewportMode;
    if (patch.minHeight !== undefined) {
      const mh = patch.minHeight > 0 ? patch.minHeight : undefined;
      bodyManualMinHeightRef.current = {
        ...bodyManualMinHeightRef.current,
        [device]: mh,
      };
      syncBodyHeight({ manualHeight: mh ?? 0, device });
    }
    if (patch.background !== undefined) {
      setCurrentPageCss((c) => upsertBodyStyleCss(c ?? "", patch.background!));
      if (bodyEl) {
        bodyEl.style.background =
          patch.background && patch.background !== "transparent" ? patch.background : "";
      }
    }
  }

  /** Apply "페이지 폭" (PC artboard width). Persists a managed HNS-PAGE-WIDTH
   *  block in the page CSS — read back by `designCanvasWidth` (editor artboard)
   *  and the published route's `designWidth` (single source). `width <= 0`
   *  removes the override → revert to the inferred default. Only meaningful for
   *  the legacy absolute paradigm (modern/flow pages are fluid 100%). */
  function applyPageWidth(width: number) {
    if (isModernCanvas) return;
    setCurrentPageCss((c) => upsertPageWidthCss(c ?? "", width > 0 ? width : null));
  }

  /** Apply "푸터 설정" panel changes — SITE-WIDE (footerHtml `<style>` block,
   *  persisted by the HMF save → all pages) and PER-DEVICE (@media). Receives
   *  the full FooterStyle (all devices); writes the managed `<style>` into
   *  #hns_footer + a live inline preview for the active device. */
  function applyFooterLayout(next: FooterStyle) {
    setFooterStyle(next);
    const fEl = footerRef.current;
    if (fEl) {
      const dev = useEditorStore.getState().viewportMode as FooterDevice;
      applyFooterStyleToDom(fEl, next, dev);
    }
  }

  /** Relocate a BODY scene layer into the site-wide header section by id.
   *  This is the LEFT-PANEL counterpart to the canvas drag-into-header
   *  gesture (see onEnd → Goal 2): the user drags a 본문 섹션 row onto the
   *  헤더 섹션 panel. Same relocation contract — move the DOM node into
   *  #hns_header_content, pin geometry !important (header objects must beat
   *  boosted page CSS), drop it from the body scene, rebuild the header scene
   *  and mark it dirty so the site-wide save fires. We place it near the
   *  header's top-left (the body coords are meaningless inside the header) so
   *  the user can immediately see and fine-tune it. */
  const moveBodyLayerToHeader = useCallback((layerId: string) => {
    const headerEl = headerRef.current;
    const bodyEl = bodyRef.current;
    if (!headerEl || !bodyEl || !layerId) return;
    const store = useEditorStore.getState();
    // Resolve the live DOM node for this scene layer. Most body objects carry
    // their original id, so getElementById hits directly. But layers parsed
    // from id-less markup get a *generated* scene id (`newLayerId`) that was
    // only stamped on the detached parse, never on the live DOM — so a direct
    // lookup misses. Fall back to document order: `legacyHtmlToScene` builds
    // the top-level scene children from `body`'s direct `.dragable` children
    // in order, so the layer's index in `scene.root.children` maps 1:1 to the
    // Nth direct `.dragable` child of the live body. Without this fallback the
    // relocation silently no-ops and the row "returns" to the body list.
    let dragEl = document.getElementById(layerId) as HTMLElement | null;
    if (!dragEl || !bodyEl.contains(dragEl)) {
      const root = store.scene?.root as { children?: { id: string }[] } | undefined;
      const idx = root?.children?.findIndex((c) => c.id === layerId) ?? -1;
      if (idx >= 0) {
        const topDragables = Array.from(
          bodyEl.querySelectorAll<HTMLElement>(":scope > .dragable"),
        );
        dragEl = topDragables[idx] ?? null;
      }
    }
    if (!dragEl || !bodyEl.contains(dragEl)) return;
    // Ensure the relocated element has a stable id so the rebuilt header scene
    // and the post-move selection reference the SAME node. (Generated scene
    // ids never reach the DOM, so without this the header scene would parse a
    // brand-new id and the select() below would target a stale id.)
    if (!dragEl.id) {
      dragEl.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }
    const domId = dragEl.id;
    let dest: HTMLElement =
      (headerEl.querySelector("#hns_header_content") as HTMLElement | null) ||
      headerEl;
    // `legacyHmfToScene`'s collect() pushes the FIRST `.dragable` ancestor it
    // meets and never recurses into it. In some templates the content wrapper
    // (#hns_header_content) IS itself the single header `.dragable` ("박스 1"),
    // or lives inside one — appending the moved object there would nest it and
    // it would never surface as a top-level 헤더 섹션 object. Append it as a
    // SIBLING of the outermost dragable instead so it becomes its own layer.
    const dragableAncestor = dest.closest<HTMLElement>(".dragable");
    if (dragableAncestor?.parentElement) {
      dest = dragableAncestor.parentElement;
    }
    const w = dragEl.offsetWidth;
    const h = dragEl.offsetHeight;
    const curLeft = parseInt(dragEl.style.left) || 0;
    const newLeft = Math.max(0, curLeft);
    const newTop = 20;
    multiSelectedRef.current.clear();
    dest.appendChild(dragEl);
    // Native header objects are `.dragable`; `legacyHmfToScene` only collects
    // `.dragable` top-level children. Without this, a relocated body inline
    // (el_*) / non-dragable layer enters the header DOM but never appears in
    // the 헤더 섹션 list (and visually hides behind the nav).
    dragEl.classList.add("dragable");
    dragEl.style.setProperty("position", "absolute", "important");
    dragEl.style.setProperty("left", `${newLeft}px`, "important");
    dragEl.style.setProperty("top", `${newTop}px`, "important");
    dragEl.style.setProperty("width", `${w}px`, "important");
    dragEl.style.setProperty("height", `${h}px`, "important");
    // Place the relocated element ON TOP of the existing header content.
    // Header objects use explicit z-index (e.g. nav icons at 14); dropping the
    // moved element to the default 0 hides it BEHIND the header background /
    // menu-bar image — it renders in the editor but is occluded on the
    // published page. Go one above the current header max so it stays visible.
    {
      let maxZ = 0;
      headerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
        if (el === dragEl) return;
        const z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (!Number.isNaN(z) && z > maxZ) maxZ = z;
      });
      dragEl.style.setProperty("z-index", String(maxZ + 1), "important");
    }
    // Remove the layer from the body scene by its ORIGINAL scene id (layerId),
    // which may differ from the DOM id we just ensured.
    store.remove(layerId);
    let n = 0;
    headerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
      if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
    });
    const hStore = useEditorStore.getState();
    hStore.setHeaderScene(legacyHmfToScene(headerEl.innerHTML));
    hStore.markHeaderDirty();
    hStore.select(domId);
    setSelectedElId(domId);
  }, []);

  // Footer mirror of moveBodyLayerToHeader (see that callback for the full
  // rationale on id resolution, the sibling-of-dragable dest, and `.dragable`).
  const moveBodyLayerToFooter = useCallback((layerId: string) => {
    const footerEl = footerRef.current;
    const bodyEl = bodyRef.current;
    if (!footerEl || !bodyEl || !layerId) return;
    const store = useEditorStore.getState();
    let dragEl = document.getElementById(layerId) as HTMLElement | null;
    if (!dragEl || !bodyEl.contains(dragEl)) {
      const root = store.scene?.root as { children?: { id: string }[] } | undefined;
      const idx = root?.children?.findIndex((c) => c.id === layerId) ?? -1;
      if (idx >= 0) {
        const topDragables = Array.from(
          bodyEl.querySelectorAll<HTMLElement>(":scope > .dragable"),
        );
        dragEl = topDragables[idx] ?? null;
      }
    }
    if (!dragEl || !bodyEl.contains(dragEl)) return;
    if (!dragEl.id) {
      dragEl.id = `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }
    const domId = dragEl.id;
    let dest: HTMLElement =
      (footerEl.querySelector("#hns_footer_content") as HTMLElement | null) ||
      footerEl;
    const dragableAncestor = dest.closest<HTMLElement>(".dragable");
    if (dragableAncestor?.parentElement) {
      dest = dragableAncestor.parentElement;
    }
    const w = dragEl.offsetWidth;
    const h = dragEl.offsetHeight;
    const curLeft = parseInt(dragEl.style.left) || 0;
    const newLeft = Math.max(0, curLeft);
    multiSelectedRef.current.clear();
    dest.appendChild(dragEl);
    dragEl.classList.add("dragable");
    // Footer objects flow AFTER the body (relative) — unlike the header, they
    // are NOT absolutely pinned. Keep left as a relative offset + width/height,
    // but force relative flow and drop any top so the object stacks below the
    // existing footer content (matches stripFooterPinnedTop + the CSS rule).
    dragEl.style.setProperty("position", "relative", "important");
    dragEl.style.removeProperty("top");
    dragEl.style.setProperty("left", `${newLeft}px`, "important");
    dragEl.style.setProperty("width", `${w}px`, "important");
    dragEl.style.setProperty("height", `${h}px`, "important");
    // Place on top of existing footer content (see header path) so a moved
    // element isn't occluded by absolutely-positioned footer decorations.
    {
      let maxZ = 0;
      footerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
        if (el === dragEl) return;
        const z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (!Number.isNaN(z) && z > maxZ) maxZ = z;
      });
      dragEl.style.setProperty("z-index", String(maxZ + 1), "important");
    }
    store.remove(layerId);
    let n = 0;
    footerEl.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
      if (!el.id) el.id = `hmf_${Date.now().toString(36)}_${(n++).toString(36)}`;
    });
    const fStore = useEditorStore.getState();
    fStore.setFooterScene(legacyHmfToScene(footerEl.innerHTML));
    fStore.markFooterDirty();
    fStore.select(domId);
    setSelectedElId(domId);
  }, []);

  function applyTheme(tokens: ThemeTokens) {
    const block = buildThemeCssBlock(tokens);
    const css = currentPageCss ?? "";
    const re = cssManagedBlockRegex(THEME_MARK_START, THEME_MARK_END);
    const next = re.test(css) ? css.replace(re, block) : css + (css.trim() ? "\n\n" : "") + block + "\n";
    setCurrentPageCss(next);

    // Track which preset the user picked for the UI active-state.
    const matched = inferThemePresetId(tokens.brand, tokens.accent);
    setCurrentThemeId(matched); // null clears the highlight for custom colors

    if (tokens.fontStack) {
      const id = findFontIdByStack(tokens.fontStack);
      if (id) setCurrentFontId(id);
    }
  }

  /**
   * Sync the header's `<nav>` (modern templates with `nav` baked into
   * headerHtml — HomeBuilder / Plus Academy / Agency) with the latest
   * pages list. Without this, MenuManagerModal updates Pages in DB but
   * the header keeps showing the original template links until manual
   * edit.
   *
   * Strategy:
   *   - Find all `<a>` direct descendants inside `<nav>`
   *   - Reuse the first `<a>`'s class + child structure (`.num` span,
   *     icons, etc.) as a template — keeps template-specific styling
   *   - Rebuild the `<a>` list from visible pages
   *   - If no `<nav>` is in headerHtml, no-op (auto-menu in #hns_menu
   *     handles legacy templates already)
   *
   * Does NOT save by itself — the rebuilt header DOM gets picked up by
   * the next save flow via headerRef.current.innerHTML.
   */
  function syncHeaderNavToMenu(pagesArg: PageInfo[]) {
    const hEl = headerRef.current;
    if (!hEl) return;
    const nav = hEl.querySelector("nav");
    if (!nav) return;

    const visible = pagesArg.filter(
      (p) =>
        p.showInMenu !== false &&
        !["user", "users", "agreement", "empty"].includes(p.slug),
    );
    // Only top-level (parentId == null) get into the nav. Sub-menus
    // would need template-specific dropdown markup; we don't infer it.
    const top = visible.filter((p) => !p.parentId);

    // Capture template features from the first existing <a>.
    const sample = nav.querySelector("a");
    const sampleClass = sample?.getAttribute("class") || "";
    const hasNumSpan = !!sample?.querySelector(".num");

    const html = top
      .map((p, i) => {
        const label = p.menuTitle || p.title;
        const href = p.externalUrl || (p.slug === "index" ? "index.html" : `${p.slug}.html`);
        const target = p.externalUrl ? ' target="_blank"' : "";
        const num = String(i + 1).padStart(2, "0");
        const inner = hasNumSpan
          ? `<span class="num">${num}</span> ${escapeHtml(label)}`
          : escapeHtml(label);
        return `<a href="${escapeHtml(href)}"${target}${sampleClass ? ` class="${sampleClass}"` : ""}>${inner}</a>`;
      })
      .join("\n");

    nav.innerHTML = html;
  }

  /* ─── Build 2-depth menu HTML from pages ─── */
  function buildMenuHtml(pagesArg?: PageInfo[]): string {
    // Accept an explicit list so callers right after setPages() can pass
    // the fresh value without waiting for the next render's closure.
    const list = pagesArg ?? pages;
    const visible = list.filter(
      (p) =>
        p.showInMenu !== false &&
        !["user", "users", "agreement", "empty"].includes(p.slug)
    );
    const topLevel = visible.filter((p) => !p.parentId);
    const getChildren = (parentId: string) =>
      visible.filter((p) => p.parentId === parentId);

    const menuItems = topLevel
      .map((p) => {
        const label = p.menuTitle || p.title;
        const href = p.externalUrl || (p.slug === "index" ? "index.html" : `${p.slug}.html`);
        const target = p.externalUrl ? ' target="_blank"' : "";
        const children = getChildren(p.id);

        if (children.length === 0) {
          return `<li><a href="${href}"${target}>${label}</a></li>`;
        }

        const subItems = children
          .map((c) => {
            const cLabel = c.menuTitle || c.title;
            const cHref = c.externalUrl || (c.slug === "index" ? "index.html" : `${c.slug}.html`);
            const cTarget = c.externalUrl ? ' target="_blank"' : "";
            return `<li><a href="${cHref}"${cTarget}>${cLabel}</a></li>`;
          })
          .join("\n            ");

        return `<li><a href="${href}"${target}>${label}</a>
          <ul class="submenu">
            ${subItems}
          </ul>
        </li>`;
      })
      .join("\n        ");

    // If menuHtml contains v-wdg-nav or is present, inject the menu items
    if (menuHtml && menuHtml.includes("v-wdg-nav")) {
      return `<div id="v-wdg-nav" class="v-home-ap-hd-nav menu dragable">
        <ul class="mainmenu">
          ${menuItems}
        </ul>
      </div>`;
    }

    // Fallback: always generate a basic menu even if menuHtml is empty
    if (!menuHtml && menuItems) {
      return `<div id="v-wdg-nav" class="v-home-ap-hd-nav menu dragable">
        <ul class="mainmenu">
          ${menuItems}
        </ul>
      </div>`;
    }

    return menuHtml || "";
  }

  return (
    <div className="de-root">
      {/* Inject template CSS */}
      <style dangerouslySetInnerHTML={{ __html: canvasCss }} />

      {/* TOP HEADER BAR — page tabs live inline here since the UI
          consolidation (2026-04-22). The old 객체/설정/위치/AI buttons
          moved to the left rail and the right Inspector panel. */}
      <header className="de-header">
        <div className="de-header-left">
          <a
            href="/dashboard"
            className={`de-logo${brand.whiteLabel ? " de-logo--wl" : ""}`}
          >
            {brand.whiteLabel ? (
              brand.logoUrl ? (
                <BrandMark
                  logoUrl={brand.logoUrl}
                  label={brand.brandName}
                  imgClassName="de-logo-img"
                  textClassName="de-logo-text"
                />
              ) : (
                <>
                  <span className="de-logo-mark">
                    {brand.brandName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="de-logo-text">{brand.brandName}</span>
                </>
              )
            ) : (
              "homeNshop"
            )}
          </a>
          {/* Language switcher (only when the site has more than one language). */}
          {siteLanguages.length > 1 && (
            <div className="de-lang-switch" role="group" aria-label={t("topbar.langGroupLabel")}>
              {siteLanguages.map((l) => {
                const targetPageId = langPageMap[l];
                const isActive = l === currentLang;
                const hasPage = !!targetPageId;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => {
                      if (!isActive && hasPage) {
                        router.push(`/dashboard/site/pages/${targetPageId}/edit`);
                      }
                    }}
                    disabled={!hasPage}
                    className={`de-lang-btn${isActive ? " active" : ""}`}
                    title={hasPage ? t("topbar.langEditTitle", { lang: l.toUpperCase() }) : t("topbar.langNoPageTitle", { lang: l.toUpperCase() })}
                  >
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* Editing-target toggle removed (2026-06-13): header/footer and body
            are edited together on one canvas, so the body↔HMF focus-lock mode
            was redundant and collided with the device toggle. Header/footer
            advanced settings remain reachable via the left rail "고급 편집". */}

        <div className="de-header-right">
          {editorV2Enabled && (
            <span
              className={`de-mode-badge${isAbsoluteMode ? " is-absolute" : " is-flow"}`}
              title={isAbsoluteMode ? t("topbar.modeAbsoluteHint") : t("topbar.modeFlowHint")}
            >
              {isAbsoluteMode ? t("topbar.modeAbsolute") : t("topbar.modeFlow")}
            </span>
          )}
          {editorV2Enabled && isAbsoluteMode && (
            <div className="de-viewport-toggle" role="group" aria-label={t("topbar.viewportLabel")}>
              <button
                type="button"
                className={`de-viewport-btn${viewportMode === "desktop" ? " active" : ""}`}
                onClick={() => useEditorStore.getState().setViewportMode("desktop")}
                title={t("topbar.desktopTitle")}
                aria-pressed={viewportMode === "desktop"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "block" }}>
                  <rect x="3" y="4" width="18" height="12" rx="1"></rect>
                  <line x1="8" y1="20" x2="16" y2="20"></line>
                  <line x1="12" y1="16" x2="12" y2="20"></line>
                </svg>
                <span>PC</span>
              </button>
              <button
                type="button"
                className={`de-viewport-btn${viewportMode === "tablet" ? " active" : ""}`}
                onClick={() => useEditorStore.getState().setViewportMode("tablet")}
                title={t("topbar.tabletTitle")}
                aria-pressed={viewportMode === "tablet"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "block" }}>
                  <rect x="4" y="3" width="16" height="18" rx="2"></rect>
                  <line x1="10" y1="18" x2="14" y2="18"></line>
                </svg>
                <span>Tablet</span>
              </button>
              <button
                type="button"
                className={`de-viewport-btn${viewportMode === "mobile" ? " active" : ""}`}
                onClick={() => useEditorStore.getState().setViewportMode("mobile")}
                title={t("topbar.mobileTitle")}
                aria-pressed={viewportMode === "mobile"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: "block" }}>
                  <rect x="6" y="2" width="12" height="20" rx="2"></rect>
                  <line x1="11" y1="18" x2="13" y2="18"></line>
                </svg>
                <span>Mobile</span>
              </button>
            </div>
          )}
          <a className="de-url" href={`https://${tempDomain}/${shopId}/${defaultLanguage}/${pageSlug === "index" ? "" : pageSlug}`} target="_blank" rel="noopener noreferrer">
            {tempDomain}/{shopId}/{defaultLanguage}/{pageSlug === "index" ? "" : pageSlug}
          </a>
          {/* Undo / Redo — between URL and Save, mirroring the keyboard
              shortcuts already handled in the global keydown listener. */}
          {editorV2Enabled && (
            <div className="de-history-group" role="group" aria-label={t("topbar.historyLabel")}>
              <button
                type="button"
                className="de-history-btn"
                onClick={() => runUndo()}
                disabled={!canUndo}
                title={t("topbar.undoTitle", { shortcut: typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⌘Z" : "Ctrl+Z" })}
                aria-label={t("topbar.undo")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                </svg>
              </button>
              <button
                type="button"
                className="de-history-btn"
                onClick={() => runRedo()}
                disabled={!canRedo}
                title={t("topbar.redoTitle", { shortcut: typeof navigator !== "undefined" && /Mac/.test(navigator.platform) ? "⇧⌘Z" : "Ctrl+Shift+Z" })}
                aria-label={t("topbar.redo")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7v6h-6" />
                  <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
                </svg>
              </button>
            </div>
          )}
          <button
            className="de-save-btn"
            onClick={saveContent}
            disabled={saving}
          >
            {saving ? t("topbar.saving") : saveStatus === "saved" ? t("topbar.saved") : t("topbar.save")}
          </button>
          <button
            className="de-publish-btn"
            onClick={publishSite}
            disabled={publishing}
          >
            {publishing ? t("topbar.publishing") : t("topbar.publish")}
          </button>
          {/* Overflow menu — save-as-template etc. */}
          <div ref={moreMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title={t("topbar.more")}
              aria-label={t("topbar.more")}
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              style={{
                width: 32,
                height: 32,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 4,
                background: moreMenuOpen ? "rgba(255,255,255,0.12)" : "transparent",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              {/* Horizontal 3-dot icon */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="13" cy="8" r="1.5" />
              </svg>
            </button>
            {moreMenuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 220,
                  background: "#fff",
                  color: "#1f2937",
                  borderRadius: 8,
                  boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                  border: "1px solid #e5e7eb",
                  padding: "6px 0",
                  zIndex: 1000,
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setShowSiteSettings(true);
                  }}
                  className="de-more-menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>{t("topbar.siteSettingsItem")}</span>
                </button>
                <div className="de-more-divider" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setSaveTplName(siteName || "");
                    setSaveTplError("");
                    setShowSaveTplModal(true);
                  }}
                  className="de-more-menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>{t("topbar.saveAsTemplate")}</span>
                </button>
                <div className="de-more-divider" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={runAtomize}
                  disabled={atomizeBusy}
                  className="de-more-menuitem"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  <span>{atomizeBusy ? t("topbar.atomizeBusy") : t("topbar.atomize")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
        {/* Page tabs — second row of the App bar (full width, scrollable). */}
        <nav className="de-header-pagetabs" aria-label={t("topbar.pageTabsLabel")}>
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`de-header-pagetab${p.id === pageId ? " active" : ""}`}
              onClick={() => {
                if (p.id !== pageId) {
                  router.push(`/dashboard/site/pages/${p.id}/edit`);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setPageCtxMenu({ pageId: p.id, x: e.clientX, y: e.clientY });
              }}
              title={p.title}
            >
              {p.title}
            </button>
          ))}
          <button
            type="button"
            className="de-header-pageadd"
            onClick={() => router.push(`/dashboard/site/pages/new`)}
            title={t("topbar.addPage")}
            aria-label={t("topbar.addPage")}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M8 3v10M3 8h10" />
            </svg>
          </button>
        </nav>
      </header>

      {/* Page tab context menu (right-click on a page tab). */}
      {pageCtxMenu && (
        <>
          <div
            onClick={() => setPageCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setPageCtxMenu(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 9000 }}
          />
          <div
            role="menu"
            className="de-page-ctxmenu"
            style={{ left: pageCtxMenu.x, top: pageCtxMenu.y }}
          >
            <button
              type="button"
              role="menuitem"
              className="de-more-menuitem"
              onClick={() => {
                const id = pageCtxMenu.pageId;
                setPageCtxMenu(null);
                router.push(`/dashboard/site/pages/${id}/edit`);
              }}
            >
              <span>{t("pageContextMenu.open")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="de-more-menuitem"
              onClick={() => {
                setPageCtxMenu(null);
                router.push(`/dashboard/site/pages`);
              }}
            >
              <span>{t("pageContextMenu.managePages")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="de-more-menuitem"
              onClick={() => {
                setPageCtxMenu(null);
                router.push(`/dashboard/site/pages/new`);
              }}
            >
              <span>{t("pageContextMenu.newPage")}</span>
            </button>
          </div>
        </>
      )}

      {/* Save-as-template modal */}
      {showSaveTplModal && (
        <div
          onClick={() => { if (!saveTplBusy) setShowSaveTplModal(false); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitSaveAsTemplate}
            style={{
              background: "#fff",
              borderRadius: 10,
              width: "100%",
              maxWidth: 480,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              color: "#1f2937",
            }}
          >
            <h3 style={{ margin: 0, marginBottom: 6, fontSize: 18, fontWeight: 700 }}>
              {t("saveTemplateModal.title")}
            </h3>
            <p style={{ margin: 0, marginBottom: 18, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              {t("saveTemplateModal.description")}
            </p>
            {saveTplError && (
              <div style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {saveTplError}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {t("saveTemplateModal.nameLabel")} <span style={{ color: "#e03131" }}>*</span>
              </label>
              <input
                type="text"
                value={saveTplName}
                onChange={(e) => setSaveTplName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                placeholder={t("saveTemplateModal.namePlaceholder")}
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {t("saveTemplateModal.descLabel")}
              </label>
              <textarea
                value={saveTplDesc}
                onChange={(e) => setSaveTplDesc(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("saveTemplateModal.descPlaceholder")}
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                {t("saveTemplateModal.thumbLabel")}
              </label>
              <input
                type="url"
                value={saveTplThumb}
                onChange={(e) => setSaveTplThumb(e.target.value)}
                placeholder="https://..."
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowSaveTplModal(false)}
                disabled={saveTplBusy}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: saveTplBusy ? "default" : "pointer" }}
              >
                {t("saveTemplateModal.cancel")}
              </button>
              <button
                type="submit"
                disabled={saveTplBusy}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, background: saveTplBusy ? "#9ca3af" : "#228be6", color: "#fff", border: "none", borderRadius: 6, cursor: saveTplBusy ? "default" : "pointer" }}
              >
                {saveTplBusy ? t("saveTemplateModal.saving") : t("saveTemplateModal.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Site Settings modal — opens from the ⋯ overflow menu.
          Holds what used to live in the old "설정" top-toolbar tab:
          header/logo, menu auto/custom mode, footer reset. The actual
          HMF markup is still edited inline on the canvas. */}
      {showSiteSettings && (
        <div
          onClick={() => setShowSiteSettings(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              width: "100%",
              maxWidth: 560,
              padding: 24,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
              color: "#1f2937",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{t("siteSettingsModal.title")}</h3>
              <button
                type="button"
                onClick={() => setShowSiteSettings(false)}
                aria-label={t("siteSettingsModal.close")}
                style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 22, color: "#6b7280", lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Site info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{t("siteSettingsModal.siteLabel")}</span>
                <span style={{ fontSize: 14, color: "#111" }}>{siteName} · {currentLang.toUpperCase()}</span>
              </div>

              {/* Header / Logo */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{t("siteSettingsModal.headerLogo")}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="logo"
                      style={{ height: 28, maxWidth: 100, objectFit: "contain", borderRadius: 4, background: "#f3f4f6", border: "1px solid #e5e7eb" }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleLogoChange}
                    style={{ padding: "6px 12px", fontSize: 13, background: "#111827", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
                  >
                    {t("siteSettingsModal.changeLogo")}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetHeader}
                    style={{ padding: "6px 12px", fontSize: 13, background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
                  >
                    {t("siteSettingsModal.resetHeader")}
                  </button>
                </div>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {t("siteSettingsModal.logoTip")}
                </span>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLogoFile(f);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Header layout — sticky / height / background.
                  Writes to a managed `:root{}` block in the page CSS via
                  applyHeaderLayout, mirroring the theme tokens pattern. */}
              <HeaderLayoutSection
                value={headerLayout}
                onChange={(next) => {
                  setHeaderLayout(next);
                  applyHeaderLayout(next);
                }}
              />

              {/* Languages — site-wide languages list + default. PUT to
                  /api/sites/{id} updates Site.languages array. */}
              <LanguagesSection
                siteId={siteId}
                currentLang={currentLang}
                languages={siteLanguages}
                defaultLanguage={defaultLanguage}
              />

              {/* Menu Mode */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{t("siteSettingsModal.menu")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => handleMenuModeChange("auto")}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      borderRadius: 6,
                      border: menuMode === "auto" ? "2px solid #2563eb" : "1px solid #d1d5db",
                      background: menuMode === "auto" ? "#dbeafe" : "#fff",
                      color: menuMode === "auto" ? "#1e40af" : "#374151",
                      cursor: "pointer",
                      fontWeight: menuMode === "auto" ? 600 : 500,
                    }}
                  >
                    {t("siteSettingsModal.menuAuto")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMenuModeChange("custom")}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      borderRadius: 6,
                      border: menuMode === "custom" ? "2px solid #2563eb" : "1px solid #d1d5db",
                      background: menuMode === "custom" ? "#dbeafe" : "#fff",
                      color: menuMode === "custom" ? "#1e40af" : "#374151",
                      cursor: "pointer",
                      fontWeight: menuMode === "custom" ? 600 : 500,
                    }}
                  >
                    {t("siteSettingsModal.menuCustom")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSiteSettings(false);
                      setShowMenuManager(true);
                    }}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      borderRadius: 6,
                      border: "1px solid #2563eb",
                      background: "#2563eb",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 600,
                      marginLeft: "auto",
                    }}
                  >
                    <i className="fa-solid fa-list-ul" style={{ marginRight: 6 }} />
                    {t("siteSettingsModal.openMenuMgr")}
                  </button>
                </div>
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  {menuMode === "auto" ? t("siteSettingsModal.menuAutoTip") : t("siteSettingsModal.menuCustomTip")}
                </span>
              </div>

              {/* Footer */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>{t("siteSettingsModal.footer")}</span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={handleResetFooter}
                    style={{ padding: "6px 12px", fontSize: 13, background: "#fff", color: "#374151", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}
                  >
                    {t("siteSettingsModal.resetFooter")}
                  </button>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{t("siteSettingsModal.footerTip")}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 22, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowSiteSettings(false)}
                style={{ padding: "8px 16px", fontSize: 13, background: "#111827", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
              >
                {t("siteSettingsModal.doneClose")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANVAS */}
      <div
        ref={canvasWrapperRef}
        className={`de-canvas-wrapper${viewportMode === "mobile" ? " mobile-preview" : viewportMode === "tablet" ? " tablet-preview" : ""}`}
        style={canvasWrapperStyle}
        onMouseMove={(e) => {
          const host = bodyRef.current;
          if (!host) return;
          const r = host.getBoundingClientRect();
          const x = Math.round((e.clientX - r.left) / (zoom / 100));
          const y = Math.round((e.clientY - r.top) / (zoom / 100));
          if (x >= 0 && y >= 0 && x < 4000 && y < 10000) setCursorCoord([x, y]);
        }}
        onMouseLeave={() => setCursorCoord(null)}
      >
        {/* Artboard label — top-left above the canvas (Figma-style) */}
        <div
          className="de-artboard-label"
          style={{
            top: viewportMode === "desktop" ? 20 : 10,
            left: "50%",
            transform: "translateX(-50%)",
            position: "absolute",
            zIndex: 3,
          }}
        >
          <span className="chip">
            {viewportMode === "mobile"
              ? t("viewport.mobile")
              : viewportMode === "tablet"
                ? t("viewport.tablet")
                : t("viewport.desktop")}
          </span>
          <span className="dev">
            {viewportMode === "mobile"
              ? "375 × auto"
              : viewportMode === "tablet"
                ? "768 × auto"
                : isModernCanvas
                  ? "100% × auto"
                  : `${designCanvasWidth ?? 1000} × auto`}
          </span>
        </div>

        <div
          className={`de-canvas${isModernCanvas ? " is-modern" : ""}`}
          ref={canvasRef}
          style={{
            transform:
              zoom !== 100 || fitOffsetX !== 0
                ? `translateX(${fitOffsetX}px) scale(${zoom / 100})`
                : undefined,
            transformOrigin: "top center",
            ...(artboardWidth ? { width: artboardWidth } : {}),
          }}
        >
          <div
            className={`de-canvas-content c_v_home_dft${isModernCanvas ? " is-modern" : ""}`}
            id="de-canvas-inner"
            data-de-device={viewportMode}
            style={artboardWidth ? { width: artboardWidth } : undefined}
          >
            {/* HEADER — ref-only, set via useEffect to preserve drag edits */}
            <div id="hns_header" ref={headerRef} />

            {/* MENU — ref-only */}
            <div id="hns_menu" ref={menuRef} />

            {/* BODY — ref-only */}
            <div id="hns_body" ref={bodyRef} />
            {!isModernCanvas && (
              <div
                className="de-body-resize-bar"
                style={{ top: bodyHandleTop }}
                title="본문 영역 높이 조정"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startBodyResize(e.clientY);
                }}
                onTouchStart={(e) => {
                  const touch = e.touches[0];
                  if (!touch) return;
                  e.preventDefault();
                  e.stopPropagation();
                  startBodyResize(touch.clientY);
                }}
              >
                <span />
              </div>
            )}

            {/* FOOTER — ref-only */}
            <div id="hns_footer" ref={footerRef} />

            {/* Device viewport edge marker (LEGACY ABSOLUTE 3-mode only).
             *  The white artboard IS the device viewport now (its width ==
             *  375 / 768, centered). This thin label rides the artboard's
             *  right edge so the user knows the device width; any layer that
             *  spills past it into the dark margin can be dragged back in. */}
            {viewportMode !== "desktop" && !isModernCanvas && (
              <div className="de-device-edge" aria-hidden>
                <span className="de-device-edge-label">
                  {viewportMode === "mobile" ? "375px" : "768px"}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sprint 9j — Figma-style rulers (H/V) synced with zoom + scroll */}
        {editorV2Enabled && (
          <Suspense fallback={null}>
            <CanvasRulers
              wrapperRef={canvasWrapperRef}
              originRef={canvasRef}
              zoom={zoom}
              siteId={siteId}
            />
          </Suspense>
        )}

        {/* Floating zoom controls — bottom-right pill (Figma-style) */}
        <div className="de-canvas-float-br">
          <div className="de-float-group">
            <button
              type="button"
              className="de-icon-btn"
              title={t("zoom.outTitle")}
              onClick={() => setZoom((z) => Math.max(25, z - 10))}
              aria-label={t("zoom.out")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 8h10" />
              </svg>
            </button>
            <div className="de-zoom">{zoom}%</div>
            <button
              type="button"
              className="de-icon-btn"
              title={t("zoom.inTitle")}
              onClick={() => setZoom((z) => Math.min(400, z + 10))}
              aria-label={t("zoom.in")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
          </div>
          <div className="de-float-group">
            <button
              type="button"
              className="de-icon-btn"
              title={t("zoom.fitTitle")}
              onClick={() => setZoom(100)}
              aria-label={t("zoom.fit")}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* TOOLTIP for double-click */}
      {selectedElId && !editingTextId && (
        <div className="de-tooltip">{t("tooltip.doubleClick")}</div>
      )}

      {/* Sprint 9j / 9k — Figma-style left component palette (fixed left rail) */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <LeftPalette
            onInsert={(type) => addElement(type)}
            onInsertSection={(presetId) => insertSectionPreset(presetId)}
            onInsertAsset={(url) => addImageAsset(url)}
            onOpenHeaderEdit={() => setShowHeaderEdit(true)}
            onOpenFooterEdit={() => setShowFooterEdit(true)}
            onMoveLayerToHeader={moveBodyLayerToHeader}
            onMoveLayerToFooter={moveBodyLayerToFooter}
            siteId={siteId}
            onApplyTheme={applyTheme}
            currentThemeId={currentThemeId}
            currentFontId={currentFontId}
            aiPrompt={aiPrompt}
            setAiPrompt={setAiPrompt}
            aiLoading={aiLoading}
            aiStatus={aiStatus}
            aiError={aiError}
            canUndoAi={aiPrevHtmlRef.current !== null}
            creditBalance={creditBalance}
            creditCost={creditCost}
            onRunAi={executeAiEdit}
            onUndoAi={undoAiEdit}
          />
        </Suspense>
      )}

      {/* Sprint 9k — Drag-to-insert overlay (ghost + drop indicator) */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <DragInsertLayer
            wrapperRef={canvasWrapperRef}
            bodyRef={bodyRef}
            onDrop={(payload, target) => {
              if (payload.kind === "type") {
                addElement(payload.value);
              } else {
                insertSectionPreset(payload.value, target?.afterId ?? null);
              }
            }}
          />
        </Suspense>
      )}

      {/* Sprint 9j — Inspector (design / layers / interaction) replaces the
          bare LayerPanel on the right rail. */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <InspectorPanel
            enabled={editorV2Enabled}
            siteId={siteId}
            headerLayout={headerLayout}
            onApplyHeaderLayout={(next) => {
              setHeaderLayout(next);
              applyHeaderLayout(next);
            }}
            onApplyBodyLayout={applyBodyLayout}
            footerStyle={footerStyle}
            onApplyFooterLayout={applyFooterLayout}
            isModernCanvas={isModernCanvas}
            pageWidth={designCanvasWidth ?? 1000}
            pageWidthManaged={parsePageWidthCss(currentPageCss) != null}
            onApplyPageWidth={applyPageWidth}
            onOpenHeaderEdit={() => setShowHeaderEdit(true)}
            onOpenFooterEdit={() => setShowFooterEdit(true)}
          />
        </Suspense>
      )}

      {/* (editorV2 disabled — no legacy rail render; InspectorPanel is the
          single source of truth for editor-v2 users.) */}

      {/* V2 CANVAS OVERLAY — rotation handle + align toolbar */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <CanvasOverlay containerRef={bodyRef} siteId={siteId} />
        </Suspense>
      )}

      {/* HEADER IMAGE OVERLAY — floating ↻ buttons over each <img> in
          the site header so the user can swap the logo (and any other
          header images) without opening the settings modal. */}
      <Suspense fallback={null}>
        <HeaderImageOverlay headerRef={headerRef} siteId={siteId} />
      </Suspense>

      {/* Same overlay reused for the footer — every <img> in the footer
          gets a ↻ replace button. Component name is misleading but the
          props/effects are region-agnostic. */}
      <Suspense fallback={null}>
        <HeaderImageOverlay headerRef={footerRef} siteId={siteId} />
      </Suspense>

      {/* MENU MANAGER MODAL — opens from settings or from the canvas
          floating "메뉴 편집" button. Drives Pages list (showInMenu /
          menuTitle / parentId / order) which buildMenuHtml() reads. */}
      {showHeaderEdit && (
        <Suspense fallback={null}>
          <HeaderEditModal
            siteId={siteId}
            currentLang={currentLang}
            siteLanguages={siteLanguages}
            defaultLanguage={defaultLanguage}
            headerRef={headerRef}
            initialHeaderHtml={headerHtml}
            headerLayout={headerLayout}
            onApplyLayout={(next) => {
              setHeaderLayout(next);
              applyHeaderLayout(next);
            }}
            onOpenMenuManager={() => setShowMenuManager(true)}
            onClose={() => setShowHeaderEdit(false)}
          />
        </Suspense>
      )}

      {showFooterEdit && (
        <Suspense fallback={null}>
          <FooterEditModal
            siteId={siteId}
            footerRef={footerRef}
            initialFooterHtml={footerHtml}
            onClose={() => setShowFooterEdit(false)}
          />
        </Suspense>
      )}

      {showMenuManager && (
        <Suspense fallback={null}>
          <MenuManagerModal
            siteId={siteId}
            pages={pages}
            onClose={() => setShowMenuManager(false)}
            onPagesChanged={(updated) => {
              setPages(updated);
              // Auto-menu (#hns_menu) — rebuild from the fresh pages list
              // (closure-captured `pages` is stale here, so pass updated
              // explicitly to buildMenuHtml).
              if (menuMode === "auto" && menuRef.current) {
                menuRef.current.innerHTML = buildMenuHtml(updated);
              }
              // Modern templates (HB / PA / Agency) carry `<nav>` inside
              // headerHtml, not #hns_menu — rewrite it so the visible
              // header navigation reflects the new menu. Persists when
              // the user clicks the main 저장 button (saves headerHtml).
              syncHeaderNavToMenu(updated);
            }}
          />
        </Suspense>
      )}

      {/* TIPTAP EDITOR MODAL — disabled in favor of in-place contenteditable
          editing (Claude-design-style). The state + handlers are kept so a
          future "rich text" entry point (e.g., Cmd+Shift+E) can re-open the
          modal for link/image inserts that the inspector doesn't cover. */}
      {false && tiptapTarget && (
        <Suspense fallback={
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, color: "#fff" }}>
            {t("loading")}
          </div>
        }>
          <TiptapModal
            initialHtml={tiptapTarget?.html ?? ""}
            onSave={handleTiptapSave}
            onClose={() => { tiptapElRef.current = null; setTiptapTarget(null); }}
          />
        </Suspense>
      )}

      {/* PUBLISH SUCCESS MODAL */}
      {showPublishModal && (
        <div className="de-modal-overlay" onClick={() => setShowPublishModal(false)}>
          <div className="de-modal" onClick={(e) => e.stopPropagation()}>
            <div className="de-modal-icon">&#x2705;</div>
            <h3 className="de-modal-title">{t("publishModal.title")}</h3>
            <p className="de-modal-desc">
              {t("publishModal.desc")}
            </p>
            <div className="de-modal-url">
              https://{tempDomain}/{shopId}/{defaultLanguage}/
            </div>
            <div className="de-modal-actions">
              <a
                href={`https://${tempDomain}/${shopId}/${defaultLanguage}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="de-modal-btn primary"
              >
                {t("publishModal.preview")}
              </a>
              <button
                className="de-modal-btn secondary"
                onClick={() => setShowPublishModal(false)}
              >
                {t("publishModal.continue")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INSUFFICIENT CREDITS MODAL */}
      {insufficientCredits && (
        <div
          onClick={() => setInsufficientCredits(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              maxWidth: 420,
              width: "100%",
              padding: "32px 28px 24px",
              textAlign: "center",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.3)",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: "#fef3c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              ✨
            </div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: "#1a1a2e",
                margin: "0 0 10px",
              }}
            >
              {t("creditsModal.title")}
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "#4b5563",
                lineHeight: 1.6,
                margin: "0 0 24px",
              }}
            >
              {t("creditsModal.needPrefix")} <b>{insufficientCredits.required} C</b> {t("creditsModal.needSuffix")}<br />
              {t("creditsModal.currentBalance")}: <b>{insufficientCredits.balance.toLocaleString()} C</b>
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <a
                href="/dashboard/credits"
                style={{
                  display: "block",
                  padding: "12px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#fff",
                  background: "#7c3aed",
                  borderRadius: 8,
                  textDecoration: "none",
                  textAlign: "center",
                }}
              >
                {t("creditsModal.topUp")}
              </a>
              <button
                onClick={() => setInsufficientCredits(null)}
                style={{
                  padding: "10px 20px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#4b5563",
                  background: "#fff",
                  border: "1.5px solid #e2e8f0",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                {t("creditsModal.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sprint 9i — Status bar (Figma-style, bottom of editor) ═══ */}
      <div className="de-status-bar" aria-label={t("statusBar.ariaLabel")}>
        <span className={`item${saveStatus === "saved" ? " ok" : ""}`}>
          <span className="dot" />
          {saving
            ? t("statusBar.saving")
            : saveStatus === "error"
              ? t("statusBar.savingFailed")
              : saveStatus === "saved"
                ? t("statusBar.savedJustNow")
                : t("statusBar.allSaved")}
        </span>
        <span className="item">
          {t("statusBar.page")} <span className="mono">{pageSlug}</span>
        </span>
        {editorV2Enabled && (
          <span className="item">
            {t("statusBar.element")} <span className="mono">{layerCount}</span>
          </span>
        )}
        <span className="item">
          {t("statusBar.language")} <span className="mono">{currentLang}</span>
        </span>
        <span className="spacer" />
        <span className="item cursor">
          {t("statusBar.cursor")}{" "}
          <span className="mono">
            {cursorCoord ? `${cursorCoord[0]}, ${cursorCoord[1]}` : "—"}
          </span>
        </span>
        <span className="item">
          {t("statusBar.zoom")} <span className="mono">{zoom}%</span>
        </span>
        <span className="item">
          {t("statusBar.viewport")} <span className="mono">{viewportMode === "mobile" ? "375" : viewportMode === "tablet" ? "768" : (designCanvasWidth ?? 1000)}</span>
        </span>
      </div>
    </div>
  );
}


/* ─── Header Layout & Languages — sub-sections of Site Settings modal
 * (2026-04-25). Inlined here so they can use the design-editor scope
 * for style consistency; pulled to top-level functions to keep the
 * main component readable.
 */

interface HeaderLayoutValue {
  sticky: boolean;
  height: string;
  background: string;
}

function HeaderLayoutSection({
  value,
  onChange,
}: {
  value: HeaderLayoutValue;
  onChange: (v: HeaderLayoutValue) => void;
}) {
  const t = useTranslations("editor");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        {t("siteSettingsModal.headerLayout")}
      </span>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151" }}>
        <input
          type="checkbox"
          checked={value.sticky}
          onChange={(e) => onChange({ ...value, sticky: e.target.checked })}
        />
        {t("siteSettingsModal.stickyLabel")}
      </label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          {t("siteSettingsModal.heightLabel")}
          <input
            type="text"
            value={value.height}
            onChange={(e) => onChange({ ...value, height: e.target.value })}
            placeholder="auto / 64px"
            style={{ width: 100, padding: "4px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4 }}
          />
        </label>
        <label style={{ fontSize: 13, color: "#374151", display: "flex", alignItems: "center", gap: 6 }}>
          {t("siteSettingsModal.bgLabel")}
          <input
            type="text"
            value={value.background}
            onChange={(e) => onChange({ ...value, background: e.target.value })}
            placeholder="transparent / #fff"
            style={{ width: 130, padding: "4px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 4 }}
          />
        </label>
      </div>
      <span style={{ fontSize: 11, color: "#6b7280" }}>
        {t("siteSettingsModal.headerLayoutNote")}
      </span>
    </div>
  );
}

function LanguagesSection({
  siteId,
  currentLang,
  languages,
  defaultLanguage,
}: {
  siteId: string;
  currentLang: string;
  languages: string[];
  defaultLanguage: string;
}) {
  const t = useTranslations("editor");
  const tLang = useTranslations("language");
  const [selected, setSelected] = useState<string[]>(languages);
  const [defaultLang, setDefaultLang] = useState<string>(defaultLanguage);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const VALID = [
    { code: "ko",    label: tLang("ko") },
    { code: "en",    label: tLang("en") },
    { code: "ja",    label: tLang("ja") },
    { code: "zh-cn", label: tLang("zh-cn") },
    { code: "zh-tw", label: tLang("zh-tw") },
    { code: "es",    label: tLang("es") },
  ];

  const toggle = (code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const savedMsg = t("siteSettingsModal.savedLanguages");

  const save = async () => {
    if (selected.length === 0) {
      setMsg(t("siteSettingsModal.minOneLang"));
      return;
    }
    if (!selected.includes(defaultLang)) {
      // Auto-pick first as default if current default got unchecked.
      setDefaultLang(selected[0]!);
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languages: selected,
          defaultLanguage: selected.includes(defaultLang) ? defaultLang : selected[0],
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `${t("siteSettingsModal.saveFailed")} (${res.status})`);
      }
      setMsg(savedMsg);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t("siteSettingsModal.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
        {t("siteSettingsModal.languageLabel")}
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
        {VALID.map((l) => {
          const checked = selected.includes(l.code);
          const isDefault = defaultLang === l.code;
          const isCurrent = currentLang === l.code;
          return (
            <label
              key={l.code}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                background: checked ? "#eff6ff" : "#fff",
                border: checked ? "1px solid #2563eb" : "1px solid #d1d5db",
                borderRadius: 6,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(l.code)} />
              <span style={{ flex: 1, color: "#374151" }}>
                {l.label} <span style={{ color: "#9ca3af", fontSize: 11 }}>({l.code})</span>
              </span>
              {checked && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    setDefaultLang(l.code);
                  }}
                  title={t("siteSettingsModal.setDefault")}
                  style={{
                    padding: "2px 6px",
                    fontSize: 10,
                    borderRadius: 3,
                    border: isDefault ? "1px solid #2563eb" : "1px solid #d1d5db",
                    background: isDefault ? "#2563eb" : "#fff",
                    color: isDefault ? "#fff" : "#374151",
                    cursor: "pointer",
                  }}
                >
                  {isDefault ? t("siteSettingsModal.isDefault") : t("siteSettingsModal.makeDefault")}
                </button>
              )}
              {isCurrent && (
                <span style={{ color: "#10b981", fontSize: 10 }} title={t("siteSettingsModal.currentlyEditing")}>●</span>
              )}
            </label>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: "6px 14px",
            fontSize: 13,
            background: "#111827",
            color: "#fff",
            border: 0,
            borderRadius: 6,
            cursor: saving ? "wait" : "pointer",
            fontWeight: 500,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? t("siteSettingsModal.savingLanguages") : t("siteSettingsModal.saveLanguages")}
        </button>
        {msg && <span style={{ fontSize: 12, color: msg === savedMsg ? "#10b981" : "#dc2626" }}>{msg}</span>}
      </div>
    </div>
  );
}
