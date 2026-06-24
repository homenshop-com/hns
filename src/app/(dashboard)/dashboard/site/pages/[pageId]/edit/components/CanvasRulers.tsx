/**
 * CanvasRulers — Figma/Photoshop-style horizontal + vertical rulers on the
 * canvas edges, PLUS drag-out guides (기준선).
 *
 * Rulers:
 *  - Read zoom (prop) + scrollLeft/Top (wrapper) + the artboard's top-left
 *    offset so "0" lines up with the artboard top-left. Ticks every 10px
 *    (minor) / 50 (mid) / 100 (major + label in CANVAS coords).
 *
 * Guides (Photoshop convention):
 *  - Drag DOWN from the TOP ruler → a horizontal guide; drag RIGHT from the
 *    LEFT ruler → a vertical guide. Drag an existing guide to move it; drop it
 *    back onto its ruler to delete it. Coordinates are shown live.
 *  - Persisted per page in localStorage so they survive reload.
 *
 * Coordinate mapping (canvas px `c` ↔ wrapper px `w`):
 *   w = originOffset + c * scale   |   c = (w - originOffset) / scale
 * where originOffset = artboard edge within the wrapper, scale = zoom/100.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  /** Ref to the canvas scroll container (the overflow:auto wrapper). */
  wrapperRef: React.RefObject<HTMLElement | null>;
  /** Ref to the artboard element whose top-left is the ruler's origin. */
  originRef: React.RefObject<HTMLElement | null>;
  /** Current zoom 25..400 (100 = no scale). */
  zoom: number;
  /** Page id — namespaces the persisted guides in localStorage. */
  pageId: string;
}

const RULER_THICKNESS = 20;
const MINOR_STEP = 10;
const MID_STEP = 50;
const MAJOR_STEP = 100;
const DELETE_EDGE = 10; // drop within RULER+this of the ruler → delete

const COLOR_BG = "#121319";
const COLOR_LINE_2 = "#2f3245";
const COLOR_TICK = "#3a3d50";
const COLOR_LABEL = "#8a8fa3";
const GUIDE_COLOR = "#00d8ff";

type Guide = { id: string; axis: "h" | "v"; pos: number };
type Metrics = { offX: number; offY: number; scale: number; vw: number; vh: number };

export default function CanvasRulers({ wrapperRef, originRef, zoom, pageId }: Props) {
  const horizRef = useRef<HTMLCanvasElement | null>(null);
  const vertRef = useRef<HTMLCanvasElement | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const dragRef = useRef<{ axis: "h" | "v"; id: string | null } | null>(null);
  const storageKey = `hns-guides:${pageId}`;

  // Load persisted guides.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setGuides(raw ? (JSON.parse(raw) as Guide[]) : []);
    } catch {
      setGuides([]);
    }
  }, [storageKey]);

  const save = useCallback(
    (next: Guide[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
    },
    [storageKey],
  );

  // Compute the artboard origin (within the wrapper) + scale.
  const measure = useCallback((): Metrics | null => {
    const wrapper = wrapperRef.current;
    const origin = originRef.current;
    if (!wrapper || !origin) return null;
    const wr = wrapper.getBoundingClientRect();
    const or = origin.getBoundingClientRect();
    return {
      offX: or.left - wr.left,
      offY: or.top - wr.top,
      scale: zoom / 100,
      vw: wr.width,
      vh: wr.height,
    };
  }, [wrapperRef, originRef, zoom]);

  // Draw rulers + keep `metrics` in sync on zoom / scroll / resize.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const horiz = horizRef.current;
    const vert = vertRef.current;
    if (!wrapper || !horiz || !vert) return;

    const draw = () => {
      const m = measure();
      if (m) setMetrics(m);
      const dpr = window.devicePixelRatio || 1;
      const wrapperRect = wrapper.getBoundingClientRect();
      // clientHeight/Width = the VIEWPORT content box (excludes scrollbar) — the
      // reliable span the ruler must cover. getBoundingClientRect can drift.
      const vpW = wrapper.clientWidth || wrapperRect.width;
      const vpH = wrapper.clientHeight || wrapperRect.height;
      const origin = originRef.current;
      const originRect = origin?.getBoundingClientRect();
      const scale = zoom / 100;

      // Explicit inline size (canvas is a REPLACED element — CSS left/right alone
      // won't stretch it). Align ticks to each canvas's OWN position so "0" lines
      // up with the artboard regardless of the corner gutter.
      const paint = (cv: HTMLCanvasElement, horizontal: boolean) => {
        const thick = RULER_THICKNESS;
        const len = horizontal ? vpW : vpH;
        const dispW = horizontal ? len : thick;
        const dispH = horizontal ? thick : len;
        cv.style.width = `${dispW}px`;
        cv.style.height = `${dispH}px`;
        cv.width = Math.round(dispW * dpr);
        cv.height = Math.round(dispH * dpr);
        const cr = cv.getBoundingClientRect();
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, dispW, dispH);
        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, dispW, dispH);
        ctx.strokeStyle = COLOR_LINE_2;
        ctx.beginPath();
        if (horizontal) { ctx.moveTo(0, thick - 0.5); ctx.lineTo(len, thick - 0.5); }
        else { ctx.moveTo(thick - 0.5, 0); ctx.lineTo(thick - 0.5, len); }
        ctx.stroke();
        const off = originRect ? (horizontal ? originRect.left - cr.left : originRect.top - cr.top) : 0;
        const cAtStart = -off / scale;
        const cAtEnd = (len - off) / scale;
        const start = Math.floor(cAtStart / MINOR_STEP) * MINOR_STEP;
        const end = Math.ceil(cAtEnd / MINOR_STEP) * MINOR_STEP;
        ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = "top";
        for (let c = start; c <= end; c += MINOR_STEP) {
          const s = off + c * scale;
          if (s < 0 || s > len) continue;
          const major = c % MAJOR_STEP === 0;
          const mid = c % MID_STEP === 0;
          const t = major ? 10 : mid ? 6 : 3;
          ctx.strokeStyle = COLOR_TICK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          if (horizontal) { ctx.moveTo(s + 0.5, thick); ctx.lineTo(s + 0.5, thick - t); }
          else { ctx.moveTo(thick, s + 0.5); ctx.lineTo(thick - t, s + 0.5); }
          ctx.stroke();
          if (major) {
            ctx.fillStyle = c === 0 ? "#5be5b3" : COLOR_LABEL;
            if (horizontal) ctx.fillText(String(c), s + 2, 2);
            else { ctx.save(); ctx.translate(2, s + 11); ctx.fillText(String(c), 0, 0); ctx.restore(); }
          }
        }
      };
      paint(horiz, true);
      paint(vert, false);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    const origin = originRef.current;
    if (origin) ro.observe(origin);
    wrapper.addEventListener("scroll", draw, { passive: true });
    window.addEventListener("resize", draw);
    return () => {
      ro.disconnect();
      wrapper.removeEventListener("scroll", draw);
      window.removeEventListener("resize", draw);
    };
  }, [zoom, wrapperRef, originRef, measure]);

  // ── Guide drag: create (from ruler) / move / delete ───────────────────
  const beginDrag = useCallback(
    (axis: "h" | "v", id: string | null, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { axis, id };
      const posFromEvent = (ev: PointerEvent): number | null => {
        const wrapper = wrapperRef.current;
        const m = measure();
        if (!wrapper || !m) return null;
        const wr = wrapper.getBoundingClientRect();
        const local = axis === "h" ? ev.clientY - wr.top - m.offY : ev.clientX - wr.left - m.offX;
        return Math.round(local / m.scale);
      };
      const onMove = (ev: PointerEvent) => {
        const pos = posFromEvent(ev);
        if (pos == null) return;
        setGuides((prev) => {
          if (id) return prev.map((g) => (g.id === id ? { ...g, pos } : g));
          const has = prev.some((g) => g.id === "__drag");
          const ng: Guide = { id: "__drag", axis, pos };
          return has ? prev.map((g) => (g.id === "__drag" ? ng : g)) : [...prev, ng];
        });
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        dragRef.current = null;
        const wrapper = wrapperRef.current;
        if (!wrapper) return;
        const wr = wrapper.getBoundingClientRect();
        const overRuler =
          axis === "h"
            ? ev.clientY - wr.top < RULER_THICKNESS + DELETE_EDGE
            : ev.clientX - wr.left < RULER_THICKNESS + DELETE_EDGE;
        const pos = posFromEvent(ev);
        setGuides((prev) => {
          let next: Guide[];
          if (id) {
            next = overRuler ? prev.filter((g) => g.id !== id) : prev.map((g) => (g.id === id && pos != null ? { ...g, pos } : g));
          } else {
            next = prev.filter((g) => g.id !== "__drag");
            if (!overRuler && pos != null) {
              next = [...next, { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, axis, pos }];
            }
          }
          save(next);
          return next;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [measure, wrapperRef, save],
  );

  const m = metrics;

  return (
    <>
      <canvas
        ref={horizRef}
        className="de-ruler de-ruler-h"
        style={{ pointerEvents: "auto", cursor: "ns-resize" }}
        onPointerDown={(e) => beginDrag("h", null, e)}
        aria-hidden
      />
      <canvas
        ref={vertRef}
        className="de-ruler de-ruler-v"
        style={{ pointerEvents: "auto", cursor: "ew-resize" }}
        onPointerDown={(e) => beginDrag("v", null, e)}
        aria-hidden
      />
      <div className="de-ruler-corner" aria-hidden />
      {/* Guides */}
      {m &&
        guides.map((g) => {
          if (g.axis === "h") {
            const top = m.offY + g.pos * m.scale;
            if (top < RULER_THICKNESS) return null;
            return (
              <div
                key={g.id}
                onPointerDown={(e) => beginDrag("h", g.id, e)}
                title={`y: ${g.pos}px`}
                style={{
                  position: "absolute", left: RULER_THICKNESS, right: 0, top: top - 3,
                  height: 7, zIndex: 5, cursor: "ns-resize", pointerEvents: "auto",
                }}
              >
                <div style={{ position: "absolute", top: 3, left: 0, right: 0, height: 1, background: GUIDE_COLOR }} />
              </div>
            );
          }
          const left = m.offX + g.pos * m.scale;
          if (left < RULER_THICKNESS) return null;
          return (
            <div
              key={g.id}
              onPointerDown={(e) => beginDrag("v", g.id, e)}
              title={`x: ${g.pos}px`}
              style={{
                position: "absolute", top: RULER_THICKNESS, bottom: 0, left: left - 3,
                width: 7, zIndex: 5, cursor: "ew-resize", pointerEvents: "auto",
              }}
            >
              <div style={{ position: "absolute", left: 3, top: 0, bottom: 0, width: 1, background: GUIDE_COLOR }} />
            </div>
          );
        })}
    </>
  );
}
