/**
 * CSS `transform` parser/printer for the scene graph.
 *
 * Scope (Tier-2):
 *  - `rotate(Ndeg)` / `rotate(N.Mrad)` / `rotate(0.5turn)` → degrees
 *  - `scale(n)` / `scale(sx, sy)` / `scaleX(n)` / `scaleY(n)`
 *  - `transform-origin: X% Y%` (percent form only)
 *
 * Anything outside that shape (translate, skew, matrix, multi-value
 * stacks we can't cleanly decompose) is preserved verbatim as a
 * `legacyStyleExtras.transform` blob so the scene roundtrips.
 */

import type { LayerTransform } from "./types";

const DEG_FROM_UNIT: Record<string, (n: number) => number> = {
  deg: (n) => n,
  rad: (n) => (n * 180) / Math.PI,
  grad: (n) => (n * 180) / 200,
  turn: (n) => n * 360,
};

/** Parse a single angle value ("45deg", "0.5turn"…). Returns degrees. */
function parseAngle(raw: string): number | null {
  const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)(deg|rad|grad|turn)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  const unit = (m[2] || "deg").toLowerCase();
  const conv = DEG_FROM_UNIT[unit];
  if (!conv) return null;
  return conv(n);
}

/**
 * Parse the `transform` property. Returns a decomposed `LayerTransform`
 * when we can cleanly round-trip each function; otherwise returns null
 * and the caller keeps the original string as a legacy extra.
 *
 * Multi-function stacks are supported only for rotate+scale combos
 * (common in Illustrator-style editors). Everything else → null.
 */
export function parseTransform(value: string | undefined | null): LayerTransform | null {
  if (!value) return null;
  const v = value.trim();
  if (v === "" || v === "none") return null;

  const FN_RE = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  const out: LayerTransform = {};
  let match: RegExpExecArray | null;
  let anyFn = false;
  while ((match = FN_RE.exec(v)) !== null) {
    anyFn = true;
    const fn = match[1]!.toLowerCase();
    const args = match[2]!.split(",").map((s) => s.trim()).filter(Boolean);
    switch (fn) {
      case "rotate":
      case "rotatez": {
        if (args.length !== 1) return null;
        const deg = parseAngle(args[0]!);
        if (deg == null) return null;
        out.rotate = deg;
        break;
      }
      case "scale": {
        if (args.length === 1) {
          const n = parseFloat(args[0]!);
          if (Number.isNaN(n)) return null;
          out.scaleX = n;
          out.scaleY = n;
        } else if (args.length === 2) {
          const sx = parseFloat(args[0]!);
          const sy = parseFloat(args[1]!);
          if (Number.isNaN(sx) || Number.isNaN(sy)) return null;
          out.scaleX = sx;
          out.scaleY = sy;
        } else return null;
        break;
      }
      case "scalex": {
        if (args.length !== 1) return null;
        const n = parseFloat(args[0]!);
        if (Number.isNaN(n)) return null;
        out.scaleX = n;
        break;
      }
      case "scaley": {
        if (args.length !== 1) return null;
        const n = parseFloat(args[0]!);
        if (Number.isNaN(n)) return null;
        out.scaleY = n;
        break;
      }
      default:
        // Unsupported function in the stack — bail and preserve verbatim.
        return null;
    }
  }
  if (!anyFn) return null;
  return out;
}

/** Parse `transform-origin: 50% 30%` → { originX: 50, originY: 30 }. */
export function parseTransformOrigin(
  value: string | undefined | null,
): { originX?: number; originY?: number } | null {
  if (!value) return null;
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0 || parts.length > 3) return null;
  const pct = (p: string): number | null => {
    const m = p.match(/^(-?\d+(?:\.\d+)?)%$/);
    return m ? parseFloat(m[1]!) : null;
  };
  const x = pct(parts[0]!);
  const y = parts.length > 1 ? pct(parts[1]!) : 50;
  if (x == null || y == null) return null;
  return { originX: x, originY: y };
}

/** Format a LayerTransform back into a CSS `transform` value. Returns
 *  undefined when the transform is empty / identity. */
export function printTransform(t: LayerTransform | undefined): string | undefined {
  if (!t) return undefined;
  const fns: string[] = [];
  if (t.rotate != null && t.rotate !== 0) fns.push(`rotate(${fmt(t.rotate)}deg)`);
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  if (sx !== 1 || sy !== 1) {
    if (sx === sy) fns.push(`scale(${fmt(sx)})`);
    else fns.push(`scale(${fmt(sx)}, ${fmt(sy)})`);
  }
  return fns.length ? fns.join(" ") : undefined;
}

/** Format `transform-origin` when either origin is present. */
export function printTransformOrigin(t: LayerTransform | undefined): string | undefined {
  if (!t) return undefined;
  const x = t.originX;
  const y = t.originY;
  if (x == null && y == null) return undefined;
  return `${fmt(x ?? 50)}% ${fmt(y ?? 50)}%`;
}

function fmt(n: number): string {
  // Keep integers clean; avoid trailing .0 noise.
  if (Number.isInteger(n)) return `${n}`;
  return `${parseFloat(n.toFixed(4))}`;
}
