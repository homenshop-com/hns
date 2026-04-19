/**
 * Tiny inline-style parser/printer. Deliberately does not use the
 * browser's CSSStyleDeclaration: the serializer runs on the server
 * too (tests, AI edit, imports), and we need stable byte output
 * for golden roundtrip tests.
 */

export type StyleMap = Record<string, string>;

/** Parse `style="a: 1px; b: 2"` → { a: "1px", b: "2" }. */
export function parseStyle(value: string | null | undefined): StyleMap {
  const out: StyleMap = {};
  if (!value) return out;
  for (const raw of value.split(";")) {
    const idx = raw.indexOf(":");
    if (idx < 0) continue;
    const k = raw.slice(0, idx).trim().toLowerCase();
    const v = raw.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = v;
  }
  return out;
}

/** Print a style map as `a: 1px; b: 2` with deterministic ordering.
 *  Empty map → empty string. No trailing semicolon. */
export function printStyle(map: StyleMap, keyOrder?: string[]): string {
  const keys = Object.keys(map).filter((k) => map[k] !== "" && map[k] != null);
  if (keys.length === 0) return "";
  const ordered = keyOrder
    ? [
        ...keyOrder.filter((k) => keys.includes(k)),
        ...keys.filter((k) => !keyOrder.includes(k)).sort(),
      ]
    : keys.sort();
  return ordered.map((k) => `${k}: ${map[k]}`).join("; ");
}

/** Parse a numeric css length like "123px" / "123" / "123px !important"
 *  → 123. Returns undefined if the value isn't a pixel length. */
export function pxNum(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const t = stripImportant(v).trim();
  if (t === "") return undefined;
  if (/^-?\d+(\.\d+)?px$/i.test(t)) return parseFloat(t);
  if (/^-?\d+(\.\d+)?$/.test(t)) return parseFloat(t);
  return undefined;
}

/** Returns true if the value ends with the `!important` flag. */
export function hasImportant(v: string | undefined): boolean {
  if (v == null) return false;
  return /!\s*important\s*$/i.test(v);
}

/** Strip the `!important` flag and trailing whitespace. */
export function stripImportant(v: string): string {
  return v.replace(/\s*!\s*important\s*$/i, "").trim();
}

export function numToPx(n: number | undefined): string | undefined {
  if (n == null || Number.isNaN(n)) return undefined;
  // Preserve integer when possible to match legacy editor output.
  return Number.isInteger(n) ? `${n}px` : `${n}px`;
}
