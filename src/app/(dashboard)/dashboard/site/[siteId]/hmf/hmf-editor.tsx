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

/* ─── Types ─── */
type Device = "pc" | "tablet" | "mobile";

interface DeviceHmf {
  headerHtml: string;
  menuHtml: string;
  footerHtml: string;
}

interface HmfEditorProps {
  siteId: string;
  shopId: string;
  siteName: string;
  defaultLanguage: string;
  siteLanguages: string[];
  /** lang → device → HMF HTML */
  langHmfMap: Record<string, { pc: DeviceHmf; tablet: DeviceHmf; mobile: DeviceHmf }>;
  templateCss: string;
  cssText: string;
  templatePath: string;
  isModernCanvas: boolean;
  designCanvasWidth: number | null;
  editorMode: string | null; // "absolute" | "flow" | null
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
  handle: string;
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

const DEVICE_LABEL: Record<Device, string> = {
  pc: "PC",
  tablet: "Tablet",
  mobile: "Mobile",
};

const DEVICE_WIDTH: Record<Device, number> = {
  pc: 0,     // 0 = use designCanvasWidth ?? 1000
  tablet: 768,
  mobile: 375,
};

const DEVICE_ICON: Record<Device, string> = {
  pc: "fa-desktop",
  tablet: "fa-tablet-screen-button",
  mobile: "fa-mobile-screen-button",
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
  editorMode,
}: HmfEditorProps) {
  /* ─── State ─── */
  const [activeLang, setActiveLang] = useState(defaultLanguage || siteLanguages[0]);
  const [device, setDevice] = useState<Device>("pc");
  const [zoom, setZoom] = useState(100);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState("");
  /** 헤더 배경색 — "transparent"는 테마 배경 자동 상속 */
  const [headerBg, setHeaderBg] = useState<string>("transparent");

  /* ─── Refs ─── */
  const canvasRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  /* ─── HMF data for active lang + device ─── */
  const langData = langHmfMap[activeLang] ?? langHmfMap[defaultLanguage];
  const hmf: DeviceHmf = langData?.[device] ?? langData?.pc ?? {
    headerHtml: "",
    menuHtml: "",
    footerHtml: "",
  };

  /* ─── Parse existing header bg from site cssText on mount ─── */
  useEffect(() => {
    const re = /\/\* HNS-HEADER-LAYOUT:START \*\/[\s\S]*?\/\* HNS-HEADER-LAYOUT:END \*\//;
    const m = (cssText ?? "").match(re);
    if (m) {
      const bgMatch = m[0].match(/--hns-header-bg:\s*([^;]+);/);
      if (bgMatch) setHeaderBg(bgMatch[1].trim());
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Live-apply header bg to canvas ─── */
  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.style.background =
        headerBg && headerBg !== "transparent" ? headerBg : "";
    }
  }, [headerBg]);

  /* ─── Build updated Site.cssText with HNS-HEADER-LAYOUT block ─── */
  function buildUpdatedCssText(bg: string): string {
    const MARK_START = "/* HNS-HEADER-LAYOUT:START */";
    const MARK_END   = "/* HNS-HEADER-LAYOUT:END */";
    const bgLine =
      bg && bg !== "transparent"
        ? `  --hns-header-bg: ${bg};\n  #hns_header { background: var(--hns-header-bg); }\n`
        : "";
    const block = `${MARK_START}\n:root {\n${bgLine}  /* sticky:0 */\n}\n${MARK_END}`;
    const re = new RegExp(
      MARK_START.replace(/[/*]/g, "\\$&") + "[\\s\\S]*?" + MARK_END.replace(/[/*]/g, "\\$&")
    );
    const base = cssText ?? "";
    return re.test(base)
      ? base.replace(re, block)
      : base + (base.trim() ? "\n\n" : "") + block + "\n";
  }

  /* ─── Artboard width ─── */
  const isAbsolute = editorMode === "absolute" || (!editorMode && !isModernCanvas);
  const artboardWidth = isModernCanvas
    ? undefined
    : device === "pc"
    ? (designCanvasWidth ?? 1000)
    : DEVICE_WIDTH[device];

  /* ─── Fix legacy container heights ─── */
  const fixContainerHeights = useCallback(() => {
    if (isModernCanvas) return;

    requestAnimationFrame(() => {
      function measureAndFix(root: HTMLElement | null, minFallback = 0) {
        if (!root) return;
        const rootRect = root.getBoundingClientRect();
        let maxBottom = 0;
        root.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
          if (!root.contains(el)) return;
          const rect = el.getBoundingClientRect();
          const bottom = rect.bottom - rootRect.top;
          if (bottom > maxBottom) maxBottom = bottom;
        });
        const h = Math.max(maxBottom + 20, minFallback);
        if (h > 0) root.style.minHeight = h + "px";
        else root.style.minHeight = "";
      }

      measureAndFix(headerRef.current, 0);
      measureAndFix(menuRef.current, 0);

      const footerEl = footerRef.current;
      if (footerEl) {
        const footerContent = footerEl.querySelector(
          "#hns_footer_content"
        ) as HTMLElement | null;
        measureAndFix(footerContent ?? footerEl, 150);
      }
    });
  }, [isModernCanvas]);

  /* ─── Inject HMF HTML when lang or device switches ─── */
  useEffect(() => {
    // page.tsx 에서 menuHtml 을 headerHtml 안에 통합해 전달하므로
    // headerRef 하나에만 주입하면 됨 (published route 와 동일 구조).
    // menuRef 는 항상 비워 #hns_menu:empty CSS 로 자동 숨김.
    if (headerRef.current) headerRef.current.innerHTML = hmf.headerHtml;
    if (menuRef.current)   menuRef.current.innerHTML   = hmf.menuHtml; // "" (빈 문자열)
    if (footerRef.current) footerRef.current.innerHTML = hmf.footerHtml;
    setSelectedElId(null);
    setIsDirty(false);
    fixContainerHeights();
  }, [activeLang, device]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Build canvas CSS (scoped) ─── */
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
        // Strip ALL background / background-color declarations from the canvas root
        // so dark templates (e.g. body{background:#333}) don't paint the editor gray.
        result = result.replace(
          /(#hmf-canvas-inner\s*\{[^}]*?)background(?:-color)?\s*:[^;]+;?/gi,
          "$1"
        );
      }
      return result;
    };

    const hmfFixes = isModernCanvas
      ? `
        #hns_menu:empty { min-height: 0; display: none; }
        #hmf-canvas-inner { margin: 0; padding: 0; background-color: #ffffff !important; }
        #hns_header, #hns_body, #hns_footer { position: relative; }
        #hns_header { background-color: #ffffff; }
        .de-resize-handle { display: none !important; }
      `
      : `
        #hmf-canvas-inner { margin: 0; padding: 0; background-color: #ffffff !important; }
        #hns_header { position: relative; background-color: #ffffff; }
        #hns_body { position: relative; background-color: #ffffff; }
        #hns_footer { position: static; }
        #hns_menu:empty { display: none; }
        #hns_footer_content { top: 0 !important; position: relative !important; }
        #hns_footer > .dragable { top: auto !important; position: relative !important; }
        .de-resize-handle { display: none !important; }
        .c_v_home_dft {
          overflow-x: hidden;
          overflow-y: visible;
          ${isModernCanvas ? "" : `width: ${artboardWidth ?? 1000}px !important; margin: 0 auto !important;`}
        }
      `;

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
  }, [templateCss, cssText, templatePath, isModernCanvas, artboardWidth]);

  /* ─── Canvas scale helper ─── */
  const getCanvasScale = useCallback(() => zoom / 100, [zoom]);

  /* ─── Drag start ─── */
  function startDragOnElement(
    target: HTMLElement,
    clientX: number,
    clientY: number
  ) {
    const dragable = target.closest(".dragable") as HTMLElement | null;
    if (!dragable) return;
    const placeholder = document.getElementById("hmf-body-placeholder");
    if (placeholder?.contains(dragable)) return;
    const cs = window.getComputedStyle(dragable);
    const origLeft = parseFloat(cs.left) || 0;
    const origTop = parseFloat(cs.top) || 0;
    applySelection(dragable);
    dragRef.current = { el: dragable, startX: clientX, startY: clientY, origLeft, origTop };
  }

  /* ─── Selection helper ─── */
  function applySelection(el: HTMLElement | null) {
    document.querySelectorAll(".hmf-de-selected").forEach((e) => e.classList.remove("hmf-de-selected"));
    document.querySelectorAll(".hmf-resize-handle").forEach((h) => h.remove());
    if (!el) { setSelectedElId(null); return; }
    el.classList.add("hmf-de-selected");
    setSelectedElId(el.id || el.className);
    ["n", "ne", "e", "se", "s", "sw", "w", "nw"].forEach((h) => {
      const handle = document.createElement("div");
      handle.className = `hmf-resize-handle hmf-handle-${h}`;
      handle.setAttribute("data-handle", h);
      el.appendChild(handle);
    });
  }

  /* ─── Drag events on HMF containers ─── */
  useEffect(() => {
    const containers = [headerRef.current, menuRef.current, footerRef.current];
    function handleDown(e: MouseEvent | TouchEvent) {
      const target = e.target as HTMLElement;
      if (target.classList.contains("hmf-resize-handle")) return;
      if (target.closest('[contenteditable="true"]')) return;
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const touch = (e as TouchEvent).touches[0];
        if (!touch) return;
        clientX = touch.clientX; clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY;
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
      e.preventDefault(); e.stopPropagation();
      const handle = target.getAttribute("data-handle") || "";
      const el = target.parentElement as HTMLElement;
      if (!el) return;
      const cs = window.getComputedStyle(el);
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const touch = (e as TouchEvent).touches[0];
        if (!touch) return;
        clientX = touch.clientX; clientY = touch.clientY;
      } else {
        clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY;
      }
      resizeRef.current = {
        el, handle, startX: clientX, startY: clientY,
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
        if (r.handle.includes("e"))  r.el.style.width = Math.max(30, r.origWidth + dx) + "px";
        if (r.handle.includes("w")) { r.el.style.width = Math.max(30, r.origWidth - dx) + "px"; r.el.style.left = r.origLeft + dx + "px"; }
        if (r.handle.includes("s"))  r.el.style.height = Math.max(20, r.origHeight + dy) + "px";
        if (r.handle.includes("n")) { r.el.style.height = Math.max(20, r.origHeight - dy) + "px"; r.el.style.top = r.origTop + dy + "px"; }
        setIsDirty(true);
      }
    }
    function onMouseMove(e: MouseEvent) { handleMove(e.clientX, e.clientY); }
    function onTouchMove(e: TouchEvent) {
      if (!dragRef.current && !resizeRef.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX, touch.clientY);
    }
    function onEnd() { dragRef.current = null; resizeRef.current = null; }
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

  /* ─── Canvas click: deselect / block links ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function handleCanvasClick(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".dragable")) applySelection(null);
    }
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

  /* ─── Keyboard: nudge / ESC / Delete ─── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { applySelection(null); return; }
      if (!selectedElId) return;
      const el = document.getElementById(selectedElId) ||
        document.querySelector(".hmf-de-selected") as HTMLElement | null;
      if (!el) return;
      if ((e.key === "Delete" || e.key === "Backspace") &&
          !(e.target as HTMLElement).closest('[contenteditable="true"]')) {
        e.preventDefault(); applySelection(null); el.remove(); setIsDirty(true); return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const cs = window.getComputedStyle(el);
        if (e.key === "ArrowUp")    el.style.top  = parseFloat(cs.top)  - step + "px";
        if (e.key === "ArrowDown")  el.style.top  = parseFloat(cs.top)  + step + "px";
        if (e.key === "ArrowLeft")  el.style.left = parseFloat(cs.left) - step + "px";
        if (e.key === "ArrowRight") el.style.left = parseFloat(cs.left) + step + "px";
        setIsDirty(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedElId]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true); setSaveError(""); setSaveOk(false);
    try {
      const cleanup = (container: HTMLDivElement | null) => {
        if (!container) return "";
        container.querySelectorAll(".hmf-resize-handle").forEach((h) => h.remove());
        container.querySelectorAll(".hmf-de-selected").forEach((el) => el.classList.remove("hmf-de-selected"));
        return container.innerHTML;
      };
      const headerHtml = cleanup(headerRef.current);
      const menuHtml   = cleanup(menuRef.current);
      const footerHtml = cleanup(footerRef.current);

      const updatedCssText = buildUpdatedCssText(headerBg);
      const res = await fetch(`/api/sites/${siteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headerHtml, menuHtml, footerHtml,
          hmfLang: activeLang, hmfDevice: device,
          cssText: updatedCssText,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `저장 실패 (${res.status})`);
      }
      setIsDirty(false); setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
      setSelectedElId(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, siteId, activeLang, device]);

  /* ─── Ctrl/Cmd+S ─── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave]);

  /* ─── Device / lang switch guard ─── */
  function confirmSwitch(msg: string): boolean {
    if (!isDirty) return true;
    return confirm(`저장하지 않은 변경사항이 있습니다.\n${msg} 전환하면 변경사항이 사라집니다. 계속하시겠습니까?`);
  }

  /* ─── Render ─── */
  return (
    <div className="hmf-root">
      {/* ── Toolbar ── */}
      <header className="hmf-toolbar">
        <div className="hmf-toolbar-left">
          <Link href={`/dashboard/site/settings?id=${siteId}`} className="hmf-back-btn" title="사이트 설정으로 이동">
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
          {/* PC/Tablet/Mobile 탭 — 절대좌표 모드에서만 */}
          {isAbsolute && (
            <div className="hmf-device-group">
              {(["pc", "tablet", "mobile"] as Device[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`hmf-device-btn${device === d ? " active" : ""}`}
                  title={`${DEVICE_LABEL[d]} (${d === "pc" ? (designCanvasWidth ?? 1000) : DEVICE_WIDTH[d]}px)`}
                  onClick={() => {
                    if (!confirmSwitch(`${DEVICE_LABEL[d]}으로`)) return;
                    setDevice(d);
                  }}
                >
                  <i className={`fa-solid ${DEVICE_ICON[d]}`} />
                  <span>{DEVICE_LABEL[d]}</span>
                  <small>{d === "pc" ? `${designCanvasWidth ?? 1000}px` : `${DEVICE_WIDTH[d]}px`}</small>
                </button>
              ))}
            </div>
          )}

          {/* 공지 배너 (디바이스 탭 없을 때) */}
          {!isAbsolute && (
            <div className="hmf-notice">
              <i className="fa-solid fa-circle-info" style={{ fontSize: 11, color: "#60a5fa" }} />
              &nbsp;여기서 저장하면 <strong>모든 페이지</strong>에 즉시 적용됩니다
            </div>
          )}
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
                    if (!confirmSwitch(`${LANG_LABEL[lang] ?? lang}으로`)) return;
                    setActiveLang(lang);
                  }}
                >
                  {LANG_LABEL[lang] || lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* 헤더 배경색 */}
          <div className="hmf-header-bg-group">
            <span className="hmf-header-bg-label">헤더 배경</span>
            <label
              className="hmf-header-bg-swatch"
              title="헤더 배경색 선택"
              style={{
                background: headerBg !== "transparent" ? headerBg : undefined,
              }}
            >
              {headerBg === "transparent" && (
                <span className="hmf-header-bg-auto">자동</span>
              )}
              <input
                type="color"
                className="hmf-header-bg-input"
                value={headerBg !== "transparent" ? headerBg : "#ffffff"}
                onChange={(e) => {
                  setHeaderBg(e.target.value);
                  setIsDirty(true);
                }}
              />
            </label>
            {headerBg !== "transparent" && (
              <button
                type="button"
                className="hmf-header-bg-reset"
                title="배경색 초기화 (테마 배경색 자동 사용)"
                onClick={() => {
                  setHeaderBg("transparent");
                  setIsDirty(true);
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* 줌 */}
          <div className="hmf-zoom-group">
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom((z) => Math.max(25, z - 10))} title="축소">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 8h10" /></svg>
            </button>
            <span className="hmf-zoom-val">{zoom}%</span>
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom((z) => Math.min(200, z + 10))} title="확대">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
            </button>
            <button type="button" className="hmf-zoom-btn" onClick={() => setZoom(100)} title="100%">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
            </button>
          </div>

          {/* 저장 */}
          <button
            type="button"
            className={`hmf-save-btn${saveOk ? " ok" : ""}${!!saveError ? " err" : ""}`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "저장 중…" : saveOk ? "✓ 저장됨" : isDirty ? "저장하기 *" : "저장하기"}
          </button>
        </div>
      </header>

      {/* 절대좌표 모드 공지 (디바이스 탭 아래) */}
      {isAbsolute && (
        <div className="hmf-device-notice">
          <i className="fa-solid fa-circle-info" style={{ fontSize: 10 }} />
          &nbsp;
          <strong>{DEVICE_LABEL[device]}</strong> 레이아웃을 편집 중입니다. 저장하면 이 디바이스에만 적용됩니다 (다른 디바이스는 독립 레이아웃).
        </div>
      )}

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
          <style id="hmf-canvas-css" dangerouslySetInnerHTML={{ __html: canvasCss }} />

          <div
            className={`hmf-canvas-inner c_v_home_dft${isModernCanvas ? " is-modern" : ""}`}
            id="hmf-canvas-inner"
            style={artboardWidth ? { width: artboardWidth } : undefined}
          >
            {/* ── 헤더 섹션 레이블 ── */}
            <div className="hmf-area-label hmf-area-header" aria-hidden="true">
              <i className="fa-solid fa-chevron-up" style={{ fontSize: 9 }} />
              &nbsp;헤더 영역 (로고·메뉴 포함)
            </div>

            {/*
              published route 구조: <div id="hns_header">{headerHtml}{menuHtml}</div>
              page.tsx 에서 menuHtml 을 headerHtml 안으로 통합해 전달하므로
              여기선 headerRef 하나에 전체 헤더+메뉴가 렌더링됨.
              menuRef(#hns_menu)는 항상 비어 있어 CSS #hns_menu:empty 로 자동 숨김.
            */}
            <div id="hns_header" ref={headerRef} />
            <div id="hns_menu" ref={menuRef} />

            {/* ── 페이지 본문 플레이스홀더 ── */}
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

            {/* ── 풋터 섹션 레이블 ── */}
            <div className="hmf-area-label hmf-area-footer" aria-hidden="true">
              <i className="fa-solid fa-chevron-down" style={{ fontSize: 9 }} />
              &nbsp;풋터 영역
            </div>

            <div id="hns_footer" ref={footerRef} />
          </div>
        </div>

        {/* 아트보드 레이블 */}
        <div className="hmf-artboard-label">
          {isAbsolute
            ? `${artboardWidth ?? designCanvasWidth ?? 1000}px × auto (${DEVICE_LABEL[device]})`
            : isModernCanvas
            ? "100% × auto (Responsive)"
            : `${artboardWidth ?? 1000}px × auto`}
        </div>
      </div>

      {/* ── 하단 힌트 ── */}
      <div className="hmf-footer-hint">
        <span>드래그로 위치 이동</span>
        <span className="sep">·</span>
        <span>모서리 핸들로 크기 조정</span>
        <span className="sep">·</span>
        <span>방향키 1px (Shift: 10px)</span>
        <span className="sep">·</span>
        <span>Del 삭제</span>
        <span className="sep">·</span>
        <span>⌘S 저장</span>
      </div>
    </div>
  );
}
