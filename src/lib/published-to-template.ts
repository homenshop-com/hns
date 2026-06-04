/**
 * Capture a *published* homeNshop site straight off the wire and turn it
 * into a reusable Template snapshot.
 *
 * Why fetch the live URL instead of reading the DB:
 *   When an account is restored badly, the design editor (which reads
 *   Page.content.layers — the scene graph) and the published page (which
 *   reads Page.content.html) diverge. The *published* render is the source
 *   of truth the customer actually sees. By fetching the rendered HTML we
 *   capture exactly that, and we deliberately store ONLY { html } per page
 *   (no `layers`) so a site created from this template starts from a clean
 *   slate — the editor regenerates a fresh scene graph from the known-good
 *   markup instead of carrying the corrupted one forward.
 *
 * The publisher assembles each page as:
 *   <div id="hns_header">…header+nav…</div>
 *   <div id="hns_menu"></div>            (empty — nav lives in header)
 *   <div id="hns_body">…page body…</div>
 *   <div id="hns_footer">…footer…</div>
 *   <style>…templateCss + siteCss…</style>
 * so we reverse exactly those wrappers.
 *
 * Header/footer/CSS are shared across pages; only #hns_body differs, so we
 * fetch the entry URL once for the chrome + CSS, then crawl the in-site nav
 * links and fetch each page just for its body.
 *
 * Asset URLs (images, uploads) are left as absolute https://home.homenshop.com
 * URLs pointing at the ORIGINAL shop — so the captured design renders
 * pixel-for-pixel even before the new owner re-uploads. Only navigation
 * hrefs are rewritten to relative form so the new site's menu points at its
 * own pages, not the source shop.
 */

import { JSDOM } from "jsdom";

const PUBLISHED_HOST = "home.homenshop.com";

export type CaptureMode = "ppt" | "responsive";

export interface CapturedSnapshotPage {
  slug: string;
  title: string;
  lang: string;
  isHome: boolean;
  showInMenu: boolean;
  sortOrder: number;
  content: { html: string };
  css: null;
}

export interface CapturedTemplate {
  name: string;
  cssText: string;
  headerHtml: string;
  menuHtml: string;
  footerHtml: string;
  pagesSnapshot: CapturedSnapshotPage[];
  shopId: string;
  lang: string;
  stats: {
    pages: number;
    cssChars: number;
    headerChars: number;
    footerChars: number;
  };
}

/** Slugs that are dynamic systems (board posts, product catalog, search) —
 *  not static design pages, so we don't crawl them as template pages. */
const PAGE_DENYLIST = new Set([
  "board", "goods", "product", "products", "search", "sitemap",
  "login", "logout", "member", "cart", "order", "checkout",
]);

const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 16;

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull shopId + lang out of a /{shopId}/{lang}/… published path. */
function parseShopLang(u: URL): { shopId: string; lang: string } {
  const segs = u.pathname.split("/").filter(Boolean);
  return { shopId: segs[0] ?? "", lang: segs[1] ?? "ko" };
}

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "homeNshop-template-capture/1.0" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rewrite in-site navigation hrefs from the source shop's absolute paths to
 * relative form, so the captured chrome navigates the NEW site's pages.
 *   /{shop}/{lang}/            → index.html
 *   /{shop}/{lang}/about.html  → about.html
 *   https://home.homenshop.com/{shop}/{lang}/… → same, relativized
 * Asset src/url() and external links are untouched.
 */
function rewriteInternalLinks(html: string, shopId: string, lang: string): string {
  const prefix = `/${shopId}/${lang}/`;
  const p = escapeReg(prefix);
  const host = `https?://${escapeReg(PUBLISHED_HOST)}`;
  let out = html;
  // Home root (both bare and host-qualified) → index.html
  out = out.replace(new RegExp(`href="(?:${host})?${p}"`, "g"), 'href="index.html"');
  out = out.replace(new RegExp(`href="(?:${host})?${p}index\\.html"`, "g"), 'href="index.html"');
  // Any other in-site page → relative remainder (keeps ?query like board.html?action=…)
  out = out.replace(new RegExp(`href="(?:${host})?${p}([^"]+)"`, "g"), 'href="$1"');
  return out;
}

interface Extracted {
  css: string;
  headerHtml: string;
  footerHtml: string;
  bodyHtml: string;
  title: string;
  doc: Document;
}

function extract(html: string): Extracted {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const css = Array.from(doc.querySelectorAll("style"))
    .map((s) => s.textContent || "")
    .join("\n")
    .trim();

  const header = doc.getElementById("hns_header");
  const footer = doc.getElementById("hns_footer");
  const body = doc.getElementById("hns_body");

  // The publisher appends an empty <div id="hns_menu"></div> inside the
  // header wrapper AND emits a top-level one. Drop the nested copy so the
  // captured headerHtml doesn't carry a duplicate id.
  if (header) header.querySelectorAll("#hns_menu").forEach((n) => n.remove());

  return {
    css,
    headerHtml: header?.innerHTML.trim() ?? "",
    footerHtml: footer?.innerHTML.trim() ?? "",
    bodyHtml: body?.innerHTML.trim() ?? "",
    title: (doc.querySelector("title")?.textContent || "").replace(/\s+/g, " ").trim(),
    doc,
  };
}

interface DiscoveredPage {
  slug: string;
  title: string;
  fetchUrl: string;
  isHome: boolean;
}

/** Collect same-shop static page links from anywhere in the document. */
function discoverPages(doc: Document, shopId: string, lang: string): DiscoveredPage[] {
  const prefix = `/${shopId}/${lang}/`;
  const base = `https://${PUBLISHED_HOST}${prefix}`;
  const found = new Map<string, DiscoveredPage>();

  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    const raw = a.getAttribute("href") || "";
    let abs: URL;
    try {
      abs = new URL(raw, base);
    } catch {
      continue;
    }
    if (abs.hostname !== PUBLISHED_HOST) continue; // skip custom-domain / external
    if (!abs.pathname.startsWith(prefix)) continue;
    if (abs.search) continue; // dynamic (board.html?action=…) — not a design page

    const rest = abs.pathname.slice(prefix.length);
    let slug: string;
    let isHome = false;
    if (rest === "" || rest === "index.html") {
      slug = "index";
      isHome = true;
    } else {
      if (!rest.endsWith(".html")) continue;
      slug = rest.slice(0, -5);
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    if (PAGE_DENYLIST.has(slug)) continue;
    if (found.has(slug)) continue;

    const title = (a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) || slug;
    found.set(slug, {
      slug,
      title,
      fetchUrl: `${base}${slug === "index" ? "index.html" : rest}`,
      isHome,
    });
  }

  return Array.from(found.values());
}

/**
 * Fetch a published site and return a Template-ready snapshot.
 * @param inputUrl any published page URL, e.g. https://home.homenshop.com/konnichiwasushi/en/
 * @param mode "ppt" = legacy absolute-coordinate layout (no modern marker);
 *             "responsive" = prepend the HNS-MODERN-TEMPLATE marker.
 */
export async function capturePublishedAsTemplate(
  inputUrl: string,
  mode: CaptureMode,
): Promise<CapturedTemplate> {
  let base: URL;
  try {
    base = new URL(inputUrl.trim());
  } catch {
    throw new Error("URL 형식이 올바르지 않습니다.");
  }
  const { shopId, lang } = parseShopLang(base);
  if (!shopId) {
    throw new Error(
      "URL 에서 shopId 를 찾을 수 없습니다. /{shopId}/{lang}/ 형태의 퍼블리싱 URL 을 입력하세요.",
    );
  }

  const entryHtml = await fetchHtml(base.toString());
  const main = extract(entryHtml);
  if (!main.bodyHtml) {
    throw new Error(
      "이 페이지에서 #hns_body 를 찾지 못했습니다. 퍼블리싱된 사이트 URL 이 맞는지 확인하세요.",
    );
  }

  // Discover pages, then guarantee the home page is present (entry == home).
  const discovered = discoverPages(main.doc, shopId, lang);
  if (!discovered.some((p) => p.isHome)) {
    discovered.unshift({
      slug: "index",
      title: main.title || "Home",
      fetchUrl: `https://${PUBLISHED_HOST}/${shopId}/${lang}/index.html`,
      isHome: true,
    });
  }
  // Home first; cap total.
  discovered.sort((a, b) => Number(b.isHome) - Number(a.isHome));
  const pages = discovered.slice(0, MAX_PAGES);

  const pagesSnapshot: CapturedSnapshotPage[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    let bodyHtml: string;
    if (p.isHome) {
      bodyHtml = main.bodyHtml;
    } else {
      try {
        bodyHtml = extract(await fetchHtml(p.fetchUrl)).bodyHtml;
      } catch {
        continue; // a missing/erroring page shouldn't sink the whole capture
      }
    }
    if (!bodyHtml) continue;
    pagesSnapshot.push({
      slug: p.slug,
      title: p.title,
      lang,
      isHome: p.isHome,
      showInMenu: true,
      sortOrder: i,
      content: { html: rewriteInternalLinks(bodyHtml, shopId, lang) },
      css: null,
    });
  }

  if (pagesSnapshot.length === 0) {
    throw new Error("캡처된 페이지가 없습니다. 퍼블리싱 URL 을 다시 확인하세요.");
  }

  const headerHtml = rewriteInternalLinks(main.headerHtml, shopId, lang);
  const footerHtml = rewriteInternalLinks(main.footerHtml, shopId, lang);

  // CSS: drop any pre-existing marker, then add it back only for responsive
  // mode so the publisher selects the correct (legacy vs modern) adapters.
  let cssText = main.css.replace(/\/\*\s*HNS-MODERN-TEMPLATE\s*\*\//g, "").trim();
  if (mode === "responsive") {
    cssText = `/* HNS-MODERN-TEMPLATE */\n${cssText}`;
  }

  const name = (main.title || shopId).replace(/\s+/g, " ").trim().slice(0, 80) || shopId;

  return {
    name,
    cssText,
    headerHtml,
    menuHtml: `<div id="hns_menu"></div>`,
    footerHtml,
    pagesSnapshot,
    shopId,
    lang,
    stats: {
      pages: pagesSnapshot.length,
      cssChars: cssText.length,
      headerChars: headerHtml.length,
      footerChars: footerHtml.length,
    },
  };
}
