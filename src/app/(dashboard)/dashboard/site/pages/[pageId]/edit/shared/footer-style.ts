/**
 * footer-style.ts — site-wide, per-device footer (#hns_footer) styling.
 *
 * Storage: a managed `<style data-hns-footer>` block PREPENDED into the footer
 * HTML (the inner HTML of #hns_footer). Because footer HTML lives in SiteHmf
 * (shared across every page), the block is automatically SITE-WIDE — the
 * existing HMF save (footerHtml) persists it, no cssText plumbing needed. The
 * block carries a desktop base rule + tablet/mobile `@media` rules, so footer
 * background / min-height are PER-DEVICE.
 *
 * Editor caveat: `@media (max-width:…)` evaluates against the wide editor
 * browser viewport, not the artboard, so only the desktop base fires in the
 * canvas. `applyFooterLivePreview` writes the active device's values as inline
 * styles on #hns_footer so tablet/mobile previews are WYSIWYG. The inline
 * styles are on the CONTAINER (not in innerHTML), so they are NOT saved — the
 * `<style>` block is the single persisted source.
 */

export type FooterDevice = "desktop" | "tablet" | "mobile";
export interface FooterDeviceStyle {
  background: string;
  minHeight: number;
  /** Full-bleed background — extends the footer bg edge-to-edge (100vw) while
   *  the content stays within the page width. Implemented with a box-shadow
   *  spread + horizontal clip so it works in every scale band and doesn't shift
   *  the absolute-positioned footer content. Set on the desktop entry; the
   *  desktop base rule (no @media) carries it to every viewport. */
  fullWidth?: boolean;
}
export type FooterStyle = Record<FooterDevice, FooterDeviceStyle>;

/** Shared full-bleed declarations (used by both the footer and the header). */
export function fullBleedDecls(bg: string, important = true): string {
  const bang = important ? " !important" : "";
  return `box-shadow:0 0 0 100vw ${bg}${bang};clip-path:inset(0 -100vw 0 -100vw)${bang};`;
}

const MAXW: Record<Exclude<FooterDevice, "desktop">, number> = {
  tablet: 1024,
  mobile: 767,
};

export function emptyFooterStyle(): FooterStyle {
  return {
    desktop: { background: "", minHeight: 0, fullWidth: false },
    tablet: { background: "", minHeight: 0, fullWidth: false },
    mobile: { background: "", minHeight: 0, fullWidth: false },
  };
}

function decls(d: FooterDeviceStyle): string {
  const out: string[] = [];
  const bg = d.background && d.background !== "transparent" ? d.background : "";
  if (bg) out.push(`background:${bg} !important;`);
  if (d.minHeight > 0) out.push(`min-height:${Math.round(d.minHeight)}px !important;`);
  if (d.fullWidth && bg) out.push(fullBleedDecls(bg));
  return out.join("");
}

/** Build the `<style data-hns-footer>` block (empty string when nothing set). */
export function buildFooterStyleBlock(s: FooterStyle): string {
  const lines: string[] = [];
  const dk = decls(s.desktop);
  if (dk) lines.push(`#hns_footer{${dk}}`);
  const tb = decls(s.tablet);
  if (tb) lines.push(`@media (max-width:${MAXW.tablet}px){#hns_footer{${tb}}}`);
  const mb = decls(s.mobile);
  if (mb) lines.push(`@media (max-width:${MAXW.mobile}px){#hns_footer{${mb}}}`);
  if (lines.length === 0) return "";
  return `<style data-hns-footer>${lines.join("")}</style>`;
}

function readDecls(css: string): FooterDeviceStyle {
  const bg = /background\s*:\s*([^;!}]+)/i.exec(css)?.[1]?.trim() || "";
  const mh = parseInt(/min-height\s*:\s*([\d.]+)px/i.exec(css)?.[1] || "0", 10) || 0;
  const fullWidth = /box-shadow\s*:[^;]*100vw/i.test(css);
  return { background: bg, minHeight: mh, fullWidth };
}

/** Parse the managed block out of footer HTML back into a FooterStyle. */
export function parseFooterStyle(html: string): FooterStyle {
  const out = emptyFooterStyle();
  const block =
    /<style[^>]*data-hns-footer[^>]*>([\s\S]*?)<\/style>/i.exec(html || "")?.[1] || "";
  if (!block) return out;
  const tb = /@media\s*\(\s*max-width:\s*1024px\s*\)\s*\{\s*#hns_footer\s*\{([^}]*)\}/i.exec(block);
  if (tb) out.tablet = readDecls(tb[1]!);
  const mb = /@media\s*\(\s*max-width:\s*767px\s*\)\s*\{\s*#hns_footer\s*\{([^}]*)\}/i.exec(block);
  if (mb) out.mobile = readDecls(mb[1]!);
  // Desktop base = the #hns_footer rule NOT inside an @media. Strip @media
  // blocks first so the base regex can't accidentally match a device rule.
  const noMedia = block.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, "");
  const dk = /#hns_footer\s*\{([^}]*)\}/i.exec(noMedia);
  if (dk) out.desktop = readDecls(dk[1]!);
  return out;
}

/** Replace the managed `<style data-hns-footer>` inside the footer container,
 *  then apply the active device's values as a live inline preview. */
export function applyFooterStyleToDom(
  footerEl: HTMLElement,
  style: FooterStyle,
  device: FooterDevice,
): void {
  footerEl.querySelector("style[data-hns-footer]")?.remove();
  const block = buildFooterStyleBlock(style);
  if (block) {
    const tmp = footerEl.ownerDocument.createElement("div");
    tmp.innerHTML = block;
    const styleEl = tmp.firstElementChild;
    if (styleEl) footerEl.insertBefore(styleEl, footerEl.firstChild);
  }
  applyFooterLivePreview(footerEl, style, device);
}

/** Inline-preview the active device's values on #hns_footer (editor only;
 *  not persisted — see file header). Falls back to the desktop base when a
 *  device has no override, mirroring the published @media cascade. */
export function applyFooterLivePreview(
  footerEl: HTMLElement,
  style: FooterStyle,
  device: FooterDevice,
): void {
  const d = style[device];
  const base = style.desktop;
  const bg = (d.background || base.background || "").trim();
  const mh = d.minHeight > 0 ? d.minHeight : base.minHeight;
  const cleanBg = bg && bg !== "transparent" ? bg : "";
  footerEl.style.background = cleanBg;
  footerEl.style.minHeight = mh > 0 ? `${Math.round(mh)}px` : "";
  const fullWidth = (d.fullWidth ?? false) || (base.fullWidth ?? false);
  if (fullWidth && cleanBg) {
    footerEl.style.boxShadow = `0 0 0 100vw ${cleanBg}`;
    footerEl.style.clipPath = "inset(0 -100vw 0 -100vw)";
  } else {
    footerEl.style.boxShadow = "";
    footerEl.style.clipPath = "";
  }
}
