/**
 * CanvasOverlay — fixed-position gizmos rendered on top of the design
 * canvas:
 *   • Rotation handle (single selection) — drag to rotate via atan2 from
 *     the element's visual center. Commits to the store via setTransform.
 *   • Align toolbar (2+ selection) — 6 buttons (left/centerH/right/top/
 *     middleV/bottom) that call alignLayers().
 *
 * The overlay measures selected elements on every store change using
 * getBoundingClientRect() so rotation already applied to the DOM is
 * respected. It renders in a portal-free fixed layer above the canvas.
 */

"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useEditorStore, type AlignMode } from "../store/editor-store";
import { snapResize, type Rect as SnapRect } from "../store/snap";

interface Props {
  /** The canvas content element — used to scope element lookups and to
   *  detect when the canvas hasn't mounted yet. Usually `bodyRef.current`
   *  or the shared canvas container ref. */
  containerRef: React.RefObject<HTMLElement | null>;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Element center in viewport coords. */
  cx: number;
  cy: number;
}

/** Measure the element's visible rect (already transformed). */
function measureEl(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    cx: r.left + r.width / 2,
    cy: r.top + r.height / 2,
  };
}

export default function CanvasOverlay({ containerRef }: Props) {
  const [primary, setPrimary] = useState<string | null>(useEditorStore.getState().selectedId);
  const [multi, setMulti] = useState<Set<string>>(useEditorStore.getState().multiSelectedIds);
  const [tick, setTick] = useState(0); // re-measure trigger
  const rafRef = useRef<number | null>(null);

  // Subscribe to store: selection or scene changes → remeasure.
  useEffect(() => {
    const unsub = useEditorStore.subscribe((s) => {
      setPrimary((prev) => (prev === s.selectedId ? prev : s.selectedId));
      setMulti((prev) => (prev === s.multiSelectedIds ? prev : s.multiSelectedIds));
      setTick((t) => t + 1);
    });
    return unsub;
  }, []);

  // Also listen to window resize / scroll to keep gizmos pinned.
  useEffect(() => {
    const onReflow = () => setTick((t) => t + 1);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, []);

  const container = containerRef.current;
  const selectedIds = primary
    ? [primary, ...Array.from(multi).filter((x) => x !== primary)]
    : Array.from(multi);
  const single = selectedIds.length === 1 ? selectedIds[0] : null;
  const multiMode = selectedIds.length >= 2;

  // Measure single-selection element rect.
  // Sprint 9a — also track whether the element is flow-positioned so
  // we can suppress resize/rotation handles (operating on a flow
  // section collapses it — see editor-store setFrame notes).
  const [singleRect, setSingleRect] = useState<Rect | null>(null);
  const [singleIsFlow, setSingleIsFlow] = useState(false);
  const [singleIsInline, setSingleIsInline] = useState(false);
  useLayoutEffect(() => {
    if (!single || !container) {
      setSingleRect(null);
      setSingleIsFlow(false);
      setSingleIsInline(false);
      return;
    }
    const el = container.ownerDocument.getElementById(single);
    if (!el) {
      setSingleRect(null);
      setSingleIsFlow(false);
      setSingleIsInline(false);
      return;
    }
    setSingleRect(measureEl(el));
    const pos = container.ownerDocument.defaultView?.getComputedStyle(el).position ?? "";
    setSingleIsFlow(pos !== "absolute" && pos !== "fixed");
    // Flow-inline text elements (<span>, <a>, etc.) — resize via width
    // doesn't make sense (text reflows), but rotation still does.
    const tag = el.tagName;
    setSingleIsInline(tag !== "DIV" && tag !== "SECTION" && tag !== "ARTICLE");
  }, [single, container, tick]);

  // Measure multi-selection union bbox for toolbar placement.
  const [multiAnchor, setMultiAnchor] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!multiMode || !container) { setMultiAnchor(null); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    let found = 0;
    for (const id of selectedIds) {
      const el = container.ownerDocument.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.left < minX) minX = r.left;
      if (r.top < minY) minY = r.top;
      if (r.right > maxX) maxX = r.right;
      found++;
    }
    if (found < 2) { setMultiAnchor(null); return; }
    setMultiAnchor({ left: (minX + maxX) / 2, top: minY });
  }, [multiMode, selectedIds, container, tick]);

  /* ── Rotation drag ── */
  const dragState = useRef<{
    id: string;
    cx: number;
    cy: number;
    startAngle: number;
    startRotate: number;
  } | null>(null);

  const onRotateStart = useCallback((e: React.PointerEvent) => {
    if (!single || !singleRect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const s = useEditorStore.getState();
    // Find current layer rotate
    const findLayer = (root: any): any => {
      if (root.id === single) return root;
      if (root.type === "group") for (const c of root.children) {
        const f = findLayer(c); if (f) return f;
      }
      return null;
    };
    const layer = findLayer(s.scene.root);
    const startRotate = layer?.transform?.rotate ?? 0;
    const dx = e.clientX - singleRect.cx;
    const dy = e.clientY - singleRect.cy;
    // atan2 returns radians from +X axis. We use the gizmo above the
    // element, so "straight up" is -π/2 — we record start angle and
    // only apply deltas, so the absolute zero doesn't matter.
    const startAngle = Math.atan2(dy, dx);
    dragState.current = {
      id: single,
      cx: singleRect.cx,
      cy: singleRect.cy,
      startAngle,
      startRotate,
    };
  }, [single, singleRect]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d) return;
      const angle = Math.atan2(e.clientY - d.cy, e.clientX - d.cx);
      let deltaDeg = ((angle - d.startAngle) * 180) / Math.PI;
      let next = d.startRotate + deltaDeg;
      // Snap to 15° when Shift held.
      if (e.shiftKey) next = Math.round(next / 15) * 15;
      // Normalize to [-180, 180].
      next = ((next + 180) % 360 + 360) % 360 - 180;
      // Throttle via rAF.
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        useEditorStore.getState().setTransform(d.id, { rotate: next });
      });
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /* ── Resize drag (8 handles) ── */
  const resizeState = useRef<{
    id: string;
    handle: string;
    startX: number;
    startY: number;
    startFrame: { x: number; y: number; w: number; h: number };
    /** Sibling rects in the same container-local coord system as startFrame. */
    siblings: SnapRect[];
  } | null>(null);
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });

  const onResizeStart = useCallback((handle: string) => (e: React.PointerEvent) => {
    if (!single || !container) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const s = useEditorStore.getState();
    const findLayer = (root: any): any => {
      if (root.id === single) return root;
      if (root.type === "group") for (const c of root.children) {
        const f = findLayer(c); if (f) return f;
      }
      return null;
    };
    const layer = findLayer(s.scene.root);
    if (!layer) return;

    // Collect sibling rects from DOM (in viewport coords → converted into
    // layer-frame coord space via the container's top-left offset).
    const containerRect = container.getBoundingClientRect();
    const siblings: SnapRect[] = [];
    container.querySelectorAll<HTMLElement>(".dragable").forEach((el) => {
      if (!el.id || el.id === single) return;
      const r = el.getBoundingClientRect();
      siblings.push({
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        w: r.width,
        h: r.height,
      });
    });

    // Flow-positioned layers (sections) typically have frame 0/0/0/0
    // because no inline width/height was authored. Measure the DOM
    // rect as the true starting frame so resize deltas are meaningful.
    const domEl = container.ownerDocument.getElementById(single);
    let startFrame = { ...layer.frame };
    if (domEl && (startFrame.w === 0 || startFrame.h === 0)) {
      const r = domEl.getBoundingClientRect();
      startFrame = {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        w: r.width,
        h: r.height,
      };
    }

    resizeState.current = {
      id: single,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startFrame,
      siblings,
    };
  }, [single, container]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const r = resizeState.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      const dy = e.clientY - r.startY;
      const hasW = r.handle.includes("w");
      const hasE = r.handle.includes("e");
      const hasN = r.handle.includes("n");
      const hasS = r.handle.includes("s");

      let { x, y, w, h } = r.startFrame;
      if (hasE) w = r.startFrame.w + dx;
      if (hasW) { x = r.startFrame.x + dx; w = r.startFrame.w - dx; }
      if (hasS) h = r.startFrame.h + dy;
      if (hasN) { y = r.startFrame.y + dy; h = r.startFrame.h - dy; }
      // Clamp min size.
      if (w < 4) { if (hasW) x -= (4 - w); w = 4; }
      if (h < 4) { if (hasN) y -= (4 - h); h = 4; }

      // Snap (unless Alt held to override).
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (!e.altKey) {
        const snapped = snapResize({ x, y, w, h }, r.handle, r.siblings);
        x = snapped.x; y = snapped.y; w = snapped.w; h = snapped.h;
        guideX = snapped.guideX;
        guideY = snapped.guideY;
      }
      setGuides({ x: guideX, y: guideY });

      useEditorStore.getState().setFrame(r.id, { x, y, w, h });
    };
    const onUp = () => {
      resizeState.current = null;
      setGuides({ x: null, y: null });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  /* ── Align toolbar actions ── */
  const doAlign = useCallback((mode: AlignMode) => {
    useEditorStore.getState().alignLayers(selectedIds, mode);
  }, [selectedIds]);

  if (!container) return null;

  const ROTATE_OFFSET = 28; // px above element's top edge

  return (
    <>
      {/* Single-selection resize handles.
          - Hidden for inline text layers (span/a) where width resize would
            fight text flow.
          - For flow-positioned layers (sections + atomic children inside
            sections): only E / S / SE are useful — the other five would
            try to move the top-left corner, which isn't meaningful when
            the layer is placed by normal flow. We hide them to keep the
            resize UX honest. Sections keep full w/h resize; atomic flow
            children get the same set.
          - Absolute/fixed dragables: all 8 handles. */}
      {single && singleRect && !singleIsInline && (
        <>
          {(singleIsFlow
            ? (["e", "se", "s"] as const)
            : (["nw","n","ne","e","se","s","sw","w"] as const)
          ).map((h) => {
            const pos = handlePosition(h, singleRect);
            return (
              <div
                key={h}
                className={`de-overlay-resize de-overlay-resize-${h}`}
                style={{
                  position: "fixed",
                  left: pos.left - 5,
                  top: pos.top - 5,
                  width: 10,
                  height: 10,
                  background: "#fff",
                  border: "1.5px solid #2a79ff",
                  borderRadius: 2,
                  zIndex: 9400,
                  cursor: cursorFor(h),
                  pointerEvents: "auto",
                }}
                onPointerDown={onResizeStart(h)}
              />
            );
          })}
        </>
      )}

      {/* Snap guide lines */}
      {guides.x !== null && (
        <div
          style={{
            position: "fixed",
            left: guides.x,
            top: 0,
            width: 1,
            height: "100vh",
            background: "#ff00aa",
            zIndex: 9300,
            pointerEvents: "none",
          }}
        />
      )}
      {guides.y !== null && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: guides.y,
            width: "100vw",
            height: 1,
            background: "#ff00aa",
            zIndex: 9300,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Single-selection rotation handle. Shown for all selectable
          layer types (dragable, section, inline) — rotation via
          transform is visual-only and doesn't break flow layout. */}
      {single && singleRect && (
        <div
          className="de-overlay-rotate"
          style={{
            position: "fixed",
            left: singleRect.cx - 10,
            top: singleRect.top - ROTATE_OFFSET,
            width: 20,
            height: 20,
            zIndex: 9500,
            pointerEvents: "auto",
          }}
          onPointerDown={onRotateStart}
          title="드래그: 회전 · Shift 드래그: 15° 스냅"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" style={{ display: "block" }}>
            <circle cx="10" cy="10" r="8" fill="#2a79ff" stroke="#fff" strokeWidth="2" />
            <path d="M 6 10 A 4 4 0 1 1 10 14" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M 10 14 L 12.5 12 L 11 15 Z" fill="#fff" />
          </svg>
          {/* Connector line down to element */}
          <div
            style={{
              position: "absolute",
              left: 9,
              top: 20,
              width: 2,
              height: ROTATE_OFFSET - 20,
              background: "#2a79ff",
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      {/* Multi-selection align toolbar */}
      {multiMode && multiAnchor && (
        <div
          className="de-overlay-align"
          style={{
            position: "fixed",
            left: multiAnchor.left,
            top: multiAnchor.top - 44,
            transform: "translateX(-50%)",
            zIndex: 9500,
            display: "flex",
            gap: 2,
            padding: 3,
            background: "#1a1a2e",
            border: "1px solid #2a79ff",
            borderRadius: 6,
            boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AlignBtn mode="left"    label="왼쪽 정렬"     onClick={doAlign} icon="L" />
          <AlignBtn mode="centerH" label="가로 가운데"   onClick={doAlign} icon="C" />
          <AlignBtn mode="right"   label="오른쪽 정렬"   onClick={doAlign} icon="R" />
          <div style={{ width: 1, background: "#333", margin: "2px 2px" }} />
          <AlignBtn mode="top"     label="위쪽 정렬"     onClick={doAlign} icon="T" />
          <AlignBtn mode="middleV" label="세로 가운데"   onClick={doAlign} icon="M" />
          <AlignBtn mode="bottom"  label="아래쪽 정렬"   onClick={doAlign} icon="B" />
        </div>
      )}
    </>
  );
}

function handlePosition(h: string, r: Rect): { left: number; top: number } {
  const midX = r.left + r.width / 2;
  const midY = r.top + r.height / 2;
  const right = r.left + r.width;
  const bottom = r.top + r.height;
  switch (h) {
    case "nw": return { left: r.left,  top: r.top };
    case "n":  return { left: midX,    top: r.top };
    case "ne": return { left: right,   top: r.top };
    case "e":  return { left: right,   top: midY };
    case "se": return { left: right,   top: bottom };
    case "s":  return { left: midX,    top: bottom };
    case "sw": return { left: r.left,  top: bottom };
    case "w":  return { left: r.left,  top: midY };
    default:   return { left: midX,    top: midY };
  }
}

function cursorFor(h: string): string {
  switch (h) {
    case "n": case "s": return "ns-resize";
    case "e": case "w": return "ew-resize";
    case "ne": case "sw": return "nesw-resize";
    case "nw": case "se": return "nwse-resize";
    default: return "default";
  }
}

function AlignBtn({
  mode, label, onClick, icon,
}: {
  mode: AlignMode;
  label: string;
  onClick: (m: AlignMode) => void;
  icon: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onClick(mode)}
      style={{
        width: 26, height: 26,
        background: "transparent",
        color: "#e0e0e0",
        border: "1px solid transparent",
        borderRadius: 4,
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onMouseEnter={(e) => { (e.currentTarget.style.background = "#2a79ff"); }}
      onMouseLeave={(e) => { (e.currentTarget.style.background = "transparent"); }}
    >
      {/* Inline SVG glyph for each mode. Icon param unused for now but
          retained so the button renders distinctly even if SVGs fail. */}
      <AlignGlyph mode={mode} fallback={icon} />
    </button>
  );
}

function AlignGlyph({ mode, fallback }: { mode: AlignMode; fallback: string }) {
  const stroke = "currentColor";
  const sw = 1.5;
  switch (mode) {
    case "left":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="2" x2="2" y2="14" stroke={stroke} strokeWidth={sw}/><rect x="3" y="4" width="7" height="3" fill={stroke}/><rect x="3" y="9" width="10" height="3" fill={stroke}/></svg>
      );
    case "centerH":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="8" y1="2" x2="8" y2="14" stroke={stroke} strokeWidth={sw}/><rect x="4.5" y="4" width="7" height="3" fill={stroke}/><rect x="3" y="9" width="10" height="3" fill={stroke}/></svg>
      );
    case "right":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="14" y1="2" x2="14" y2="14" stroke={stroke} strokeWidth={sw}/><rect x="6" y="4" width="7" height="3" fill={stroke}/><rect x="3" y="9" width="10" height="3" fill={stroke}/></svg>
      );
    case "top":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="2" x2="14" y2="2" stroke={stroke} strokeWidth={sw}/><rect x="4" y="3" width="3" height="7" fill={stroke}/><rect x="9" y="3" width="3" height="10" fill={stroke}/></svg>
      );
    case "middleV":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="8" x2="14" y2="8" stroke={stroke} strokeWidth={sw}/><rect x="4" y="4.5" width="3" height="7" fill={stroke}/><rect x="9" y="3" width="3" height="10" fill={stroke}/></svg>
      );
    case "bottom":
      return (
        <svg width="16" height="16" viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="14" stroke={stroke} strokeWidth={sw}/><rect x="4" y="6" width="3" height="7" fill={stroke}/><rect x="9" y="3" width="3" height="10" fill={stroke}/></svg>
      );
    default:
      return <span>{fallback}</span>;
  }
}
