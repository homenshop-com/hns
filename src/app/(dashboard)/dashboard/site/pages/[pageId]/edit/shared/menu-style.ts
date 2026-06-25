/**
 * menu-style.ts — site-wide nav menu styling (text color / hover / size /
 * item spacing) + "bring to front".
 *
 * Stored as a managed `HNS-MENU-STYLE` block in the page CSS (single source for
 * editor canvas + published — both read pageCss). Targets the legacy template
 * menu (`.mainmenu li a`) inside the header/menu, plus the nav widget id, and
 * always raises the nav's z-index so it sits ABOVE any header background box
 * (e.g. a white menu panel) that would otherwise cover it — the common reason a
 * menu "disappears" on publish.
 */

export interface MenuStyle {
  color: string; // text color ("" = inherit/default)
  hover: string; // hover text color
  fontSize: number; // px (0 = default)
  gap: number; // horizontal padding per item, px (0 = default)
}

export const MENU_MARK_START = "/* HNS-MENU-STYLE:START */";
export const MENU_MARK_END = "/* HNS-MENU-STYLE:END */";

export function emptyMenuStyle(): MenuStyle {
  return { color: "", hover: "", fontSize: 0, gap: 0 };
}

function blockRegex(): RegExp {
  return new RegExp(
    String.raw`\/\*\s*HNS-MENU-STYLE:START\s*\*\/[\s\S]*?\/\*\s*HNS-MENU-STYLE:END\s*\*\/`,
    "g",
  );
}

const LINK_SEL =
  "#hns_header .mainmenu li a, #hns_menu .mainmenu li a, #v-wdg-nav a, #hns_header .menu a";
const HOVER_SEL =
  "#hns_header .mainmenu li a:hover, #hns_menu .mainmenu li a:hover, #v-wdg-nav a:hover";
// Raise the nav above header background boxes so the menu is never covered.
// MUST stay ≥ the editor/published #hns_menu default (200) AND above
// #hns_header_content (z-index 111) — a lower value (e.g. 50) drops the menu
// BEHIND the header content wrapper and it vanishes.
const FRONT_SEL = "#v-wdg-nav, #hns_header .v-home-ap-hd-nav, #hns_menu";
const FRONT_Z = 200;

export function buildMenuStyleCss(s: MenuStyle): string {
  const link: string[] = [];
  if (s.color) link.push(`color:${s.color} !important`);
  if (s.fontSize > 0) link.push(`font-size:${Math.round(s.fontSize)}px !important`);
  if (s.gap > 0) {
    link.push(`padding-left:${Math.round(s.gap)}px !important`);
    link.push(`padding-right:${Math.round(s.gap)}px !important`);
  }
  const hover = s.hover ? `color:${s.hover} !important` : "";
  if (link.length === 0 && !hover) return "";
  const lines: string[] = [];
  if (link.length) lines.push(`${LINK_SEL} { ${link.join("; ")}; }`);
  if (hover) lines.push(`${HOVER_SEL} { ${hover}; }`);
  // Bring-to-front whenever any menu styling is set. z-index only — never force
  // position (the nav is absolute via .dragable; #hns_menu is positioned by the
  // base editor/published CSS).
  lines.push(`${FRONT_SEL} { z-index: ${FRONT_Z} !important; }`);
  return `${MENU_MARK_START}\n${lines.join("\n")}\n${MENU_MARK_END}`;
}

export function upsertMenuStyleCss(css: string | null | undefined, s: MenuStyle): string {
  const base = (css || "").replace(blockRegex(), "").trim();
  const block = buildMenuStyleCss(s);
  if (!block) return base;
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

export function parseMenuStyle(css: string | null | undefined): MenuStyle {
  const out = emptyMenuStyle();
  if (!css) return out;
  const block = blockRegex().exec(css)?.[0];
  if (!block) return out;
  // Link rule = the first rule (not :hover).
  const linkRule = /\{([^}]*)\}/.exec(block.replace(/:hover[^{]*\{[^}]*\}/g, ""))?.[1] ?? "";
  out.color = /(?<!-)color\s*:\s*([^;!}]+)/i.exec(linkRule)?.[1]?.trim() ?? "";
  out.fontSize = parseInt(/font-size\s*:\s*([\d.]+)px/i.exec(linkRule)?.[1] ?? "0", 10) || 0;
  out.gap = parseInt(/padding-left\s*:\s*([\d.]+)px/i.exec(linkRule)?.[1] ?? "0", 10) || 0;
  const hoverRule = /:hover[^{]*\{([^}]*)\}/.exec(block)?.[1] ?? "";
  out.hover = /color\s*:\s*([^;!}]+)/i.exec(hoverRule)?.[1]?.trim() ?? "";
  return out;
}
