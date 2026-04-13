"use client";

import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import "./editor-styles.css";

const TiptapModal = lazy(() => import("./tiptap-modal"));

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
}: DesignEditorProps) {
  const router = useRouter();

  // State
  const [currentBodyHtml, setCurrentBodyHtml] = useState(bodyHtml);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"page" | "object" | "settings" | "position">("page");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [publishing, setPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [tiptapTarget, setTiptapTarget] = useState<{ elId: string; html: string } | null>(null);
  const tiptapElRef = useRef<HTMLElement | null>(null);

  // Header/Menu/Footer settings
  const [menuMode, setMenuMode] = useState<"auto" | "custom">("auto");
  const [logoUrl, setLogoUrl] = useState("");

  // Drag state
  const dragRef = useRef<{
    el: HTMLElement;
    startX: number;
    startY: number;
    origLeft: number;
    origTop: number;
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
      // Get the current body HTML from the canvas
      const bodyEl = bodyRef.current;
      const html = bodyEl ? bodyEl.innerHTML : currentBodyHtml;

      // Save page body
      const res = await fetch(`/api/sites/${siteId}/pages/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { html },
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
  }, [siteId, pageId, currentBodyHtml, currentLang, menuMode]);

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
      if (!selectedElId || editingTextId) return;

      const el = document.getElementById(selectedElId);
      if (!el) return;

      const step = e.shiftKey ? 10 : 1;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (e.ctrlKey || e.metaKey) {
          el.remove();
          setSelectedElId(null);
        }
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const top = parseInt(el.style.top) || 0;
        const left = parseInt(el.style.left) || 0;
        if (e.key === "ArrowUp") el.style.top = (top - step) + "px";
        if (e.key === "ArrowDown") el.style.top = (top + step) + "px";
        if (e.key === "ArrowLeft") el.style.left = (left - step) + "px";
        if (e.key === "ArrowRight") el.style.left = (left + step) + "px";
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
  function startDragOnElement(target: HTMLElement, clientX: number, clientY: number) {
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (!dragable) {
      setSelectedElId(null);
      setEditingTextId(null);
      return;
    }
    if ((target as HTMLElement).dataset?.resizeHandle) return;

    if (!dragable.id) {
      dragable.id = "el_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    }

    setSelectedElId(dragable.id);

    const computedStyle = window.getComputedStyle(dragable);
    dragRef.current = {
      el: dragable,
      startX: clientX,
      startY: clientY,
      origLeft: parseInt(computedStyle.left) || parseInt(dragable.style.left) || 0,
      origTop: parseInt(computedStyle.top) || parseInt(dragable.style.top) || 0,
    };
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
      startDragOnElement(e.target as HTMLElement, e.clientX, e.clientY);
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
      if ("touches" in me) {
        const touch = me.touches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = me.clientX;
        clientY = me.clientY;
      }
      const target = e.target as HTMLElement;
      if (!target.closest(".dragable")) return;
      me.preventDefault();
      startDragOnElement(target, clientX, clientY);
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
      const scale = getCanvasScale();
      if (dragRef.current) {
        const { el, startX, startY, origLeft, origTop } = dragRef.current;
        const dx = (clientX - startX) / scale;
        const dy = (clientY - startY) / scale;
        el.style.left = (origLeft + dx) + "px";
        el.style.top = (origTop + dy) + "px";
      }
      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = (clientX - r.startX) / scale;
        const dy = (clientY - r.startY) / scale;
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

    if (!selectedElId) return;
    const el = document.getElementById(selectedElId);
    if (!el) return;

    el.classList.add("de-selected");

    // Add resize handles (mouse + touch)
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
  }, [selectedElId]);

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
    const style = window.getComputedStyle(el);
    // Legacy dragable: position absolute + no structural children
    if (style.position === "absolute") return true;
    // If it has no child elements at all (text-only), it's simple
    if (el.children.length === 0) return true;
    // If it has only inline children (span, a, strong, em, br, img), it's simple
    const structural = el.querySelectorAll("div, section, article, aside, main, ul, ol, table, form, header, nav, footer, h1, h2, h3, h4, h5, h6");
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
    if (leafText) return leafText;

    // Try .dragable — but only if it's a simple one (legacy absolute positioned)
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (dragable && body.contains(dragable) && isSimpleDragable(dragable)) {
      return dragable;
    }

    // For complex dragables (custom template section wrappers),
    // find the first text element the user likely intended to edit
    if (dragable && body.contains(dragable)) {
      // Find the nearest text element to where the user clicked
      el = target;
      while (el && el !== dragable) {
        if (TEXT_TAGS.has(el.tagName)) return el;
        el = el.parentElement;
      }
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
      // For text-level elements (h1-h6, p, span, a, etc.), TipTap wraps output in <p> tags.
      // Strip the outer <p> wrapper to preserve the original element's tag.
      if (TEXT_TAGS.has(el.tagName) && el.tagName !== "LI") {
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

  /* ─── Add new element ─── */
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
  const scopeAndRewrite = (css: string) => css
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
    // Strip body background-image (legacy bg.jpg/tm.gif don't render properly)
    .replace(
      /(#de-canvas-inner\s*\{[^}]*?)background\s*:\s*url\([^)]*\)[^;]*;?/gi,
      "$1"
    )
    // Rewrite relative url() to absolute /tpl/ paths
    .replace(
      /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
      (_, filename: string) => `url(${tplFilesBase}/${filename})`
    );
  const canvasCss = [templateCss, cssText, pageCss]
    .filter(Boolean)
    .map(scopeAndRewrite)
    .join("\n");

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
          </nav>
        </div>
        <div className="de-header-right">
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
        </div>
      </header>

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
              <button onClick={() => changeZIndex("top")} title="맨 앞으로">&#x2B06;&#x2B06;</button>
              <button onClick={() => changeZIndex("up")} title="앞으로">&#x2B06;</button>
              <button onClick={() => changeZIndex("down")} title="뒤로">&#x2B07;</button>
              <button onClick={() => changeZIndex("bottom")} title="맨 뒤로">&#x2B07;&#x2B07;</button>
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
      </div>

      {/* CANVAS */}
      <div className="de-canvas-wrapper">
        <div className="de-canvas" ref={canvasRef}>
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
      </div>

      {/* TOOLTIP for double-click */}
      {selectedElId && !editingTextId && (
        <div className="de-tooltip">더블 클릭 하시면 해당객체를 수정하실 수 있습니다.</div>
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
    </div>
  );
}
