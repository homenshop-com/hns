/**
 * CanvasRulers — Figma-style horizontal + vertical rulers on the canvas
 * edges. Matches the design delivered in "Editor Canvas.html".
 *
 * Synchronization:
 *  - Reads zoom from props (0–400, 100 = no scale).
 *  - Reads scrollLeft/scrollTop from the canvas wrapper (passed by ref).
 *  - Reads the artboard's top-left offset relative to the wrapper so the
 *    ruler's "0" lines up with the artboard top-left (not the wrapper).
 *
 * Tick rules:
 *  - Minor tick every 10 screen-px (short mark, no label).
 *  - Mid tick every 50 screen-px (medium mark).
 *  - Major tick every 100 screen-px (long mark + numeric label in
 *    CANVAS coordinates — always reflect the un-zoomed dimension so the
 *    user thinks in artboard units).
 *  - Label is drawn in JetBrains Mono 10px.
 *
 * Redraw triggers:
 *  - Zoom change (parent prop)
 *  - Wrapper scroll event
 *  - Window resize
 *  - DPR change (for crisp retina output)
 */

"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Ref to the canvas scroll container (the overflow:auto wrapper). */
  wrapperRef: React.RefObject<HTMLElement | null>;
  /** Ref to the artboard element whose top-left is the ruler's origin. */
  originRef: React.RefObject<HTMLElement | null>;
  /** Current zoom 25..400 (100 = no scale). */
  zoom: number;
}

const RULER_THICKNESS = 20;
const MINOR_STEP = 10;
const MID_STEP = 50;
const MAJOR_STEP = 100;

const COLOR_BG = "#121319";
const COLOR_LINE = "#24263195";
const COLOR_LINE_2 = "#2f3245";
const COLOR_TICK = "#3a3d50";
const COLOR_LABEL = "#8a8fa3";

export default function CanvasRulers({ wrapperRef, originRef, zoom }: Props) {
  const horizRef = useRef<HTMLCanvasElement | null>(null);
  const vertRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const horiz = horizRef.current;
    const vert = vertRef.current;
    if (!wrapper || !horiz || !vert) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const wrapperRect = wrapper.getBoundingClientRect();
      const origin = originRef.current;
      const originRect = origin?.getBoundingClientRect();
      const originLeftInWrapper = originRect
        ? originRect.left - wrapperRect.left
        : 0;
      const originTopInWrapper = originRect
        ? originRect.top - wrapperRect.top
        : 0;

      const scale = zoom / 100;

      /* ── Horizontal ── */
      {
        const w = wrapperRect.width;
        const h = RULER_THICKNESS;
        horiz.width = w * dpr;
        horiz.height = h * dpr;
        horiz.style.width = `${w}px`;
        horiz.style.height = `${h}px`;
        const ctx = horiz.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = COLOR_LINE_2;
        ctx.beginPath();
        ctx.moveTo(0, h - 0.5);
        ctx.lineTo(w, h - 0.5);
        ctx.stroke();

        // Canvas coord at the wrapper left edge
        // screenX = originLeftInWrapper + canvasX * scale
        // canvasX = (screenX - originLeftInWrapper) / scale
        const canvasXAtLeft = -originLeftInWrapper / scale;
        const canvasXAtRight = (w - originLeftInWrapper) / scale;

        // Start from first multiple of MINOR_STEP ≥ canvasXAtLeft
        const start = Math.floor(canvasXAtLeft / MINOR_STEP) * MINOR_STEP;
        const end = Math.ceil(canvasXAtRight / MINOR_STEP) * MINOR_STEP;

        ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
        ctx.textBaseline = "top";
        for (let cx = start; cx <= end; cx += MINOR_STEP) {
          const sx = originLeftInWrapper + cx * scale;
          if (sx < 0 || sx > w) continue;
          const major = cx % MAJOR_STEP === 0;
          const mid = cx % MID_STEP === 0;
          const tickH = major ? 10 : mid ? 6 : 3;
          ctx.strokeStyle = COLOR_TICK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx + 0.5, h);
          ctx.lineTo(sx + 0.5, h - tickH);
          ctx.stroke();
          if (major && cx !== 0) {
            ctx.fillStyle = COLOR_LABEL;
            ctx.fillText(String(cx), sx + 2, 2);
          }
          if (cx === 0) {
            ctx.fillStyle = "#5be5b3";
            ctx.fillText("0", sx + 2, 2);
          }
        }
      }

      /* ── Vertical ── */
      {
        const w = RULER_THICKNESS;
        const h = wrapperRect.height;
        vert.width = w * dpr;
        vert.height = h * dpr;
        vert.style.width = `${w}px`;
        vert.style.height = `${h}px`;
        const ctx = vert.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        ctx.fillStyle = COLOR_BG;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = COLOR_LINE_2;
        ctx.beginPath();
        ctx.moveTo(w - 0.5, 0);
        ctx.lineTo(w - 0.5, h);
        ctx.stroke();

        const canvasYAtTop = -originTopInWrapper / scale;
        const canvasYAtBottom = (h - originTopInWrapper) / scale;
        const start = Math.floor(canvasYAtTop / MINOR_STEP) * MINOR_STEP;
        const end = Math.ceil(canvasYAtBottom / MINOR_STEP) * MINOR_STEP;

        ctx.font = '9.5px "JetBrains Mono", ui-monospace, monospace';
        for (let cy = start; cy <= end; cy += MINOR_STEP) {
          const sy = originTopInWrapper + cy * scale;
          if (sy < 0 || sy > h) continue;
          const major = cy % MAJOR_STEP === 0;
          const mid = cy % MID_STEP === 0;
          const tickW = major ? 10 : mid ? 6 : 3;
          ctx.strokeStyle = COLOR_TICK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(w, sy + 0.5);
          ctx.lineTo(w - tickW, sy + 0.5);
          ctx.stroke();
          if (major && cy !== 0) {
            ctx.save();
            ctx.translate(2, sy + 11);
            ctx.fillStyle = COLOR_LABEL;
            ctx.fillText(String(cy), 0, 0);
            ctx.restore();
          }
          if (cy === 0) {
            ctx.save();
            ctx.translate(2, sy + 11);
            ctx.fillStyle = "#5be5b3";
            ctx.fillText("0", 0, 0);
            ctx.restore();
          }
        }
      }
    };

    // Initial + resize + scroll redraw.
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrapper);
    wrapper.addEventListener("scroll", draw, { passive: true });
    window.addEventListener("resize", draw);
    return () => {
      ro.disconnect();
      wrapper.removeEventListener("scroll", draw);
      window.removeEventListener("resize", draw);
    };
    // originRef is a static ref, no need to re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  // Hide if parent layout hides the rails (very narrow viewport).
  // Silence TS warning: suppress unused COLOR_LINE.
  void COLOR_LINE;
  return (
    <>
      <canvas
        ref={horizRef}
        className="de-ruler de-ruler-h"
        aria-hidden
      />
      <canvas
        ref={vertRef}
        className="de-ruler de-ruler-v"
        aria-hidden
      />
      <div className="de-ruler-corner" aria-hidden />
    </>
  );
}
