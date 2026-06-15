/**
 * google-map-embed.ts — shared helpers for the Google Maps embed object.
 *
 * Mirrors facebook-embed.ts: a standalone `<iframe>` (no API key) renders the
 * map in both the editor canvas and the published page. The user provides
 * EITHER a plain address/place name (→ a `maps.google.com/maps?q=…&output=embed`
 * iframe) OR pastes a Google Maps "지도 퍼가기" embed code / embed URL (→ its
 * `src` is used verbatim, preserving the rich place card). Persistence rides
 * the normal save path (cloneSceneForDesktopSave snapshots innerHTML).
 *
 * Used by: section-library.ts (insert preset) + InspectorPanel.tsx
 * ("Google 지도 설정" section) + publisher mobile cap CSS.
 */

export interface GoogleMapEmbedOpts {
  /** The iframe src — a q-form (built from an address) or a pasted embed URL. */
  src: string;
  width: number;
  height: number;
}

const MAPS_HOST_RE = /google\.com\/maps|maps\.google\.[a-z.]+/i;

export const GMAP_DEFAULTS: GoogleMapEmbedOpts = {
  src: buildMapSrcFromQuery("Sydney Opera House", 15),
  width: 600,
  height: 450,
};

export function clampMapSize(n: number): number {
  return Math.max(120, Math.round(n));
}

/** Basic map (marker + pan/zoom) from a free-text address/place. No API key. */
export function buildMapSrcFromQuery(query: string, zoom = 15): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&hl=en&output=embed`;
}

/** Turn arbitrary user input into an embeddable iframe `src`:
 *   1. a pasted `<iframe …src="…">` embed code → its src (rich place card),
 *   2. a bare Google Maps embed URL (`/maps/embed…` or `…output=embed`) → as-is,
 *   3. anything else (an address / place name) → a q-form basic map. */
export function resolveMapInput(input: string, zoom = 15): string {
  const s = input.trim();
  if (!s) return buildMapSrcFromQuery("Sydney Opera House", zoom);
  const iframe = /<iframe[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(s);
  if (iframe && MAPS_HOST_RE.test(iframe[1]!)) {
    return iframe[1]!.replace(/&amp;/g, "&");
  }
  if (/^https?:\/\//i.test(s) && (/\/maps\/embed/i.test(s) || /output=embed/i.test(s))) {
    return s.replace(/&amp;/g, "&");
  }
  return buildMapSrcFromQuery(s, zoom);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** Build a standalone Google Maps iframe (string). Pure — no DOM. */
export function buildGoogleMapEmbedHtml(o: GoogleMapEmbedOpts): string {
  const w = clampMapSize(o.width);
  const h = clampMapSize(o.height);
  return (
    `<iframe class="hns-gmap-embed" src="${escapeAttr(o.src)}" ` +
    `width="${w}" height="${h}" ` +
    `style="border:0;display:block;width:${w}px;height:${h}px;max-width:100%;" ` +
    `loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
  );
}

function findMapNode(root: HTMLElement): HTMLIFrameElement | null {
  const frames = root.querySelectorAll<HTMLIFrameElement>("iframe");
  for (const f of Array.from(frames)) {
    if (MAPS_HOST_RE.test(f.getAttribute("src") || "")) return f;
  }
  return null;
}

export function isGoogleMapEmbed(root: HTMLElement | null | undefined): boolean {
  return !!root && !!findMapNode(root);
}

export function parseGoogleMapEmbed(
  root: HTMLElement | null | undefined,
): GoogleMapEmbedOpts | null {
  if (!root) return null;
  const f = findMapNode(root);
  if (!f) return null;
  return {
    src: (f.getAttribute("src") || "").replace(/&amp;/g, "&"),
    width:
      parseInt(f.getAttribute("width") || "", 10) ||
      Math.round(f.getBoundingClientRect().width) ||
      GMAP_DEFAULTS.width,
    height:
      parseInt(f.getAttribute("height") || "", 10) ||
      Math.round(f.getBoundingClientRect().height) ||
      GMAP_DEFAULTS.height,
  };
}

/** Replace the map iframe inside `root` with a fresh one reflecting `o`.
 *  Mutates the live DOM; the next save snapshots it. */
export function applyGoogleMapEmbed(root: HTMLElement, o: GoogleMapEmbedOpts): void {
  const html = buildGoogleMapEmbedHtml(o);
  const tmp = root.ownerDocument.createElement("div");
  tmp.innerHTML = html;
  const fresh = tmp.firstElementChild;
  if (!fresh) return;
  const node = findMapNode(root);
  if (node) node.replaceWith(fresh);
  else root.appendChild(fresh);
}
