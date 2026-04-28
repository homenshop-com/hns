"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useStore } from "zustand";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import "./editor-styles.css";
// Sprint 9i (2026-04-22) — Figma-inspired dark theme overlay, recreating
// "Editor Canvas.html" from Claude Design. Must import AFTER editor-styles.css
// so its higher specificity rules win.
import "./editor-figma-theme.css";
import { useEditorStore } from "./store/editor-store";
import {
  applySelection as syncApplySelection,
  syncStoreToDom,
} from "./store/editor-sync";
import { snapRect, type Rect as SnapRect } from "./store/snap";
import {
  sceneToMobileCss,
  stripMobileCssBlock,
} from "@/lib/scene";
// Sprint 9k — section preset library for LeftPalette "섹션 블록" list.
import { SECTION_PRESETS } from "./components/section-library";
import { findFontIdByStack } from "./components/font-catalog";
import { findThemePresetByColors } from "./components/theme-presets";

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

const THEME_MARK_START = "/* HNS-THEME-TOKENS:START */";
const THEME_MARK_END = "/* HNS-THEME-TOKENS:END */";

/** Theme tokens written into the managed `:root{}` block. The 4 color
 *  tokens are surfaced as `--brand-color/-accent/-surface/-text` CSS
 *  vars; the rest of `buildThemeCssBlock` cascades them onto common
 *  selectors so the canvas reflects the change without per-element
 *  edits. */
export type ThemeTokens = {
  brand: string;
  accent: string;
  surface?: string;
  text?: string;
  fontStack?: string;
};

function cssManagedBlockRegex(start: string, end: string) {
  return new RegExp(
    start.replace(/[/*]/g, "\\$&") + "[\\s\\S]*?" + end.replace(/[/*]/g, "\\$&"),
  );
}

/**
 * Build the managed `:root{...}` CSS block + element overrides for the
 * current theme tokens. Selectors are emitted twice — once for the
 * editor canvas (`#de-canvas-inner`) and once for the published page
 * body (`#hns_body`) — so the same theme renders identically in
 * preview and on the live site.
 *
 * What changed in 2026-04-26 fix:
 * - Dropped `[style*="border-radius"]` from the badge/pill rule. That
 *   attribute selector matched ANY element with inline `border-radius`
 *   — including user-added shapes (a circle has `border-radius:50%`),
 *   so applying a theme would silently repaint every shape on the
 *   page with the accent color. Visible symptom: red circle published
 *   as a gray disc.
 * - Dropped `a[style*="background"]` from the button rule (same kind
 *   of overly-broad attribute match that grabbed unintended elements).
 * - Now targets `#hns_body` too, so theme styling is consistent
 *   between editor preview and the published page (previously the
 *   theme appeared in the canvas only, then "vanished" on publish).
 */
function buildThemeCssBlock(tokens: ThemeTokens) {
  const surface = tokens.surface ?? "#ffffff";
  const text = tokens.text ?? "#111827";
  const fontVar = tokens.fontStack ? `  --brand-font: ${tokens.fontStack};\n` : "";

  // Helper — emit both editor and published-page-scoped selectors for
  // a given inner pattern so a single rule applies in both contexts.
  const dual = (inner: string) => `#de-canvas-inner ${inner}, #hns_body ${inner}`;

  const fontRules = tokens.fontStack
    ? `
${dual('*:not(i):not(.fa):not([class^="fa-"]):not([class*=" fa-"])')} {
  font-family: var(--brand-font) !important;
}
`
    : "";

  return `${THEME_MARK_START}
:root {
  --brand-color: ${tokens.brand};
  --brand-accent: ${tokens.accent};
  --brand-surface: ${surface};
  --brand-text: ${text};
${fontVar}}

/* Page surface — the canvas root carries the surface tone so sections
   without their own background pick it up. */
#de-canvas-inner,
#hns_body {
  background-color: var(--brand-surface) !important;
  color: var(--brand-text) !important;
}

/* Body copy — paragraphs and generic text blocks follow --brand-text.
   Headings & buttons get their own color rules below, which override
   this via cascade order. */
${dual('p')},
${dual('li')},
${dual('span:not([style*="color"])')},
${dual('div:not([style*="color"]):not([style*="background"])')} {
  color: var(--brand-text);
}

/* Headings & first-class titles → brand color. Includes both real
   semantic tags and the editor's text-layer naming patterns. */
${dual('h1')},
${dual('h2')},
${dual('h3')},
${dual('h4')},
${dual('h5')},
${dual('h6')},
${dual('.title')},
${dual('.headline')},
${dual('.section-title')},
${dual('[class*="-title"]')},
${dual('[class*="-heading"]')},
${dual('.sol-replacible-text h1')},
${dual('.sol-replacible-text h2')},
${dual('.sol-replacible-text h3')} {
  color: var(--brand-color) !important;
}

/* Badges / pills / tags pick up the accent color as a soft tint. NOTE
   we deliberately do NOT include [style*="border-radius"] here — that
   would also match user-added shapes (circles have radius:50%) and
   repaint them with the accent color. Class-only selectors are safer. */
${dual('.badge')},
${dual('.tag')},
${dual('.eyebrow')},
${dual('[class*="badge"]')},
${dual('[class*="eyebrow"]')},
${dual('[class*="-pill"]')},
${dual('[class*="-chip"]')} {
  background-color: color-mix(in srgb, var(--brand-accent) 18%, var(--brand-surface)) !important;
  border-color: var(--brand-accent) !important;
  color: color-mix(in srgb, var(--brand-color) 80%, black) !important;
}

/* Buttons & button-like links — fill with brand. Class-anchored only;
   no [style*="background"] attribute match, which would otherwise grab
   any link a user has manually styled. */
${dual('button')},
${dual('.btn')},
${dual('[class*="btn-primary"]')},
${dual('[class*="button-primary"]')},
${dual('[class*="btn-gold"]')} {
  background-color: var(--brand-color) !important;
  border-color: var(--brand-color) !important;
  color: #ffffff !important;
}

/* Secondary buttons (outlined) — accent border. */
${dual('[class*="btn-secondary"]')},
${dual('[class*="button-secondary"]')},
${dual('[class*="btn-outline"]')} {
  background-color: transparent !important;
  border-color: var(--brand-accent) !important;
  color: var(--brand-color) !important;
}

/* Plain links — brand color. Excludes button-styled links handled above. */
${dual('a:not([class*="btn"]):not([class*="button"])')} {
  color: var(--brand-color) !important;
}
${fontRules}${THEME_MARK_END}`;
}

function inferThemePresetId(brand: string, accent: string): string | null {
  return findThemePresetByColors(brand, accent)?.id ?? null;
}

function parseThemeTokens(css: string) {
  const block = css.match(cssManagedBlockRegex(THEME_MARK_START, THEME_MARK_END))?.[0] ?? css;
  const brand = block.match(/--brand-color\s*:\s*([^;]+);/i)?.[1]?.trim();
  const accent = block.match(/--brand-accent\s*:\s*([^;]+);/i)?.[1]?.trim();
  const surface = block.match(/--brand-surface\s*:\s*([^;]+);/i)?.[1]?.trim();
  const text = block.match(/--brand-text\s*:\s*([^;]+);/i)?.[1]?.trim();
  const fontStack = block.match(/--brand-font\s*:\s*([^;]+);/i)?.[1]?.trim();
  return { brand, accent, surface, text, fontStack };
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
}

/* ─── Component ─── */
export default function DesignEditor({
  siteId,
  shopId,
  siteName,
  defaultLanguage,
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
  published: initialPublished,
  currentLang,
  siteLanguages,
  langPageMap = {},
  editorV2Enabled = false,
  isResponsiveTemplate = false,
}: DesignEditorProps) {
  const router = useRouter();
  const t = useTranslations("editor");

  // V2: keep the scene graph store in sync with the body HTML that the
  // DOM-first editor is rendering. Importing a fresh scene on every
  // bodyHtml change is cheap and guarantees the LayerPanel reflects AI
  // edits, undo, page switches, etc. Skip entirely when the flag is off.
  useEffect(() => {
    if (!editorV2Enabled) return;
    useEditorStore.getState().importHtml(bodyHtml || "", pageCss);
  }, [editorV2Enabled, bodyHtml, pageId, pageCss]);

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

  // Subscribe to viewport mode (for toolbar button highlighting + canvas width).
  const [viewportMode, setLocalViewportMode] = useState<"desktop" | "mobile">("desktop");
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
  } | null>(null);

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

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = bodyHtml;
    }
  }, [bodyHtml]);

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
    {
      const s = useEditorStore.getState();
      syncStoreToDom(s.scene, bodyEl, s.viewportMode);
      syncApplySelection(s.selectedId, s.multiSelectedIds, bodyEl);
    }
    // Zustand v5 default subscribe fires on every state change. Cache
    // the last-seen references so we only touch the DOM when something
    // we care about actually changed.
    let lastScene = useEditorStore.getState().scene;
    let lastPrimary = useEditorStore.getState().selectedId;
    let lastMulti = useEditorStore.getState().multiSelectedIds;
    let lastViewport = useEditorStore.getState().viewportMode;
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
      if (s.selectedId !== lastPrimary || s.multiSelectedIds !== lastMulti) {
        lastPrimary = s.selectedId;
        lastMulti = s.multiSelectedIds;
        syncApplySelection(s.selectedId, s.multiSelectedIds, el);
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
        useEditorStore.temporal.getState().undo();
        return;
      }
      if (
        (mod && e.shiftKey && e.key.toLowerCase() === "z") ||
        (mod && e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        useEditorStore.temporal.getState().redo();
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
      // Detect logo URL
      const logoImg = headerRef.current.querySelector("#hns_h_logo img, .logo img, [id*=logo] img, a img") as HTMLImageElement | null;
      if (logoImg?.src) setLogoUrl(logoImg.src);
    }
  }, [headerHtml]);

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
      } else if (headerHasNav || modernTemplate) {
        menuRef.current.innerHTML = menuHtml || "";
      } else {
        menuRef.current.innerHTML = buildMenuHtml();
      }
      menuInitedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (footerRef.current && !footerInitedRef.current) {
      footerRef.current.innerHTML = footerHtml;
      footerInitedRef.current = true;
    }
  }, [footerHtml]);

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

  /* ─── Calculate hns_body min-height from absolute children + header height ─── */
  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    function recalcBodyHeight() {
      if (!bodyEl) return;
      let maxBottom = 0;
      const children = bodyEl.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as HTMLElement;
        const top = parseInt(child.style.top) || parseInt(window.getComputedStyle(child).top) || 0;
        const height = child.offsetHeight || 0;
        maxBottom = Math.max(maxBottom, top + height);
      }
      bodyEl.style.minHeight = (maxBottom + 40) + "px";
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
    setTimeout(recalcBodyHeight, 100);
    setTimeout(recalcBodyHeight, 500);

    return () => {
      images.forEach((img) => { img.removeEventListener("load", onLoad); img.removeEventListener("error", onLoad); });
    };
  }, [bodyHtml]);

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
        // For elements with margin:auto (centered), remove left/top that conflict
        bodyEl.querySelectorAll(".dragable").forEach((el) => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.style.margin && htmlEl.style.margin.includes("auto")) {
            htmlEl.style.removeProperty("left");
            htmlEl.style.removeProperty("top");
          }
        });
      }
      const html = bodyEl ? bodyEl.innerHTML : currentBodyHtml;

      // V2 dual-save: attach the current scene graph alongside the HTML.
      // Publisher / legacy consumers keep reading `content.html`; V2-aware
      // editor paths can preferentially hydrate from `content.layers` to
      // get the typed tree without re-parsing.
      const v2Scene = editorV2Enabled
        ? useEditorStore.getState().scene
        : null;

      // Mobile viewport overrides → @media block inside pageCss.
      // Strip any previous block before emitting a fresh one; if there
      // are no overrides at all, the pageCss just gets trimmed.
      let finalPageCss = currentPageCss;
      if (v2Scene) {
        const withoutOld = stripMobileCssBlock(finalPageCss);
        const mobileBlock = sceneToMobileCss(v2Scene);
        finalPageCss = mobileBlock
          ? (withoutOld ? `${withoutOld}\n\n${mobileBlock}` : mobileBlock)
          : withoutOld;
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
        // Auto menu mode: save empty menuHtml so published route generates dynamically
        // Custom menu mode: save current DOM menuHtml
        const menuHtmlToSave = menuMode === "auto" ? "" : (mEl ? mEl.innerHTML : undefined);
        await fetch(`/api/sites/${siteId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hmfLang: currentLang,
            ...(hEl && { headerHtml: hEl.innerHTML }),
            ...(menuHtmlToSave !== undefined && { menuHtml: menuHtmlToSave }),
            ...(fEl && { footerHtml: fEl.innerHTML }),
          }),
        });
      }

      if (res.ok) {
        setCurrentBodyHtml(html);
        if (editorV2Enabled) setCurrentPageCss(finalPageCss);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus(""), 2000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
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
        footerRef.current.innerHTML = data.footer;
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
          footerRef.current.innerHTML = prev.footer;
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
      // Save current page first
      const bodyEl = bodyRef.current;
      const html = bodyEl ? bodyEl.innerHTML : currentBodyHtml;
      await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { html } }),
      });

      // Save header/menu/footer + set published = true
      const hEl = headerRef.current;
      const mEl = menuRef.current;
      const fEl = footerRef.current;
      const menuHtmlToSave = menuMode === "auto" ? "" : (mEl ? mEl.innerHTML : undefined);
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          published: true,
          hmfLang: currentLang,
          ...(hEl && { headerHtml: hEl.innerHTML }),
          ...(menuHtmlToSave !== undefined && { menuHtml: menuHtmlToSave }),
          ...(fEl && { footerHtml: fEl.innerHTML }),
        }),
      });
      if (res.ok) {
        setIsPublished(true);
        setCurrentBodyHtml(html);
        setShowPublishModal(true);
      }
    } catch {
      // ignore
    } finally {
      setPublishing(false);
    }
  }, [siteId, pageId, currentBodyHtml]);

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
          const top = parseInt(target.style.top) || 0;
          const left = parseInt(target.style.left) || 0;
          if (e.key === "ArrowUp") target.style.top = (top - step) + "px";
          if (e.key === "ArrowDown") target.style.top = (top + step) + "px";
          if (e.key === "ArrowLeft") target.style.left = (left - step) + "px";
          if (e.key === "ArrowRight") target.style.left = (left + step) + "px";
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElId, editingTextId, saveContent]);

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
      sectionEl.style.opacity = "";
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
    if (editorV2Enabled) {
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
    footerEl?.addEventListener("mousedown", handleStructDown);
    footerEl?.addEventListener("touchstart", handleStructDown, { passive: false });
    return () => {
      headerEl?.removeEventListener("mousedown", handleStructDown);
      headerEl?.removeEventListener("touchstart", handleStructDown);
      footerEl?.removeEventListener("mousedown", handleStructDown);
      footerEl?.removeEventListener("touchstart", handleStructDown);
    };
  }, []);

  /* ─── Mouse/Touch move/up for drag and resize ─── */
  useEffect(() => {
    function handleMove(clientX: number, clientY: number) {
      // Block drag/resize while any modal is open
      if (document.querySelector(".de-modal-overlay, [data-tiptap-modal]")) return;
      const scale = getCanvasScale();
      if (dragRef.current) {
        const { el, startX, startY, origLeft, origTop, others } = dragRef.current;
        const dragAny = dragRef.current as any;
        let dx = (clientX - startX) / scale;
        let dy = (clientY - startY) / scale;
        // Flag "actually moved" so click-without-drag doesn't commit
        // a spurious setFrame on mouseup. 2px threshold absorbs pointer
        // jitter on trackpads.
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragAny.moved = true;
        if (!dragAny.moved) return;
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
        el.style.left = (origLeft + dx) + "px";
        el.style.top = (origTop + dy) + "px";
        // Move all other multi-selected elements by the same delta
        others.forEach((o) => {
          o.el.style.left = (o.origLeft + dx) + "px";
          o.el.style.top = (o.origTop + dy) + "px";
        });
      }
      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = (clientX - r.startX) / scale;
        const dy = (clientY - r.startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) (r as any).moved = true;
        if (!(r as any).moved) return;
        if (r.handle.includes("e")) r.el.style.width = Math.max(30, r.origWidth + dx) + "px";
        if (r.handle.includes("w")) {
          r.el.style.width = Math.max(30, r.origWidth - dx) + "px";
          r.el.style.left = (r.origLeft + dx) + "px";
        }
        if (r.handle.includes("s")) r.el.style.height = Math.max(20, r.origHeight + dy) + "px";
        if (r.handle.includes("n")) {
          r.el.style.height = Math.max(20, r.origHeight - dy) + "px";
          r.el.style.top = (r.origTop + dy) + "px";
        }
      }
    }

    function onMouseMove(e: MouseEvent) { handleMove(e.clientX, e.clientY); }
    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current && !resizeRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX, touch.clientY);
    }
    function onEnd() {
      // V2: commit the final DOM position/size back to the scene so
      // LayerPanel / overlay / undo stack reflect the legacy drag-resize.
      // Only if the gesture ACTUALLY moved — a plain click leaves the
      // element where it was (and may not have inline left/top at all,
      // which would otherwise collapse the element to 0,0).
      if (editorV2Enabled) {
        const store = useEditorStore.getState();
        if (dragRef.current && (dragRef.current as any).moved) {
          const els: HTMLElement[] = [dragRef.current.el, ...dragRef.current.others.map((o: any) => o.el)];
          for (const el of els) {
            if (!el.id) continue;
            const x = parseInt(el.style.left) || 0;
            const y = parseInt(el.style.top) || 0;
            store.setFrame(el.id, { x, y });
          }
        }
        if (resizeRef.current && (resizeRef.current as any).moved) {
          const el = resizeRef.current.el;
          if (el.id) {
            const x = parseInt(el.style.left) || 0;
            const y = parseInt(el.style.top) || 0;
            const w = el.offsetWidth;
            const h = el.offsetHeight;
            store.setFrame(el.id, { x, y, w, h });
          }
        }
      }
      dragRef.current = null;
      resizeRef.current = null;
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

    // Sprint 9a — FLOW-ELEMENT GUARD (resize side).
    // Don't render resize handles on flow-positioned sections; resizing
    // them via inline width/height would fight the template's responsive
    // CSS and look broken. Selection still works so the LayerPanel can
    // display/rename/visibility-toggle the section.
    {
      const pos = window.getComputedStyle(el).position;
      if (pos !== "absolute" && pos !== "fixed") return;
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
  }, [selectedElId, multiSelectCount]);

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
    // Fix template — drop at a sensible offset, sized to a reasonable
    // default (300×200). User can resize via canvas handles.
    const el = document.createElement("div");
    el.id = id;
    el.className = "dragable";
    el.style.position = "absolute";
    el.style.left = "100px";
    el.style.top = "100px";
    el.style.width = "300px";
    el.style.height = "200px";
    el.style.zIndex = "10";
    el.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;
    bodyEl.appendChild(el);
    syncSceneFromDomAndSelect(id);
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
    const el = document.createElement("div");
    el.id = id;
    el.className = "dragable sol-replacible-text";
    el.style.position = "absolute";

    switch (type) {
      case "text":
        el.innerHTML = `<p>${t("canvasInsert.textPlaceholder")}</p>`;
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "300px";
        el.style.zIndex = "10";
        break;
      case "image":
        el.innerHTML = `<div style="width:300px;height:200px;background:#555;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:14px;">${t("canvasInsert.imageDragHint")}</div>`;
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.zIndex = "10";
        break;
      case "box":
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
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "180px";
        el.style.height = "180px";
        el.style.zIndex = "10";
        applyShapeStyle(el, type);
        break;
      case "shape:line":
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
        el.innerHTML = `<div style="padding:10px;color:#ddd">${type}</div>`;
        el.style.left = "100px";
        el.style.top = "200px";
        el.style.width = "250px";
        el.style.zIndex = "10";
        break;
    }

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
  // Boost page CSS position/size props to !important — mirrors the
  // published route (route.ts:480-484). Without this, the template's
  // `site-upgrade.css` !important rules override per-element top/left/
  // width/height/position/z-index from pageCss, collapsing absolutely
  // positioned sections to default positions and producing a bare
  // skeleton view (tiny hero, huge gap, plain text at bottom).
  const boostImportant = (css: string) =>
    css.replace(
      /(\b(?:top|left|width|height|display|position|z-index)\s*:\s*)([^;!}]+)(;|})/gi,
      (_: string, prop: string, val: string, end: string) =>
        val.trim().includes("!important")
          ? `${prop}${val}${end}`
          : `${prop}${val.trim()} !important${end}`,
    );
  const canvasCss = [
    templateCss ? scopeAndRewrite(templateCss, true) : "",
    cssText ? scopeAndRewrite(cssText) : "",
    currentPageCss ? scopeAndRewrite(boostImportant(currentPageCss)) : "",
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
      fEl.innerHTML = footerHtml;
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

  function escapeHtml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
          <a href="/dashboard" className="de-logo">homeNshop</a>
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
          {/* Page tabs — Figma-style, inline in the App bar. */}
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
        </div>
        <div className="de-header-right">
          {editorV2Enabled && !isResponsiveTemplate && (
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
          <a className="de-url" href={`https://home.homenshop.com/${shopId}/${defaultLanguage}/${pageSlug === "index" ? "" : pageSlug}`} target="_blank" rel="noopener noreferrer">
            home.homenshop.com/{shopId}/{defaultLanguage}/{pageSlug === "index" ? "" : pageSlug}
          </a>
          {/* Undo / Redo — between URL and Save, mirroring the keyboard
              shortcuts already handled in the global keydown listener. */}
          {editorV2Enabled && (
            <div className="de-history-group" role="group" aria-label={t("topbar.historyLabel")}>
              <button
                type="button"
                className="de-history-btn"
                onClick={() => useEditorStore.temporal.getState().undo()}
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
                onClick={() => useEditorStore.temporal.getState().redo()}
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
              </div>
            )}
          </div>
        </div>
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
        className={`de-canvas-wrapper${viewportMode === "mobile" ? " mobile-preview" : ""}`}
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
            top: viewportMode === "mobile" ? 10 : 20,
            left: "50%",
            transform: "translateX(-50%)",
            position: "absolute",
            zIndex: 3,
          }}
        >
          <span className="chip">
            {viewportMode === "mobile" ? t("viewport.mobile") : t("viewport.desktop")}
          </span>
          <span className="dev">
            {viewportMode === "mobile"
              ? "375 × auto"
              : isModernCanvas
                ? "100% × auto"
                : "1000 × auto"}
          </span>
        </div>

        <div
          className={`de-canvas${isModernCanvas ? " is-modern" : ""}`}
          ref={canvasRef}
          style={{
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: "top center",
          }}
        >
          <div
            className={`de-canvas-content c_v_home_dft${isModernCanvas ? " is-modern" : ""}`}
            id="de-canvas-inner"
          >
            {/* HEADER — ref-only, set via useEffect to preserve drag edits */}
            <div id="hns_header" ref={headerRef} />

            {/* MENU — ref-only */}
            <div id="hns_menu" ref={menuRef} />

            {/* BODY — ref-only */}
            <div id="hns_body" ref={bodyRef} />

            {/* FOOTER — ref-only */}
            <div id="hns_footer" ref={footerRef} />
          </div>
        </div>

        {/* Sprint 9j — Figma-style rulers (H/V) synced with zoom + scroll */}
        {editorV2Enabled && (
          <Suspense fallback={null}>
            <CanvasRulers
              wrapperRef={canvasWrapperRef}
              originRef={canvasRef}
              zoom={zoom}
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
          <InspectorPanel enabled={editorV2Enabled} siteId={siteId} />
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
              https://home.homenshop.com/{shopId}/{defaultLanguage}/
            </div>
            <div className="de-modal-actions">
              <a
                href={`https://home.homenshop.com/${shopId}/${defaultLanguage}/`}
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
          {t("statusBar.viewport")} <span className="mono">{viewportMode === "mobile" ? "375" : "1000"}</span>
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
