/**
 * facebook-embed.ts — shared helpers for the Facebook Page embed object.
 *
 * The embed is a STANDALONE `<iframe src="facebook.com/plugins/page.php?…">`
 * (no FB SDK needed): the iframe renders the widget directly in both the
 * editor canvas and the published page, and its width/height/href/tabs are
 * fully encoded in the src params + element attributes. Editing = rebuild the
 * iframe; persistence rides the normal save path (cloneSceneForDesktopSave
 * snapshots the element's live innerHTML at save), so no scene-type or
 * save-pipeline changes are required.
 *
 * Used by: section-library.ts (insert preset) + InspectorPanel.tsx
 * ("Facebook 설정" section, edit/width) + publisher mobile cap CSS.
 */

export interface FacebookEmbedOpts {
  /** Full Facebook page URL, e.g. https://www.facebook.com/konnichiwasushi/ */
  href: string;
  /** Widget width in px. FB page plugin clamps to 180–500. */
  width: number;
  /** Widget height in px (min ~70). */
  height: number;
  /** Any of "timeline" | "events" | "messages". */
  tabs: string[];
  smallHeader: boolean;
  hideCover: boolean;
  showFacepile: boolean;
}

const PLUGIN_BASE = "https://www.facebook.com/plugins/page.php";
const IFRAME_ALLOW =
  "autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share";

export const FB_TAB_OPTIONS = ["timeline", "events", "messages"] as const;

export const FB_DEFAULTS: FacebookEmbedOpts = {
  href: "https://www.facebook.com/facebook",
  width: 340,
  height: 500,
  tabs: ["timeline"],
  smallHeader: false,
  hideCover: false,
  showFacepile: true,
};

/** FB page plugin enforces 180–500px width; height has a practical floor. */
export function clampFbWidth(w: number): number {
  return Math.max(180, Math.min(500, Math.round(w)));
}
export function clampFbHeight(h: number): number {
  return Math.max(70, Math.round(h));
}

/** Build a standalone Facebook page-plugin iframe (string). Pure — no DOM. */
export function buildFacebookEmbedHtml(o: FacebookEmbedOpts): string {
  const w = clampFbWidth(o.width);
  const h = clampFbHeight(o.height);
  const qs = new URLSearchParams({
    href: o.href,
    tabs: o.tabs.join(","),
    width: String(w),
    height: String(h),
    small_header: String(o.smallHeader),
    adapt_container_width: "true",
    hide_cover: String(o.hideCover),
    show_facepile: String(o.showFacepile),
  });
  return (
    `<iframe class="hns-fb-embed" src="${PLUGIN_BASE}?${qs.toString()}" ` +
    `width="${w}" height="${h}" ` +
    `style="border:none;overflow:hidden;width:${w}px;height:${h}px;display:block;max-width:100%;" ` +
    `scrolling="no" frameborder="0" allowfullscreen="true" allow="${IFRAME_ALLOW}"></iframe>`
  );
}

/** The FB embed node inside a host element (the rendered iframe OR a legacy
 *  `.fb-page` SDK div). */
function findFbNode(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(
    'iframe[src*="facebook.com/plugins/page"], .fb-page',
  );
}

export function isFacebookEmbed(root: HTMLElement | null | undefined): boolean {
  return !!root && !!findFbNode(root);
}

/** Read the current embed options out of a host element (rendered iframe src
 *  params preferred, falling back to a legacy `.fb-page` div's data-* attrs).
 *  Returns null when the element holds no Facebook embed. */
export function parseFacebookEmbed(
  root: HTMLElement | null | undefined,
): FacebookEmbedOpts | null {
  if (!root) return null;
  const iframe = root.querySelector<HTMLIFrameElement>(
    'iframe[src*="facebook.com/plugins/page"]',
  );
  if (iframe) {
    try {
      const u = new URL(iframe.getAttribute("src") || "", "https://www.facebook.com");
      const p = u.searchParams;
      return {
        href: p.get("href") || FB_DEFAULTS.href,
        width:
          parseInt(p.get("width") || "", 10) ||
          parseInt(iframe.getAttribute("width") || "", 10) ||
          FB_DEFAULTS.width,
        height:
          parseInt(p.get("height") || "", 10) ||
          parseInt(iframe.getAttribute("height") || "", 10) ||
          FB_DEFAULTS.height,
        tabs: (p.get("tabs") || "timeline")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        smallHeader: p.get("small_header") === "true",
        hideCover: p.get("hide_cover") === "true",
        showFacepile: p.get("show_facepile") !== "false",
      };
    } catch {
      /* malformed src — fall through to the .fb-page reader */
    }
  }
  const fb = root.querySelector<HTMLElement>(".fb-page");
  if (fb) {
    return {
      href: fb.getAttribute("data-href") || FB_DEFAULTS.href,
      width: parseInt(fb.getAttribute("data-width") || "", 10) || FB_DEFAULTS.width,
      height: parseInt(fb.getAttribute("data-height") || "", 10) || FB_DEFAULTS.height,
      tabs: (fb.getAttribute("data-tabs") || "timeline")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      smallHeader: fb.getAttribute("data-small-header") === "true",
      hideCover: fb.getAttribute("data-hide-cover") === "true",
      showFacepile: fb.getAttribute("data-show-facepile") !== "false",
    };
  }
  return null;
}

/** Replace the FB embed subtree inside `root` with a fresh standalone iframe
 *  reflecting `o`. Normalizes a legacy SDK-rendered `.fb-page` into a clean
 *  iframe too. Mutates the live DOM; the next save snapshots it. */
export function applyFacebookEmbed(root: HTMLElement, o: FacebookEmbedOpts): void {
  const html = buildFacebookEmbedHtml(o);
  const tmp = root.ownerDocument.createElement("div");
  tmp.innerHTML = html;
  const fresh = tmp.firstElementChild;
  if (!fresh) return;
  const node = findFbNode(root);
  if (node) node.replaceWith(fresh);
  else root.appendChild(fresh);
}
