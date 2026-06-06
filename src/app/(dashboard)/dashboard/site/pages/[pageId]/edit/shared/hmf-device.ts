/**
 * HMF (header / menu / footer) per-device positioning.
 *
 * WHY THIS EXISTS
 * ---------------
 * The body (`#hns_body`) is scene-managed, so per-device frames live on the
 * scene graph (tabletFrame / mobileFrame) and are painted by editor-sync.
 * Header / menu / footer are RAW-INJECTED — their HTML is stored verbatim
 * (Site.headerHtml / SiteHmf) and re-injected on both the editor and the
 * published page. They are NOT part of the scene graph, so they can't carry
 * scene device frames. But users still expect to place the logo / nav / etc.
 * independently on PC / Tablet / Mobile (Wix-style 3-mode).
 *
 * THE MECHANISM
 * -------------
 * We persist per-device geometry as a managed `<style data-hns-device>`
 * block embedded INSIDE the HMF container's own HTML:
 *
 *     <style data-hns-device>
 *       @media (max-width:1024px){ #id{ left:Xpx!important; top:Ypx!important } }
 *       @media (max-width:767px){ #id{ left:Xpx!important; top:Ypx!important } }
 *     </style>
 *
 * Because the block lives in `header.innerHTML`, it:
 *   • persists automatically (save reads `headerRef.innerHTML`), and
 *   • works on the published page for free (the route raw-injects the HTML,
 *     and the published page is rendered at REAL device widths so the
 *     `@media` queries actually fire).
 *
 * The editor canvas, however, is a WIDE viewport with a narrow ARTBOARD —
 * element width does not trigger viewport media queries — so the editor
 * paints the active device by writing INLINE styles on device switch
 * (`applyHmfDevicePreview`). Desktop = restore the authored base inline;
 * Tablet/Mobile = apply the cascaded per-device geometry. This mirrors the
 * published `@media` cascade exactly, keeping the editor WYSIWYG-faithful.
 */

export type HmfDevice = "tablet" | "mobile";
export type HmfViewport = "desktop" | HmfDevice;

/** A geometry box; any subset of the four props may be present. */
export type HmfBox = {
  left?: string;
  top?: string;
  width?: string;
  height?: string;
};

/** id → per-device geometry overrides. */
export type HmfDeviceMap = Record<string, Partial<Record<HmfDevice, HmfBox>>>;

/** id → authored desktop-base inline geometry (snapshot for restore). */
export type HmfBaseMap = Record<string, HmfBox>;

const STYLE_SELECTOR = "style[data-hns-device]";
const DEVICE_MAX: Record<HmfDevice, number> = { tablet: 1024, mobile: 767 };
const BOX_PROPS: Array<keyof HmfBox> = ["left", "top", "width", "height"];
/** CSS property name for each box key (1:1 here, but explicit for clarity). */
const PROP_CSS: Record<keyof HmfBox, string> = {
  left: "left",
  top: "top",
  width: "width",
  height: "height",
};

/** Stable, persistable id for an HMF element that gains a device override.
 *  Written onto the element so it travels with `header.innerHTML`. */
export function ensureHmfId(el: HTMLElement): string {
  if (!el.id) {
    el.id = "hnsd_" + Math.random().toString(36).slice(2, 9);
  }
  return el.id;
}

/** True when the box has at least one declared dimension. */
function boxHasAny(box: HmfBox | undefined): box is HmfBox {
  return !!box && BOX_PROPS.some((p) => box[p] != null && box[p] !== "");
}

/** Per-property cascade for the editor preview / published parity:
 *  mobile → tablet → base, most-specific wins per property. */
function resolveBox(
  map: HmfDeviceMap,
  base: HmfBaseMap,
  id: string,
  device: HmfViewport,
): HmfBox {
  const baseBox = base[id] ?? {};
  if (device === "desktop") return { ...baseBox };
  const tablet = map[id]?.tablet ?? {};
  const out: HmfBox = { ...baseBox, ...tablet };
  if (device === "mobile") {
    const mobile = map[id]?.mobile ?? {};
    Object.assign(out, mobile);
  }
  return out;
}

/** Read an existing `<style data-hns-device>` block back into a map.
 *  Lenient parser — only understands the shape we emit. */
export function parseHmfDeviceStyle(container: HTMLElement): HmfDeviceMap {
  const styleEl = container.querySelector<HTMLStyleElement>(STYLE_SELECTOR);
  const map: HmfDeviceMap = {};
  if (!styleEl) return map;
  const css = styleEl.textContent ?? "";
  // Split into @media blocks. Each: @media (max-width:NNNpx){ ...rules... }
  const mediaRe = /@media[^{]*max-width\s*:\s*(\d+)px[^{]*\{([\s\S]*?)\}\s*(?=@media|$)/gi;
  let mm: RegExpExecArray | null;
  while ((mm = mediaRe.exec(css)) !== null) {
    const maxw = parseInt(mm[1]!, 10);
    const device: HmfDevice | null =
      maxw <= DEVICE_MAX.mobile ? "mobile" : maxw <= DEVICE_MAX.tablet ? "tablet" : null;
    if (!device) continue;
    const body = mm[2]!;
    // Each rule: #id{ prop:val; prop:val }
    const ruleRe = /#([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
    let rm: RegExpExecArray | null;
    while ((rm = ruleRe.exec(body)) !== null) {
      const id = rm[1]!;
      const decls = rm[2]!;
      const box: HmfBox = {};
      for (const prop of BOX_PROPS) {
        const dre = new RegExp(`(?:^|;)\\s*${PROP_CSS[prop]}\\s*:\\s*([^;!]+)`, "i");
        const dmm = dre.exec(decls);
        if (dmm) box[prop] = dmm[1]!.trim();
      }
      if (boxHasAny(box)) {
        map[id] = map[id] ?? {};
        map[id]![device] = box;
      }
    }
  }
  return map;
}

/** Serialize the map to the @media CSS text (tablet block first, mobile
 *  second so mobile overrides tablet at ≤767 via source order). Only ids
 *  present in `container` are emitted, so each HMF block carries only its
 *  own rules. */
export function buildHmfDeviceCss(
  container: HTMLElement,
  map: HmfDeviceMap,
): string {
  const inContainer = (id: string) =>
    !!container.querySelector(`#${CSS.escape(id)}`);
  const blocks: string[] = [];
  for (const device of ["tablet", "mobile"] as HmfDevice[]) {
    const rules: string[] = [];
    for (const id of Object.keys(map)) {
      const box = map[id]?.[device];
      if (!boxHasAny(box)) continue;
      if (!inContainer(id)) continue;
      const decls = BOX_PROPS.filter((p) => box![p] != null && box![p] !== "")
        .map((p) => `${PROP_CSS[p]}:${box![p]} !important`)
        .join(";");
      if (decls) rules.push(`#${id}{${decls}}`);
    }
    if (rules.length) {
      blocks.push(`@media (max-width:${DEVICE_MAX[device]}px){${rules.join("")}}`);
    }
  }
  return blocks.join("\n");
}

/** Replace (or remove) the managed `<style data-hns-device>` block inside a
 *  container so it reflects the current map. Idempotent. */
export function writeHmfDeviceStyle(
  container: HTMLElement,
  map: HmfDeviceMap,
): void {
  container.querySelector(STYLE_SELECTOR)?.remove();
  const css = buildHmfDeviceCss(container, map);
  if (!css) return;
  const styleEl = document.createElement("style");
  styleEl.setAttribute("data-hns-device", "");
  styleEl.textContent = css;
  container.appendChild(styleEl);
}

/** Record a drag/resize result for an HMF element under the active device.
 *  Mutates `map`, ensures the element has a persistable id, and returns it. */
export function recordHmfDeviceFrame(
  el: HTMLElement,
  map: HmfDeviceMap,
  device: HmfDevice,
  box: HmfBox,
): string {
  const id = ensureHmfId(el);
  const cleaned: HmfBox = {};
  for (const p of BOX_PROPS) {
    if (box[p] != null && box[p] !== "") cleaned[p] = box[p];
  }
  map[id] = map[id] ?? {};
  map[id]![device] = { ...(map[id]![device] ?? {}), ...cleaned };
  return id;
}

/** Snapshot the element's current inline geometry as the desktop base (only
 *  if not already captured). Called the first time an element is previewed
 *  in a device mode, so "restore to desktop" has a target. */
export function snapshotHmfBase(
  el: HTMLElement,
  base: HmfBaseMap,
  id: string,
): void {
  if (base[id]) return;
  base[id] = {
    left: el.style.left || undefined,
    top: el.style.top || undefined,
    width: el.style.width || undefined,
    height: el.style.height || undefined,
  };
}

/** Paint the active device onto the overridden HMF elements via inline
 *  styles (the editor's wide viewport can't rely on the embedded @media).
 *  Desktop restores the base; Tablet/Mobile apply the cascaded geometry. */
export function applyHmfDevicePreview(
  container: HTMLElement,
  map: HmfDeviceMap,
  base: HmfBaseMap,
  device: HmfViewport,
): void {
  for (const id of Object.keys(map)) {
    const el = container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (!el) continue;
    // Ensure we have a base to restore to before mutating inline geometry.
    if (device !== "desktop") snapshotHmfBase(el, base, id);
    const box = resolveBox(map, base, id, device);
    for (const p of BOX_PROPS) {
      const v = box[p];
      if (v != null && v !== "") el.style.setProperty(PROP_CSS[p], v);
      else el.style.removeProperty(PROP_CSS[p]);
    }
  }
}
