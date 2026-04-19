/**
 * snap — compute snap targets and nudge resize/move deltas so edges
 * align with nearby siblings.
 *
 * The helper is DOM-free; it operates on plain `{x,y,w,h}` rects and a
 * list of sibling rects. Callers are responsible for gathering rects
 * (usually via getBoundingClientRect + a common origin) and for drawing
 * any resulting guide lines.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapResult {
  x: number;
  y: number;
  w: number;
  h: number;
  /** X-coordinate of a vertical guide line to render, or null. */
  guideX: number | null;
  /** Y-coordinate of a horizontal guide line to render, or null. */
  guideY: number | null;
}

const DEFAULT_THRESHOLD = 6;

/** Given a live rect and a list of sibling rects, snap edges/centers
 *  within `threshold` pixels. Only the X side or Y side are affected
 *  independently — whichever has the closest match wins on each axis. */
export function snapRect(
  live: Rect,
  siblings: Rect[],
  threshold = DEFAULT_THRESHOLD,
): SnapResult {
  const res: SnapResult = { ...live, guideX: null, guideY: null };

  // Candidate X-lines on the live rect: left, center, right.
  const liveXs = [
    { kind: "left" as const, v: live.x },
    { kind: "cx" as const, v: live.x + live.w / 2 },
    { kind: "right" as const, v: live.x + live.w },
  ];
  // Candidate Y-lines.
  const liveYs = [
    { kind: "top" as const, v: live.y },
    { kind: "cy" as const, v: live.y + live.h / 2 },
    { kind: "bottom" as const, v: live.y + live.h },
  ];

  // Collect sibling X-lines (l, cx, r) and Y-lines (t, cy, b).
  const sibXs: number[] = [];
  const sibYs: number[] = [];
  for (const s of siblings) {
    sibXs.push(s.x, s.x + s.w / 2, s.x + s.w);
    sibYs.push(s.y, s.y + s.h / 2, s.y + s.h);
  }

  // X snapping.
  let bestX: { delta: number; guide: number } | null = null;
  for (const { v } of liveXs) {
    for (const sv of sibXs) {
      const d = sv - v;
      if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.delta))) {
        bestX = { delta: d, guide: sv };
      }
    }
  }
  if (bestX) {
    res.x = live.x + bestX.delta;
    res.guideX = bestX.guide;
  }

  // Y snapping.
  let bestY: { delta: number; guide: number } | null = null;
  for (const { v } of liveYs) {
    for (const sv of sibYs) {
      const d = sv - v;
      if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.delta))) {
        bestY = { delta: d, guide: sv };
      }
    }
  }
  if (bestY) {
    res.y = live.y + bestY.delta;
    res.guideY = bestY.guide;
  }

  return res;
}

/** Variant for resize: only snap the edge(s) being dragged, keeping
 *  the opposite edge pinned. `handle` is NSEW-style (eg "e", "se"). */
export function snapResize(
  live: Rect,
  handle: string,
  siblings: Rect[],
  threshold = DEFAULT_THRESHOLD,
): SnapResult {
  const res: SnapResult = { ...live, guideX: null, guideY: null };
  const sibXs: number[] = [];
  const sibYs: number[] = [];
  for (const s of siblings) {
    sibXs.push(s.x, s.x + s.w / 2, s.x + s.w);
    sibYs.push(s.y, s.y + s.h / 2, s.y + s.h);
  }

  const hasW = handle.includes("w");
  const hasE = handle.includes("e");
  const hasN = handle.includes("n");
  const hasS = handle.includes("s");

  // X axis: the moving edge is w (left) or e (right).
  if (hasW || hasE) {
    const target = hasE ? live.x + live.w : live.x;
    let best: { delta: number; guide: number } | null = null;
    for (const sv of sibXs) {
      const d = sv - target;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, guide: sv };
      }
    }
    if (best) {
      if (hasE) res.w = live.w + best.delta;
      else { res.x = live.x + best.delta; res.w = live.w - best.delta; }
      res.guideX = best.guide;
    }
  }
  if (hasN || hasS) {
    const target = hasS ? live.y + live.h : live.y;
    let best: { delta: number; guide: number } | null = null;
    for (const sv of sibYs) {
      const d = sv - target;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, guide: sv };
      }
    }
    if (best) {
      if (hasS) res.h = live.h + best.delta;
      else { res.y = live.y + best.delta; res.h = live.h - best.delta; }
      res.guideY = best.guide;
    }
  }
  return res;
}
