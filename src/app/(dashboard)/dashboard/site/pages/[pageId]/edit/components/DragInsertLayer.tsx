/**
 * DragInsertLayer — observes the native HTML5 drag-and-drop stream from
 * the LeftPalette cards and overlays two helpers on the canvas:
 *
 *   1. A floating "ghost" element that follows the cursor so the user
 *      has a visible preview of what they're inserting.
 *   2. A drop-indicator — a 2-px blue line + label — showing the exact
 *      insertion point inside #hns_body (before / after the hovered
 *      dragable, or at the end when hovering empty space).
 *
 * The component is pure overlay. It doesn't manage inserts itself — on
 * a valid drop it calls the onDrop callback with `{payload, afterId}`.
 * Design-editor.tsx wires this to `addElement()` or `insertSectionPreset()`
 * depending on the dataTransfer type.
 *
 * Uses document-level `dragover` / `drop` so it catches events anywhere
 * over the canvas without polluting every element with listeners.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

export type DropPayload =
  | { kind: "type"; value: string; label: string; icon: string }
  | { kind: "section"; value: string; label: string; icon: string };

/** Where a basic element / section should be inserted. `null` = append. */
export interface DropTarget {
  afterId: string | null;
  rect: { left: number; top: number; width: number };
}

interface Props {
  /** Scroll container (the .de-canvas-wrapper). */
  wrapperRef: React.RefObject<HTMLElement | null>;
  /** The #hns_body element — children are matched to drop targets. */
  bodyRef: React.RefObject<HTMLElement | null>;
  onDrop(payload: DropPayload, target: DropTarget): void;
}

const TYPE_ICON: Record<string, string> = {
  text:        "fa-font",
  image:       "fa-image",
  box:         "fa-shapes",
  board:       "fa-clipboard-list",
  product:     "fa-bag-shopping",
  exhibition:  "fa-images",
  login:       "fa-user-lock",
  mail:        "fa-envelope",
};

export default function DragInsertLayer({ wrapperRef, bodyRef, onDrop }: Props) {
  const t = useTranslations("editor");
  const tRef = useRef(t);
  tRef.current = t;
  const [payload, setPayload] = useState<DropPayload | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const payloadRef = useRef<DropPayload | null>(null);
  const targetRef = useRef<DropTarget | null>(null);
  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  /* ─── Native drag stream ────────────────────────────────────────── */
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const dt = e.dataTransfer;
      if (!dt) return;
      // LeftPalette sets one of these two payload types.
      const typeVal = dt.getData("text/x-homenshop-insert");
      const secVal = dt.getData("text/x-homenshop-section");
      // Caveat: during the "dragstart" event itself, most browsers allow
      // getData() only for our own types. Fallback to the DOM: the source
      // row carries a data-* we can read.
      let p: DropPayload | null = null;
      if (typeVal) {
        const icon = TYPE_ICON[typeVal] ?? "fa-square";
        const tt = tRef.current as (k: string) => string;
        const label = tt(`basics.${typeVal}`) || typeVal;
        p = { kind: "type", value: typeVal, label, icon };
      } else if (secVal) {
        const src = e.target as HTMLElement | null;
        const label = src?.getAttribute("title") || secVal;
        const iconEl = src?.querySelector(".lp-row-icon i");
        const icon =
          (iconEl?.className.match(/fa-[a-z0-9-]+/) || ["fa-grip"])[0];
        p = { kind: "section", value: secVal, label, icon };
      }
      if (p) {
        setPayload(p);
      }
    };

    const onDragEnd = () => {
      setPayload(null);
      setGhost(null);
      setTarget(null);
    };

    const onDragOver = (e: DragEvent) => {
      if (!payloadRef.current) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setGhost({ x: e.clientX, y: e.clientY });

      const body = bodyRef.current;
      const wrap = wrapperRef.current;
      if (!body || !wrap) return;

      // Only show drop target if pointer is inside the canvas wrapper.
      const wrapRect = wrap.getBoundingClientRect();
      if (
        e.clientX < wrapRect.left ||
        e.clientX > wrapRect.right ||
        e.clientY < wrapRect.top ||
        e.clientY > wrapRect.bottom
      ) {
        setTarget(null);
        return;
      }

      // Walk top-level dragables in #hns_body and find the one whose
      // vertical midpoint we're closest to (above/below toggling).
      const dragables = Array.from(
        body.querySelectorAll<HTMLElement>(":scope > .dragable"),
      );
      if (dragables.length === 0) {
        const br = body.getBoundingClientRect();
        setTarget({
          afterId: null,
          rect: { left: br.left, top: br.top, width: br.width },
        });
        return;
      }

      let afterId: string | null = null;
      let rectTop = 0;
      let rectLeft = 0;
      let rectWidth = 0;
      for (const el of dragables) {
        const r = el.getBoundingClientRect();
        const mid = r.top + r.height / 2;
        if (e.clientY < mid) {
          // Insert BEFORE this element — afterId = the previous sibling's id
          const idx = dragables.indexOf(el);
          afterId = idx > 0 ? dragables[idx - 1]!.id : null;
          rectTop = r.top - 2;
          rectLeft = r.left;
          rectWidth = r.width;
          break;
        }
        // We passed this element — keep as candidate "after".
        afterId = el.id;
        const lastR = r;
        rectTop = lastR.bottom - 1;
        rectLeft = lastR.left;
        rectWidth = lastR.width;
      }
      setTarget({
        afterId,
        rect: { left: rectLeft, top: rectTop, width: rectWidth },
      });
    };

    const onDropNative = (e: DragEvent) => {
      const p = payloadRef.current;
      const t = targetRef.current;
      if (!p) return;
      e.preventDefault();
      // Fire the callback — design-editor.tsx does the actual insert.
      onDrop(p, t ?? { afterId: null, rect: { left: 0, top: 0, width: 0 } });
      // Reset overlay.
      setPayload(null);
      setGhost(null);
      setTarget(null);
    };

    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", onDragEnd, true);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDropNative);
    return () => {
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("dragend", onDragEnd, true);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDropNative);
    };
    // Callbacks are stable references in the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!payload) return null;

  return (
    <>
      {/* Ghost follows the cursor */}
      {ghost && (
        <div
          className="de-drag-ghost"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden
        >
          <i className={`fa-solid ${payload.icon}`} />
          <span>{payload.label}</span>
        </div>
      )}

      {/* Drop indicator — horizontal blue line + small label */}
      {target && target.rect.width > 0 && (
        <div
          className="de-drag-indicator"
          style={{
            left: target.rect.left,
            top: target.rect.top,
            width: target.rect.width,
          }}
          aria-hidden
        >
          <div className="de-drag-indicator-bar" />
          <div className="de-drag-indicator-label">
            {target.afterId ? t("dragInsert.insertBelow") : t("dragInsert.insertTop")}
          </div>
        </div>
      )}
    </>
  );
}
