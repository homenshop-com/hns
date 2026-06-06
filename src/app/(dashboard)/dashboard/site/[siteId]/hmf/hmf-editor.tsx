"use client";

import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import Link from "next/link";
import "./hmf-editor.css";

/* ─── Props ─── */
interface HmfEditorProps {
  siteId: string;
  shopId: string;
  siteName: string;
  defaultLanguage: string;
  siteLanguages: string[];
  langHmfMap: Record<
    string,
    { headerHtml: string; menuHtml: string; footerHtml: string }
  >;
  templateCss: string;
  cssText: string;
  templatePath: string;
  isModernCanvas: boolean;
  designCanvasWidth: number | null;
}

/* ─── Drag / Resize state ─── */
interface DragState {
  el: HTMLElement;
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  moved?: boolean;
}

interface ResizeState {
  el: HTMLElement;
  handle: string; // n/ne/e/se/s/sw/w/nw
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  origWidth: number;
  origHeight: number;
  moved?: boolean;
}

const LANG_LABEL: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-cn": "简体中文",
  "zh-tw": "繁體中文",
  es: "Español",
};

export default function HmfEditor({
  siteId,
  shopId,
  siteName,
  defaultLanguage,
  siteLanguages,
  langHmfMap,
  templateCss,
  cssText,
  templatePath,
  isModernCanvas,
  designCanvasWidth,
}: HmfEditorProps) {
  /* ─── State ─── */
  const [activeLang, setActiveLang] = useState(defaultLanguage || siteLanguages[0]);
  const [zoom, setZoom] = useState(100);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* ─── Refs ─── */
  const canvasRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  /* ─── HMF data for active language ─── */
  const hmf = langHmfMap[activeLang] ?? langHmfMap[defaultLanguage] ?? {
    headerHtml: "",
    menuHtml: "",
    footerHtml: "",
  };

  /* ─── Inject HMF HTML when language switches ─── */
  useEffect(() => {
    if (headerRef.current) headerRef.current.innerHTML = hmf.headerHtml;
    if (menuRef.current) menuRef.current.innerHTML = hmf.menuHtml;
    if (footerRef.current) footerRef.current.innerHTML = hmf.footerHtml;
    setSelectedElId(null);
    setIsDirty(false);
  }, [activeLang]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Build canvas CSS (scoped, like design-editor's scopeAndRewrite) ─── */
  const canvasCss = useMemo(() => {
    const tplFilesBase = templatePath ? `/tpl/${templatePath}/files` : "";

    const scopeAndRewrite = (css: string, stripBg = false) => {
      if (!css) return "";
      let result = css
        .replace(
          /(?<![a-zA-Z-])body\s*,([\s\S]*?)\{/g,
          (_m: string, sels: string) => {
            const scoped = sels
              .split(",")
              .map((s: string) => `#hmf-canvas-inner ${s.trim()}`)
              .join(", ");
            return `#hmf-canvas-inner, ${scoped} {`;
          }
        )
        .replace(/(?<![a-zA-Z-])body\s*\{/g, "#hmf-canvas-inner {")
        .replace(/overflow\s*:\s*scroll/g, "overflow: visible")
        .replace(/overflow-x\s*:\s*hidden/g, "overflow-x: visible");
      if (tplFilesBase) {
        result = result.replace(
          /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
          (_: string, filename: string) => `url(${tplFilesBase}/${filename})`
        );
      }
      if (stripBg) {
        result = result.replace(
          /(#hmf-canvas-inner\s*\{[^}]*?)background\s*:\s*url\([^)]*\)[^;]*;?/gi,
          "$1"
        );
      }
      return result;
    };

    // HMF-specific layout fixes (mirrors published route's publishedCss)
    const hmfFixes = isModernCanvas
      ? `
        #hns_menu:empty { min-height: 0; display: none; }
        #hmf-canvas-inner { margin: 0; padding: 0; }
        #hns_header, #hns_body, #hns_footer { position: relative; }
        .de-resize-handle { display: none !important; }
      `
      : `
        #hmf-canvas-inner { margin: 0; padding: 0; }
        #hns_header { position: relative; }
        #hns_body { position: relative; }
        #hns_footer { position: static; }
        #hns_menu:empty { display: none; }
        #hns_footer_content { top: 0 !important; position: relative !important; }
        #hns_footer > .dragable { top: auto !important; position: relative !important; }
        .de-resize-handle { display: none !important; }
        .c_v_home_dft {
          overflow-x: hidden;
          overflow-y: visible;
          ${isModernCanvas ? "" : `width: ${designCanvasWidth ?? 1000}px !important; margin: 0 auto !important;`}
        }
      `;

    // Selection highlight
    const selectionCss = `
      .hmf-de-selected {
        outline: 2px solid #4a90d9 !important;
        outline-offset: 1px;
      }
      #hmf-canvas-inner .dragable { cursor: move; }
    `;

    return [
      scopeAndRewrite(templateCss, true),
      scopeAndRewrite(cssText),
      hmfFixes,
      selectionCss,
    ]
      .filter(Boolean)
      .join("\n");
  }, [templateCss, cssText, templatePath, isModernCanvas, designCanvasWidth]);

  /* ─── Canvas scale helper ─── */
  const getCanvasScale = useCallback(() => {
    if (!canvasRef.current) return 1;
    return zoom / 100;
  }, [zoom]);

  /* ─── Drag/resize start ─── */
  function startDragOnElement(
    target: HTMLElement,
    clientX: number,
    clientY: number
  ) {
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (!dragable) return;

    // Exclude body placeholder
    const placeholder = document.getElementById("hmf-body-placeholder");
    if (placeholder?.contains(dragable)) return;

    const cs = window.getComputedStyle(dragable);
    const origLeft = parseFloat(cs.left) || 0;
    const origTop = parseFloat(cs.top) || 0;

    // Remove old handles, apply new selection
    applySelection(dragable);

    dragRef.current = {
      el: dragable,
      startX: clientX,
      startY: clientY,
      origLeft,
      origTop,
    };
  }

  /* ─── Selection helper ─── */
  function applySelection(el: HTMLElement | null) {
    // Clear previous selection
    document
      .querySelectorAll(".hmf-de-selected")
      .forEach((e) => e.classList.remove("hmf-de-selected"));
    document
      .querySelectorAll(".hmf-resize-handle")
      .forEach((h) => h.remove());

    if (!el) {
      setSelectedElId(null);
      return;
    }

    el.classList.add("hmf-de-selected");
    setSelectedElId(el.id || el.className);

    // Inject 8 resize handles
    const handles = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
    handles.forEach((h) => {
      const handle = document.createElement("div");
      handle.className = `hmf-resize-handle hmf-handle-${h}`;
      handle.setAttribute("data-handle", h);
      el.appendChild(handle);
    });
  }

  /* ─── Attach drag events to HMF containers ─── */
  useEffect(() => {
    const containers = [headerRef.current, menuRef.current, footerRef.current];

    function handleDown(e: MouseEvent | TouchEvent) {
      let clientX: number, clientY: number;
      const target = e.target as HTMLElement;
      if (target.classList.contains("hmf-resize-handle")) return; // handled separately
      if (target.closest('[contenteditable="true"]')) return;
      if ("touches" in e) {
        const touch = (e as TouchEvent).touches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }
      if (!target.closest(".dragable")) return;
      e.preventDefault();
      startDragOnElement(target, clientX, clientY);
    }

    containers.forEach((c) => {
      c?.addEventListener("mousedown", handleDown);
      c?.addEventListener("touchstart", handleDown as EventListener, { passive: false });
    });
    return () => {
      containers.forEach((c) => {
        c?.removeEventListener("mousedown", handleDown);
        c?.removeEventListener("touchstart", handleDown as EventListener);
      });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Resize handle events ─── */
  useEffect(() => {
    const containers = [headerRef.current, menuRef.current, footerRef.current];

    function handleResizeDown(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement;
      if (!target.classList.contains("hmf-resize-handle")) return;
      e.preventDefault();
      e.stopPropagation();

      const handle = target.getAttribute("data-handle") || "";
      const el = target.parentElement as HTMLElement;
      if (!el) return;

      const cs = window.getComputedStyle(el);
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const touch = (e as TouchEvent).touches[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX;
        clientY = (e as MouseEvent).clientY;
      }

      resizeRef.current = {
        el,
        handle,
        startX: clientX,
        startY: clientY,
        origLeft: parseFloat(cs.left) || 0,
        origTop: parseFloat(cs.top) || 0,
        origWidth: el.offsetWidth,
        origHeight: el.offsetHeight,
      };
    }

    containers.forEach((c) => {
      c?.addEventListener("mousedown", handleResizeDown);
      c?.addEventListener("touchstart", handleResizeDown as EventListener, { passive: false });
    });
    return () => {
      containers.forEach((c) => {
        c?.removeEventListener("mousedown", handleResizeDown);
        c?.removeEventListener("touchstart", handleResizeDown as EventListener);
      });
    };
  }, []);

  /* ─── Global mouse/touch move & up ─── */
  useEffect(() => {
    function handleMove(clientX: number, clientY: number) {
      const scale = getCanvasScale();

      if (dragRef.current) {
        const { el, startX, startY, origLeft, origTop } = dragRef.current;
        const dx = (clientX - startX) / scale;
        const dy = (clientY - startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragRef.current.moved = true;
        if (!dragRef.current.moved) return;
        el.style.left = origLeft + dx + "px";
        el.style.top = origTop + dy + "px";
        setIsDirty(true);
      }

      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = (clientX - r.startX) / scale;
        const dy = (clientY - r.startY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) r.moved = true;
        if (!r.moved) return;
        if (r.handle.includes("e"))
          r.el.style.width = Math.max(30, r.origWidth + dx) + "px";
        if (r.handle.includes("w")) {
          r.el.style.width = Math.max(30, r.origWidth - dx) + "px";
          r.el.style.left = r.origLeft + dx + "px";
        }
        if (r.handle.includes("s"))
          r.el.style.height = Math.max(20, r.origHeight + dy) + "px";
        if (r.handle.includes("n")) {
          r.el.style.height = Math.max(20, r.origHeight - dy) + "px";
          r.el.style.top = r.origTop + dy + "px";
        }
        setIsDirty(true);
      }
    }

    function onMouseMove(e: MouseEvent) {
      handleMove(e.clientX, e.clientY);
    }
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
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchend", onEnd);
    };
  }, [getCanvasScale]);

  /* ─── Click on canvas background: deselect ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handleCanvasClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".dragable")) {
        applySelection(null);
      }
    }
    // Block link navigation inside canvas
    function blockLinks(e: Event) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (anchor) { e.preventDefault(); e.stopPropagation(); }
    }
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("click", blockLinks, true);
    canvas.addEventListener("auxclick", blockLinks, true);
    return () => {
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("click", blockLinks, true);
      canvas.removeEventListener("auxclick", blockLinks, true);
    };
  }, []);

  /* ─── Keyboard: arrow key nudge + ESC deselect + Delete ─── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        applySelection(null);
        return;
      }
      if (!selectedElId) return;
      const el = document.getElementById(selectedElId) ||
        document.querySelector(`.hmf-de-selected`) as HTMLElement | null;
      if (!el) return;

      // Delete
      if ((e.key === "Delete" || e.key === "Backspace") &&
          !(e.target as HTMLElement).closest('[contenteditable="true"]')) {
        e.preventDefault();
        applySelection(null);
        el.remove();
        setIsDirty(true);
        return;
      }

      // Arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const cs = window.getComputedStyle(el);
        const top = parseFloat(cs.top) || 0;
        const left = parseFloat(cs.left) || 0;
        if (e.key === "ArrowUp") el.style.top = top - step + "px";
        if (e.key === "ArrowDown") el.style.top = top + step + "px";
        if (e.key === "ArrowLeft") el.style.left = left - step + "px";
        if (e.key === "ArrowRight") el.style.left = left + step + "px";
        setIsDirty(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElId]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSaveError("");
    setSaveOk(false);
    try {
      // Clean up editor UI from DOM before reading innerHTML
      const cleanup = (container: HTMLDivElement | null) => {
        if (!container) return "";
        container
          .querySelectorAll(".hmf-resize-handle")
          .forEach((h) => h.remove());
        container
          .querySelectorAll(".hmf-de-selected")
          .forEach((el) => el.classList.remove("hmf-de-selected"));
        return container.innerHTML;
      };

      const headerHtml = cleanup(headerRef.current);
      const menuHtml = cleanup(menuRef.current);
      const footerHtml = cleanup(footerRef.current);

      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headerHtml,
          menuHtml,
          footerHtml,
          hmfLang: activeLang,
        }),
      });

      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `저장 실패 (${res.status})`);
      }

      setIsDirty(false);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      setSelectedElId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, siteId, activeLang]);

  /* ─── Keyboard shortcut: Ctrl/Cmd+S ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  /* ─── Artboard width ─── */
  const artboardWidth = designCanvasWidth ?? (isModernCanvas ? undefined : 1000);

  /* ─── Render ─── */
  return (
    <div className="hmf-root">
      {/* ── Toolbar ── */}
      <header className="hmf-toolbar">
        <div className="hmf-toolbar-left">
          <Link href={`/dashboard/site/settings?id=${siteId}`} className="hmf-back-btn" title="설정으로 돌아가기">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </Link>
          <div className="hmf-toolbar-title">
            <span className="hmf-site-name">{siteName}</span>
            <span className="hmf-mode-badge">헤더/풋터 편집</span>
          </div>
        </div>

        <div className="hmf-toolbar-center">
          {/* 공지 배너 */}
          <div className="hmf-notice">
            <i className="fa-solid fa-circle-info" style={{ fontSize: 11, color: "#60a5fa" }} />
            &nbsp;여기서 저장하면 <strong>모든 페이지</strong>에 즉시 적용됩니다
          </div>
        </div>

        <div className="hmf-toolbar-right">
          {/* 언어 선택 */}
          {siteLanguages.length > 1 && (
            <div className="hmf-lang-group">
              {siteLanguages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`hmf-lang-btn${lang === activeLang ? " active" : ""}`}
                  onClick={() => {
                    if (isDirty && !confirm("저장하지 않은 변경사항이 있습니다. 언어를 전환하면 변경사항이 사라집니다. 계속하시겠습니까?")) return;
                    setActiveLang(lang);
                  }}
                >
                  {LANG_LABEL[lang] || lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* 줌 */}
          <div className="hmf-zoom-group">
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom((z) => Math.max(25, z - 10))} title="축소 (-)">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3 8h10" />
              </svg>
            </button>
            <span className="hmf-zoom-val">{zoom}%</span>
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom((z) => Math.min(200, z + 10))} title="확대 (+)">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
            </button>
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom(100)} title="100%로 초기화">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
              </svg>
            </button>
          </div>

          {/* 저장 */}
          <button
            type="button"
            className={`hmf-save-btn${saveOk ? " ok" : ""}${!!saveError ? " err" : ""}`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving
              ? "저장 중…"
              : saveOk
              ? "✓ 저장됨"
              : isDirty
              ? "저장하기 *"
              : "저장하기"}
          </button>
        </div>
      </header>

      {saveError && (
        <div className="hmf-error-bar">
          <i className="fa-solid fa-triangle-exclamation" /> {saveError}
          <button type="button" onClick={() => setSaveError("")} className="hmf-error-close">✕</button>
        </div>
      )}

      {/* ── Canvas wrapper ── */}
      <div ref={canvasWrapperRef} className="hmf-canvas-wrapper">
        <div
          ref={canvasRef}
          className={`hmf-canvas${isModernCanvas ? " is-modern" : ""}`}
          style={{
            transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
            transformOrigin: "top center",
            ...(artboardWidth ? { width: artboardWidth } : {}),
          }}
        >
          {/* Canvas CSS */}
          <style
            id="hmf-canvas-css"
            dangerouslySetInnerHTML={{ __html: canvasCss }}
          />

          <div
            className={`hmf-canvas-inner c_v_home_dft${isModernCanvas ? " is-modern" : ""}`}
            id="hmf-canvas-inner"
            style={artboardWidth ? { width: artboardWidth } : undefined}
          >
            {/* HEADER — ref로만 관리, DOM 직접 업데이트 */}
            <div id="hns_header" ref={headerRef} />

            {/* MENU — ref로만 관리 */}
            <div id="hns_menu" ref={menuRef} />

            {/* BODY PLACEHOLDER — 편집 불가 영역 */}
            <div
              id="hmf-body-placeholder"
              className="hmf-body-placeholder"
              style={artboardWidth ? { width: artboardWidth } : undefined}
            >
              <div className="hmf-body-placeholder-inner">
                <i className="fa-solid fa-file-lines" aria-hidden="true" />
                <span>페이지 본문 영역</span>
                <small>페이지 에디터에서 편집하세요</small>
              </div>
            </div>

            {/* FOOTER — ref로만 관리 */}
            <div id="hns_footer" ref={footerRef} />
          </div>
        </div>

        {/* 아트보드 레이블 */}
        <div className="hmf-artboard-label">
          <span>
            {isModernCanvas ? "100% × auto" : `${artboardWidth ?? 1000} × auto`}
          </span>
        </div>
      </div>

      {/* ── 하단 힌트 ── */}
      <div className="hmf-footer-hint">
        <span>드래그로 위치 이동</span>
        <span className="sep">·</span>
        <span>모서리 핸들로 크기 조정</span>
        <span className="sep">·</span>
        <span>방향키로 1px 이동 (Shift: 10px)</span>
        <span className="sep">·</span>
        <span>Del 키로 삭제</span>
        <span className="sep">·</span>
        <span>⌘S / Ctrl+S 저장</span>
      </div>
    </div>
  );
}
