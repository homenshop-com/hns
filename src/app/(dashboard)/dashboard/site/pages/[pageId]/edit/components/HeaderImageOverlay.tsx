/**
 * HeaderImageOverlay — floating ↻ buttons over each `<img>` in the
 * site header. Lets the user replace logos / hero images directly on
 * the canvas with one click → file picker → /api/upload → live src
 * swap. No prompt-based URL entry; no Inspector trip.
 *
 * The site header lives outside the V2 scene graph (Site.headerHtml is
 * a separate string), so we don't go through `setImage`. We mutate the
 * DOM `<img>` directly; the parent editor's save flow picks up the new
 * `headerEl.innerHTML`.
 */

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface Props {
  /** The site header element rendered inside the canvas. Usually
   *  `headerRef.current` from design-editor.tsx. */
  headerRef: React.RefObject<HTMLElement | null>;
  /** Owner site id — passed to /api/upload so files land in the
   *  per-site folder and show in the 에셋 tab. */
  siteId?: string;
}

interface Spot {
  el: HTMLImageElement;
  rect: { left: number; top: number; width: number; height: number };
}

export default function HeaderImageOverlay({ headerRef, siteId }: Props) {
  const [spots, setSpots] = useState<Spot[]>([]);
  const [busyEl, setBusyEl] = useState<HTMLImageElement | null>(null);

  // Refresh the list of <img>s + their rects. Cheap to rerun (queries +
  // bounding rect). We do it on header mutation, scroll, resize, zoom.
  const refresh = () => {
    const headerEl = headerRef.current;
    if (!headerEl) {
      setSpots([]);
      return;
    }
    const imgs = Array.from(headerEl.querySelectorAll<HTMLImageElement>("img"));
    setSpots(
      imgs
        .map((el) => {
          const r = el.getBoundingClientRect();
          // Skip 0-sized / off-screen images (decorative SVGs, lazy loaders).
          if (r.width < 8 || r.height < 8) return null;
          return {
            el,
            rect: { left: r.left, top: r.top, width: r.width, height: r.height },
          } as Spot;
        })
        .filter((s): s is Spot => s !== null),
    );
  };

  useLayoutEffect(() => {
    refresh();
    const headerEl = headerRef.current;
    if (!headerEl) return;
    // Watch the header for src/structure changes — covers the initial
    // headerHtml inject as well as any later edits.
    const obs = new MutationObserver(() => refresh());
    obs.observe(headerEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    const onReflow = () => refresh();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      obs.disconnect();
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = async (img: HTMLImageElement, file: File) => {
    setBusyEl(img);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "site-uploads");
      fd.append("compress", "true");
      if (siteId) fd.append("siteId", siteId);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error || `업로드 실패 (${res.status})`);
      }
      const { url } = (await res.json()) as { url?: string };
      if (typeof url === "string") {
        img.setAttribute("src", url);
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setBusyEl(null);
    }
  };

  return (
    <>
      {spots.map((s, i) => (
        <SpotButton
          key={i}
          spot={s}
          busy={s.el === busyEl}
          onPick={(f) => onPick(s.el, f)}
        />
      ))}
    </>
  );
}

function SpotButton({
  spot,
  busy,
  onPick,
}: {
  spot: Spot;
  busy: boolean;
  onPick: (f: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Choose corner placement: top-right of the img, like the body
  // image ↻ button. Keeps gizmos consistent across header/body.
  const left = spot.rect.left + spot.rect.width - 30;
  const top = spot.rect.top + 6;
  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        title="이미지 교체 (헤더)"
        style={{
          position: "fixed",
          left,
          top,
          width: 24,
          height: 24,
          padding: 0,
          background: busy ? "#666" : "rgba(42, 121, 255, 0.95)",
          color: "#fff",
          border: "1.5px solid #fff",
          borderRadius: 4,
          cursor: busy ? "wait" : "pointer",
          zIndex: 9450,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}
      >
        <i className={busy ? "fa-solid fa-spinner fa-spin" : "fa-solid fa-arrows-rotate"} />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

// Silence unused-var warning when MutationObserver isn't used elsewhere.
export type __HeaderImageOverlayUseEffectRef = typeof useEffect;
