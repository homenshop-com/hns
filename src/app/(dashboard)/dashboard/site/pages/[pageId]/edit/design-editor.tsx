"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
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

/** Module-scoped clipboard for V2 copy/paste. Lives for the page
 *  session, cleared on navigation. We also mirror to navigator.clipboard
 *  as JSON so the user can paste into another tab of the same editor. */
let v2Clipboard: unknown[] = [];

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
  pages,
  bodyHtml,
  published: initialPublished,
  currentLang,
  siteLanguages,
  langPageMap = {},
  editorV2Enabled = false,
}: DesignEditorProps) {
  const router = useRouter();

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
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"page" | "object" | "settings" | "position" | "ai">("page");
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
      setSaveTplError("템플릿 이름을 입력해 주세요.");
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
        setSaveTplError(err.error || `저장 실패 (${res.status})`);
        setSaveTplBusy(false);
        return;
      }
      setSaveTplBusy(false);
      setShowSaveTplModal(false);
      setSaveTplName("");
      setSaveTplDesc("");
      setSaveTplThumb("");
      alert("나의 템플릿으로 저장되었습니다.\n대시보드 > 템플릿 > 내 템플릿 탭에서 확인하세요.");
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
        // position tab, drag/resize handles, and keyboard shortcuts
        // pick up the target. Also auto-switch to the 위치 tab so the
        // user immediately sees the selected layer's props.
        if (s.selectedId) {
          setSelectedElId(s.selectedId);
          setActiveTab((t) => (t === "page" || t === "object" ? "position" : t));
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
      // If menuHtml already has complete menu items (ul>li), use it directly.
      // buildMenuHtml() generates legacy-class menus that don't match custom template CSS.
      const hasCompleteMenu = menuHtml && /<ul[^>]*>\s*<li/i.test(menuHtml);
      menuRef.current.innerHTML = hasCompleteMenu ? menuHtml : buildMenuHtml();
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
        setAiError(data.error || "오류가 발생했습니다.");
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
      setAiError("네트워크 오류가 발생했습니다.");
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
      // Page section — selection only, no drag.
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
      if ((e.target as HTMLElement).closest(".dragable")) {
        e.preventDefault();
        // Don't stopPropagation — allow dblclick to bubble to canvasEl
      }
      startDragOnElement(e.target as HTMLElement, e.clientX, e.clientY, e.shiftKey);
    }

    function handleTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      if (!touch) return;
      startDragOnElement(e.target as HTMLElement, touch.clientX, touch.clientY);
      if ((e.target as HTMLElement).closest(".dragable")) {
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
    if (!body || !body.contains(target)) return null;

    // Walk up from target to find the innermost leaf-text element
    let el: HTMLElement | null = target;
    let leafText: HTMLElement | null = null;
    while (el && el !== body) {
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
      if (dragable && body.contains(dragable) && isSimpleDragable(dragable)) {
        return dragable;
      }
      return leafText;
    }

    // Try .dragable — but only if it's a simple one (legacy absolute positioned)
    if (dragable && body.contains(dragable) && isSimpleDragable(dragable)) {
      return dragable;
    }

    // For complex dragables (custom template section wrappers),
    // find the nearest text element the user likely intended to edit
    if (dragable && body.contains(dragable)) {
      // Walk up from click target
      el = target;
      while (el && el !== dragable) {
        if (TEXT_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
      // If clicked on dragable itself (empty space), find first text child
      const firstText = dragable.querySelector("h1, h2, h3, h4, h5, h6, p, span, li, td, th, label, blockquote");
      if (firstText) return firstText as HTMLElement;
    }

    return null;
  }

  function enterTextEdit(editEl: HTMLElement) {
    // Cancel any in-progress drag
    dragRef.current = null;
    resizeRef.current = null;

    if (!editEl.id) {
      editEl.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }
    setSelectedElId(editEl.id);
    // Store direct ref to element and open TipTap modal
    tiptapElRef.current = editEl;
    setTiptapTarget({ elId: editEl.id, html: editEl.innerHTML });
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
      enterTextEdit(editEl);
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
        enterTextEdit(editEl);
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

  function addElement(type: string) {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    const id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const el = document.createElement("div");
    el.id = id;
    el.className = "dragable sol-replacible-text";
    el.style.position = "absolute";

    switch (type) {
      case "text":
        el.innerHTML = "<p>텍스트를 입력하세요</p>";
        el.style.left = "100px";
        el.style.top = "100px";
        el.style.width = "300px";
        el.style.zIndex = "10";
        break;
      case "image":
        el.innerHTML = '<div style="width:300px;height:200px;background:#555;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:14px;">이미지를 드래그하세요</div>';
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
      case "board":
        el.className = "dragable sol-replacible-text boardPlugin";
        el.innerHTML = '<div style="padding:10px;color:#ddd"><strong>게시판</strong><ul style="margin-top:8px"><li style="line-height:22px">게시글 제목 1</li><li style="line-height:22px">게시글 제목 2</li><li style="line-height:22px">게시글 제목 3</li></ul></div>';
        el.style.left = "50px";
        el.style.top = "400px";
        el.style.width = "500px";
        el.style.zIndex = "10";
        break;
      case "product":
        el.className = "dragable sol-replacible-text productPlugin";
        el.innerHTML = '<div style="padding:10px;color:#ddd"><strong>상품 목록</strong><div style="display:flex;gap:10px;margin-top:8px"><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div><div style="width:80px;height:80px;background:#505050;border:3px solid #505050"></div></div></div>';
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
    setSelectedElId(id);
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

  const selectedProps = getSelectedElProps();

  /* ─── Header/Footer settings helpers ─── */
  function handleLogoChange() {
    const url = prompt("새 로고 이미지 URL을 입력하세요:", logoUrl || "https://");
    if (url === null) return;
    setLogoUrl(url);
    // Update logo in header DOM
    const hEl = headerRef.current;
    if (!hEl) return;
    const logoImg = hEl.querySelector("#hns_h_logo img, .logo img, [id*=logo] img, a img") as HTMLImageElement | null;
    if (logoImg) {
      logoImg.src = url;
      logoImg.setAttribute("src", url);
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
    if (!confirm("푸터를 초기 상태로 되돌리시겠습니까?")) return;
    const fEl = footerRef.current;
    if (fEl) {
      fEl.innerHTML = footerHtml;
    }
  }

  function handleResetHeader() {
    if (!confirm("헤더를 초기 상태로 되돌리시겠습니까?")) return;
    const hEl = headerRef.current;
    if (hEl) {
      hEl.innerHTML = headerHtml;
    }
  }

  /* ─── Build 2-depth menu HTML from pages ─── */
  function buildMenuHtml(): string {
    const visible = pages.filter(
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

      {/* TOP HEADER BAR */}
      <header className="de-header">
        <div className="de-header-left">
          <a href="/dashboard" className="de-logo">homeNshop</a>
          <nav className="de-tabs">
            <button
              className={`de-tab ${activeTab === "page" ? "active" : ""}`}
              onClick={() => setActiveTab("page")}
            >
              페이지
            </button>
            <button
              className={`de-tab ${activeTab === "object" ? "active" : ""}`}
              onClick={() => setActiveTab("object")}
            >
              객체
            </button>
            <button
              className={`de-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              설정
            </button>
            <button
              className={`de-tab ${activeTab === "position" ? "active" : ""}`}
              onClick={() => setActiveTab("position")}
            >
              위치
            </button>
            <button
              className={`de-tab de-tab-ai ${activeTab === "ai" ? "active" : ""}`}
              onClick={() => setActiveTab("ai")}
              title="AI 어시스턴트로 페이지 편집"
            >
              <svg
                className="sparkle"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0l2.4 9.1L24 12l-9.6 2.9L12 24l-2.4-9.1L0 12l9.6-2.9L12 0z" />
              </svg>
              <span className="ai-label">AI</span>
            </button>
          </nav>
        </div>
        <div className="de-header-right">
          {editorV2Enabled && (
            <div className="de-viewport-toggle" role="group" aria-label="뷰포트 전환">
              <button
                type="button"
                className={`de-viewport-btn${viewportMode === "desktop" ? " active" : ""}`}
                onClick={() => useEditorStore.getState().setViewportMode("desktop")}
                title="데스크탑 편집 (≥ 768px)"
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
                title="모바일 편집 (< 768px) — 데스크탑과 별도의 위치/크기 저장"
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
          <button
            className="de-save-btn"
            onClick={saveContent}
            disabled={saving}
          >
            {saving ? "저장중..." : saveStatus === "saved" ? "저장됨 ✓" : "저장 (⌘S)"}
          </button>
          <button
            className="de-publish-btn"
            onClick={publishSite}
            disabled={publishing}
          >
            {publishing ? "퍼블리싱중..." : "퍼블리싱"}
          </button>
          {/* Overflow menu — save-as-template etc. */}
          <div ref={moreMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="더보기"
              aria-label="더보기"
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
                    setSaveTplName(siteName || "");
                    setSaveTplError("");
                    setShowSaveTplModal(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "8px 14px",
                    fontSize: 13,
                    color: "#1f2937",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#f3f4f6")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>나의 템플릿으로 저장</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

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
              나의 템플릿으로 저장
            </h3>
            <p style={{ margin: 0, marginBottom: 18, fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
              현재 사이트의 헤더/메뉴/푸터/CSS 및 모든 페이지를 스냅샷하여 개인 템플릿으로 저장합니다. 공개 전환은 템플릿 목록에서 가능합니다.
            </p>
            {saveTplError && (
              <div style={{ background: "#fef2f2", color: "#991b1b", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {saveTplError}
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                템플릿 이름 <span style={{ color: "#e03131" }}>*</span>
              </label>
              <input
                type="text"
                value={saveTplName}
                onChange={(e) => setSaveTplName(e.target.value)}
                maxLength={100}
                required
                autoFocus
                placeholder="예: 내 쇼핑몰 템플릿 v1"
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                설명 (선택)
              </label>
              <textarea
                value={saveTplDesc}
                onChange={(e) => setSaveTplDesc(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="이 템플릿에 대한 간단한 설명"
                style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db", borderRadius: 6, boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                썸네일 URL (선택)
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
                취소
              </button>
              <button
                type="submit"
                disabled={saveTplBusy}
                style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, background: saveTplBusy ? "#9ca3af" : "#228be6", color: "#fff", border: "none", borderRadius: 6, cursor: saveTplBusy ? "default" : "pointer" }}
              >
                {saveTplBusy ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUB TOOLBAR */}
      <div className="de-subtoolbar">
        {activeTab === "page" && (
          <>
          {siteLanguages.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginRight: 12, flexShrink: 0 }}>
              {siteLanguages.map((l) => {
                const targetPageId = langPageMap[l];
                const isActive = l === currentLang;
                const hasPage = !!targetPageId;
                return (
                  <button
                    key={l}
                    onClick={() => {
                      if (!isActive && hasPage) {
                        router.push(`/dashboard/site/pages/${targetPageId}/edit`);
                      }
                    }}
                    disabled={!hasPage}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 4,
                      border: isActive ? "2px solid #fff" : "1px solid transparent",
                      background: isActive ? "#4a90d9" : hasPage ? "#555" : "#333",
                      color: hasPage ? "#fff" : "#666",
                      fontWeight: isActive ? 700 : 400,
                      cursor: isActive ? "default" : hasPage ? "pointer" : "not-allowed",
                      transition: "all 0.15s",
                    }}
                    title={hasPage ? `${l.toUpperCase()} 버전 편집` : `${l.toUpperCase()} 페이지 없음`}
                  >
                    {l.toUpperCase()}
                  </button>
                );
              })}
            </div>
          )}
          <div className="de-page-tabs">
            {pages.map((p) => (
              <button
                key={p.id}
                className={`de-page-tab ${p.id === pageId ? "active" : ""}`}
                onClick={() => {
                  if (p.id !== pageId) {
                    router.push(`/dashboard/site/pages/${p.id}/edit`);
                  }
                }}
              >
                {p.title}
              </button>
            ))}
          </div>
          </>
        )}

        {activeTab === "object" && (
          <div className="de-object-panel">
            <button className="de-obj-btn" onClick={() => addElement("text")}>
              <span className="de-obj-icon">T</span>텍스트
            </button>
            <button className="de-obj-btn" onClick={() => addElement("image")}>
              <span className="de-obj-icon">&#x1F5BC;</span>이미지
            </button>
            <button className="de-obj-btn" onClick={() => addElement("box")}>
              <span className="de-obj-icon">&#x25A2;</span>박스
            </button>
            <button className="de-obj-btn" onClick={() => addElement("exhibition")}>
              <span className="de-obj-icon">&#x1F39E;</span>갤러리
            </button>
            <button className="de-obj-btn" onClick={() => addElement("board")}>
              <span className="de-obj-icon">&#x1F4CB;</span>게시판
            </button>
            <button className="de-obj-btn" onClick={() => addElement("product")}>
              <span className="de-obj-icon">&#x1F6D2;</span>상품
            </button>
            <button className="de-obj-btn" onClick={() => addElement("login")}>
              <span className="de-obj-icon">&#x1F464;</span>로그인
            </button>
            <button className="de-obj-btn" onClick={() => addElement("mail")}>
              <span className="de-obj-icon">&#x2709;</span>문의폼
            </button>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="de-settings-panel" style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap", padding: "8px 16px" }}>
            {/* Site info */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>사이트</span>
              <span style={{ fontSize: 13, color: "#ddd" }}>{siteName} | {currentLang.toUpperCase()}</span>
            </div>

            {/* Divider */}
            <span style={{ width: 1, height: 40, background: "#555", flexShrink: 0 }} />

            {/* Header / Logo */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>헤더 / 로고</span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="logo"
                    style={{ height: 24, maxWidth: 80, objectFit: "contain", borderRadius: 3, background: "#555" }}
                  />
                )}
                <button
                  onClick={handleLogoChange}
                  style={{ padding: "4px 10px", fontSize: 12, background: "#555", color: "#ddd", border: "1px solid #666", borderRadius: 4, cursor: "pointer" }}
                >
                  로고 변경
                </button>
                <button
                  onClick={handleResetHeader}
                  style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: "#999", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}
                >
                  헤더 초기화
                </button>
              </div>
            </div>

            {/* Divider */}
            <span style={{ width: 1, height: 40, background: "#555", flexShrink: 0 }} />

            {/* Menu Mode */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>메뉴 설정</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => handleMenuModeChange("auto")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    borderRadius: 4,
                    border: menuMode === "auto" ? "2px solid #4a90d9" : "1px solid #666",
                    background: menuMode === "auto" ? "#4a90d9" : "#444",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: menuMode === "auto" ? 600 : 400,
                  }}
                >
                  메뉴관리 자동
                </button>
                <button
                  onClick={() => handleMenuModeChange("custom")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    borderRadius: 4,
                    border: menuMode === "custom" ? "2px solid #4a90d9" : "1px solid #666",
                    background: menuMode === "custom" ? "#4a90d9" : "#444",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: menuMode === "custom" ? 600 : 400,
                  }}
                >
                  커스텀 수정
                </button>
              </div>
              <span style={{ fontSize: 11, color: "#777" }}>
                {menuMode === "auto" ? "메뉴관리 페이지에서 설정한 메뉴가 적용됩니다" : "더블클릭으로 메뉴를 직접 수정합니다"}
              </span>
            </div>

            {/* Divider */}
            <span style={{ width: 1, height: 40, background: "#555", flexShrink: 0 }} />

            {/* Footer */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1 }}>푸터</span>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  onClick={handleResetFooter}
                  style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: "#999", border: "1px solid #555", borderRadius: 4, cursor: "pointer" }}
                >
                  푸터 초기화
                </button>
                <span style={{ fontSize: 11, color: "#777", alignSelf: "center" }}>더블클릭으로 푸터 내용을 수정하세요</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "position" && selectedProps && (
          <div className="de-position-panel">
            <label>
              X: <input type="number" value={selectedProps.x}
                onChange={(e) => handlePropertyChange("x", e.target.value)} />
            </label>
            <label>
              Y: <input type="number" value={selectedProps.y}
                onChange={(e) => handlePropertyChange("y", e.target.value)} />
            </label>
            <label>
              W: <input type="number" value={selectedProps.w}
                onChange={(e) => handlePropertyChange("w", e.target.value)} />
            </label>
            <label>
              H: <input type="number" value={selectedProps.h}
                onChange={(e) => handlePropertyChange("h", e.target.value)} />
            </label>
            <label>
              Z: <input type="number" value={selectedProps.z}
                onChange={(e) => handlePropertyChange("z", e.target.value)} />
            </label>
            <div className="de-layer-btns">
              <button onClick={() => alignSelected("left")} title="왼쪽 정렬">&#x25C0;</button>
              <button onClick={() => alignSelected("center-h")} title="수평 중앙 정렬">&#x25C6;</button>
              <button onClick={() => alignSelected("right")} title="오른쪽 정렬">&#x25B6;</button>
              <span style={{ width: 1, background: "#555", margin: "0 2px", alignSelf: "stretch" }} />
              <button onClick={() => changeZIndex("top")} title="맨 앞으로">&#x2B06;&#x2B06;</button>
              <button onClick={() => changeZIndex("up")} title="앞으로">&#x2B06;</button>
              <button onClick={() => changeZIndex("down")} title="뒤로">&#x2B07;</button>
              <button onClick={() => changeZIndex("bottom")} title="맨 뒤로">&#x2B07;&#x2B07;</button>
              <span style={{ width: 1, background: "#555", margin: "0 2px", alignSelf: "stretch" }} />
              <button onClick={cloneSelected} title="복제">&#x1F4CB;</button>
              <button onClick={deleteSelected} title="삭제" className="de-del-btn">&#x1F5D1;</button>
            </div>
          </div>
        )}
        {activeTab === "position" && !selectedProps && (
          <div className="de-position-panel">
            <span className="de-settings-info">객체를 선택하세요</span>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === "ai" && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 16px", width: "100%" }}>
            {creditBalance !== null && (
              <a
                href="/dashboard/credits"
                title={`AI 편집 1회 = ${creditCost} C`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  color: creditBalance < creditCost ? "#f87171" : "#c4b5fd",
                  background: creditBalance < creditCost ? "rgba(239, 68, 68, 0.12)" : "rgba(124, 58, 237, 0.18)",
                  border: `1px solid ${creditBalance < creditCost ? "#ef4444" : "#7c3aed"}`,
                  borderRadius: 999,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span aria-hidden>✨</span>
                {creditBalance.toLocaleString()} C
              </a>
            )}
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder='예: 배경색을 검정색으로 변경해줘 / 배너 텍스트를 "봄 세일 50%"로 바꿔줘'
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  executeAiEdit();
                }
              }}
              style={{
                flex: 1,
                minHeight: 32,
                maxHeight: 80,
                padding: "6px 10px",
                fontSize: 13,
                background: "#333",
                color: "#eee",
                border: "1px solid #555",
                borderRadius: 6,
                resize: "vertical",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
              disabled={aiLoading}
            />
            <button
              onClick={executeAiEdit}
              disabled={aiLoading || !aiPrompt.trim()}
              style={{
                padding: "6px 16px",
                fontSize: 13,
                background: aiLoading ? "#555" : "#7c3aed",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: aiLoading ? "wait" : "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                opacity: !aiPrompt.trim() ? 0.5 : 1,
              }}
            >
              {aiLoading ? "처리중..." : `실행 (⌘↵) · ${creditCost}C`}
            </button>
            {aiStatus === "success" && aiPrevHtmlRef.current !== null && (
              <button
                onClick={undoAiEdit}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  background: "transparent",
                  color: "#f59e0b",
                  border: "1px solid #f59e0b",
                  borderRadius: 6,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                되돌리기
              </button>
            )}
            {aiStatus === "error" && (
              <span style={{ fontSize: 12, color: "#ef4444", flexShrink: 0 }}>{aiError}</span>
            )}
            {aiStatus === "success" && (
              <span style={{ fontSize: 12, color: "#22c55e", flexShrink: 0 }}>적용완료</span>
            )}
          </div>
        )}
      </div>

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
            {viewportMode === "mobile" ? "📱 모바일" : "🖥 데스크탑"}
          </span>
          <span className="dev">
            {viewportMode === "mobile" ? "375 × auto" : "1000 × auto"}
          </span>
        </div>

        <div
          className="de-canvas"
          ref={canvasRef}
          style={{
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: "top center",
          }}
        >
          <div className="de-canvas-content c_v_home_dft" id="de-canvas-inner">
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
              title="축소 (⌘−)"
              onClick={() => setZoom((z) => Math.max(25, z - 10))}
              aria-label="축소"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 8h10" />
              </svg>
            </button>
            <div className="de-zoom">{zoom}%</div>
            <button
              type="button"
              className="de-icon-btn"
              title="확대 (⌘+)"
              onClick={() => setZoom((z) => Math.min(400, z + 10))}
              aria-label="확대"
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
              title="화면 맞춤 (⇧1)"
              onClick={() => setZoom(100)}
              aria-label="화면 맞춤"
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
        <div className="de-tooltip">더블 클릭 하시면 해당객체를 수정하실 수 있습니다.</div>
      )}

      {/* Sprint 9j / 9k — Figma-style left component palette (fixed left rail) */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <LeftPalette
            onInsert={(type) => addElement(type)}
            onInsertSection={(presetId) => insertSectionPreset(presetId)}
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
          <InspectorPanel enabled={editorV2Enabled} />
        </Suspense>
      )}

      {/* (editorV2 disabled — no legacy rail render; InspectorPanel is the
          single source of truth for editor-v2 users.) */}

      {/* V2 CANVAS OVERLAY — rotation handle + align toolbar */}
      {editorV2Enabled && (
        <Suspense fallback={null}>
          <CanvasOverlay containerRef={bodyRef} />
        </Suspense>
      )}

      {/* TIPTAP EDITOR MODAL */}
      {tiptapTarget && (
        <Suspense fallback={
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, color: "#fff" }}>
            에디터 로딩 중...
          </div>
        }>
          <TiptapModal
            initialHtml={tiptapTarget.html}
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
            <h3 className="de-modal-title">퍼블리싱 완료!</h3>
            <p className="de-modal-desc">
              홈페이지가 성공적으로 게시되었습니다.
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
                미리보기
              </a>
              <button
                className="de-modal-btn secondary"
                onClick={() => setShowPublishModal(false)}
              >
                계속 편집
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
              크레딧이 부족합니다
            </h3>
            <p
              style={{
                fontSize: 14,
                color: "#4b5563",
                lineHeight: 1.6,
                margin: "0 0 24px",
              }}
            >
              이 작업에는 <b>{insufficientCredits.required} 크레딧</b>이 필요합니다.<br />
              현재 잔액: <b>{insufficientCredits.balance.toLocaleString()} C</b>
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
                크레딧 충전하러 가기
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
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sprint 9i — Status bar (Figma-style, bottom of editor) ═══ */}
      <div className="de-status-bar" aria-label="에디터 상태 표시줄">
        <span className={`item${saveStatus === "saved" ? " ok" : ""}`}>
          <span className="dot" />
          {saving
            ? "저장 중…"
            : saveStatus === "error"
              ? "저장 실패"
              : saveStatus === "saved"
                ? "저장됨 · 방금"
                : "모든 변경사항 저장됨"}
        </span>
        <span className="item">
          페이지 <span className="mono">{pageSlug}</span>
        </span>
        {editorV2Enabled && (
          <span className="item">
            요소 <span className="mono">{layerCount}</span>
          </span>
        )}
        <span className="item">
          언어 <span className="mono">{currentLang}</span>
        </span>
        <span className="spacer" />
        <span className="item cursor">
          커서{" "}
          <span className="mono">
            {cursorCoord ? `${cursorCoord[0]}, ${cursorCoord[1]}` : "—"}
          </span>
        </span>
        <span className="item">
          줌 <span className="mono">{zoom}%</span>
        </span>
        <span className="item">
          뷰포트 <span className="mono">{viewportMode === "mobile" ? "375" : "1000"}</span>
        </span>
      </div>
    </div>
  );
}
