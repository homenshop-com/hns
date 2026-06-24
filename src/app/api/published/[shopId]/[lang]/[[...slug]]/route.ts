import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readTemplateCss, rewriteAssetUrls, rewriteApiImgUrls } from "@/lib/template-parser";
import { renderBoardPluginContent, renderProductPluginContent } from "@/lib/plugin-renderer";
import { parsePageParam } from "@/lib/pagination";
import {
  buildWebSiteJsonLd,
  buildOrganizationJsonLd,
  buildProductJsonLd,
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  renderJsonLdBlock,
  type JsonLdContext,
} from "@/lib/seo-jsonld";
import { normalizeAeoBlocks, buildAeoJsonLd, renderAeoHtml } from "@/lib/aeo";
import { isSiteExpired } from "@/lib/site-expiration";
import { getTempDomain, isManagedTempHost } from "@/lib/temp-domains";
import { isResellerHomeHost, getResellerHomeBranding } from "@/lib/reseller";
import {
  DEVICE_MEDIA_COMMENT_MARK,
  stripPinnedGeometryCss,
  collectInlineGeometryOwners,
  stripInlineGeometryImportant,
  sceneToLegacyHtml,
  stripFooterPinnedTop,
  parsePageWidthCss,
  type SceneGraph,
} from "@/lib/scene";

function renderExpiredPage(
  shopId: string,
  name: string,
  reseller?: { domain: string; siteName: string } | null,
): string {
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // White-label: on a reseller member-site host, brand + links point to the
  // reseller — never homeNshop / homenshop.net.
  const brandName = reseller ? reseller.siteName.replace(/</g, "&lt;") : "homeNshop";
  const homeBase = reseller ? `https://${reseller.domain}` : "https://homenshop.net";
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName || brandName} - 이용할 수 없는 사이트</title>
<meta name="robots" content="noindex">
<style>
  body{margin:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;background:#f8fafc;color:#334155;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;max-width:520px;width:100%;padding:48px 40px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.06);text-align:center}
  .icon{font-size:48px;margin-bottom:16px}
  h1{margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0f172a}
  p{margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#64748b}
  .btn{display:inline-block;padding:12px 28px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px}
  .btn.secondary{background:transparent;color:#2563eb;border:1px solid #dbeafe;margin-left:8px}
  .shop{display:inline-block;margin-top:20px;padding:6px 12px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#64748b;font-family:monospace}
</style></head>
<body><div class="card">
  <div class="icon">⏳</div>
  <h1>이 사이트는 현재 이용할 수 없습니다</h1>
  <p>요청하신 홈페이지의 이용 기간이 만료되어 더 이상 공개되지 않습니다.<br>사이트 소유자님은 로그인 후 플랜을 업그레이드하여 계속 사용하실 수 있습니다.</p>
  <a href="${homeBase}/pricing" class="btn">요금제 보기</a>
  <a href="${homeBase}/login" class="btn secondary">로그인</a>
  <div class="shop">shopId: ${shopId}</div>
</div></body></html>`;
}

/**
 * "Site is being prepared" landing — shown when a Site row exists but
 * has no pages yet (race window during /api/sites/create-from-* flows
 * where the Site INSERT lands ms before the Page rows commit), or when
 * the owner has unpublished it temporarily.
 *
 * Critical: this returns 200 (not 404). nginx for home.homenshop.com
 * has `error_page 404 = @legacy_static` which falls through to a
 * static `/expired.html` reading "계정이 만료되어 삭제되었습니다" —
 * a misleading message for a brand-new site. Returning 200 keeps
 * nginx from falling through.
 */
function renderPreparingPage(
  shopId: string,
  name: string,
  refresh = true,
  reseller?: { domain: string; siteName: string } | null,
): string {
  const safeName = name.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dashboardUrl = reseller ? `https://${reseller.domain}/dashboard` : "https://homenshop.net/dashboard";
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName} - 사이트 준비 중</title>
<meta name="robots" content="noindex">
${refresh ? '<meta http-equiv="refresh" content="6">' : ""}
<style>
  body{margin:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;background:#f8fafc;color:#334155;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;max-width:520px;width:100%;padding:48px 40px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.06);text-align:center}
  .spinner{width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#2563eb;border-radius:50%;animation:spin .9s linear infinite;margin:0 auto 18px}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{margin:0 0 12px 0;font-size:22px;font-weight:700;color:#0f172a}
  p{margin:0 0 24px 0;font-size:15px;line-height:1.7;color:#64748b}
  .btn{display:inline-block;padding:12px 28px;border-radius:8px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px}
  .shop{display:inline-block;margin-top:20px;padding:6px 12px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#64748b;font-family:monospace}
</style></head>
<body><div class="card">
  <div class="spinner"></div>
  <h1>사이트가 준비 중입니다</h1>
  <p>${safeName}을(를) 게시 중이에요. 잠시 후 자동으로 새로고침됩니다.<br>오랫동안 이 화면이 보인다면 사이트 소유자에게 문의하세요.</p>
  <a href="${dashboardUrl}" class="btn">대시보드로</a>
  <div class="shop">shopId: ${shopId}</div>
</div></body></html>`;
}

/* ─── Board rendering helpers ─── */

function escapeHtml(s: unknown): string {
  const str = String(s ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Board / Product label i18n ─── */
/* Centralised here (not in next-intl) because these strings are emitted
 * inside the published-page renderer, which runs as a per-request server
 * function and produces raw HTML — not React. Falls back to English when
 * the lang isn't covered. */
type BoardLabels = {
  board: string;
  notFound: string;
  empty: string;
  total: string;
  page: string;
  no: string;
  title: string;
  author: string;
  date: string;
  views: string;
  authorBy: string;  // prefix in detail meta — e.g. "By eric"
  viewsBy: string;   // prefix in detail meta — e.g. "Views 1234"
  defaultAuthor: string;
  backToList: string;
};
const BOARD_LABELS: Record<string, BoardLabels> = {
  ko: { board: "게시판", notFound: "게시글을 찾을 수 없습니다.", empty: "등록된 글이 없습니다.", total: "총", page: "페이지", no: "번호", title: "제목", author: "작성자", date: "날짜", views: "조회", authorBy: "작성자", viewsBy: "조회", defaultAuthor: "관리자", backToList: "목록으로" },
  en: { board: "Board", notFound: "Post not found.", empty: "No posts yet.", total: "TOTAL", page: "PAGE", no: "No.", title: "Title", author: "Author", date: "Date", views: "Views", authorBy: "By", viewsBy: "Views", defaultAuthor: "Admin", backToList: "Back to list" },
  ja: { board: "掲示板", notFound: "投稿が見つかりません。", empty: "投稿がまだありません。", total: "合計", page: "ページ", no: "番号", title: "タイトル", author: "投稿者", date: "日付", views: "閲覧", authorBy: "投稿者", viewsBy: "閲覧", defaultAuthor: "管理者", backToList: "一覧へ" },
  "zh-cn": { board: "公告板", notFound: "找不到帖子。", empty: "暂无帖子。", total: "共", page: "页", no: "编号", title: "标题", author: "作者", date: "日期", views: "查看", authorBy: "作者", viewsBy: "查看", defaultAuthor: "管理员", backToList: "返回列表" },
  "zh-tw": { board: "公告板", notFound: "找不到貼文。", empty: "尚無貼文。", total: "共", page: "頁", no: "編號", title: "標題", author: "作者", date: "日期", views: "查看", authorBy: "作者", viewsBy: "查看", defaultAuthor: "管理員", backToList: "返回列表" },
  es: { board: "Tablón", notFound: "Publicación no encontrada.", empty: "No hay publicaciones todavía.", total: "TOTAL", page: "PÁG.", no: "N.º", title: "Título", author: "Autor", date: "Fecha", views: "Vistas", authorBy: "Por", viewsBy: "Vistas", defaultAuthor: "Admin", backToList: "Volver a la lista" },
};
function boardLabels(lang: string): BoardLabels {
  return BOARD_LABELS[lang] || BOARD_LABELS["en"];
}

async function renderBoardRead(siteId: string, shopId: string, lang: string, id: number, urlPrefix: string = "", tempDomain: string = "home.homenshop.com"): Promise<string> {
  const L = boardLabels(lang);
  const row = await prisma.boardPost.findFirst({
    where: { siteId, legacyId: id },
    include: { category: { select: { name: true, legacyId: true } } },
  });
  if (!row) return `<div class="board-content" style="width:100%;margin:20px auto;position:relative;padding:40px 20px;color:#999;text-align:center;font-size:15px;">${L.notFound} (id=${id})</div>`;

  const photos = row.photos ? row.photos.split("|").filter(Boolean) : [];
  const imageExts = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]);
  const photoHtml = photos.map((p) => {
    const src = `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(p)}`;
    const ext = p.split(".").pop()?.toLowerCase() || "";
    if (imageExts.has(ext)) {
      return `<div style="margin:10px 0"><img src="${src}" style="max-width:100%;height:auto" alt="${escapeHtml(p)}" /></div>`;
    } else {
      return `<div style="margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:4px;display:inline-block;"><a href="${src}" download style="color:#89C23D;text-decoration:none;font-size:13px;">\u{1F4CE} ${escapeHtml(p)}</a></div>`;
    }
  }).join("");

  const catName = row.category?.name || "";
  const catLegacyId = row.category?.legacyId || 0;

  const replies = await prisma.boardPost.findMany({
    where: { siteId, parentId: row.id },
    orderBy: { legacyId: "asc" },
  });
  const repliesHtml = replies.map((r) => `
    <div style="border-top:1px solid #e5e5e5;padding:12px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#888;">
        <span>${escapeHtml(r.author || "익명")}</span>
        <span>${r.regdate || ""}</span>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#333;">${r.content || ""}</div>
    </div>
  `).join("");

  const listHref = `${urlPrefix}/${lang}/board.html?action=list&category=${catLegacyId}`;

  // Scoped class for theme-neutral read view — adapts to light and dark
  // templates via color:inherit + rgba borders.
  const scope = `brd-read`;
  const css = `
    .board-content.${scope}-wrap { max-width:1080px !important; }
    .${scope}-wrap { width:100%; margin:20px auto; position:relative; color:inherit; padding:0 20px; box-sizing:border-box; }
    .${scope}-header { padding-bottom:20px; border-bottom:1px solid rgba(255,181,71,.35); margin-bottom:28px; }
    .${scope}-cat { font-family:'JetBrains Mono',monospace; font-size:11px; color:#ffb547; letter-spacing:.14em; margin-bottom:10px; }
    .${scope}-title { font-family:'Pretendard',sans-serif; font-size:28px; font-weight:800; color:inherit; margin:0 0 14px 0; letter-spacing:-.02em; line-height:1.3; }
    .${scope}-meta { display:flex; flex-wrap:wrap; gap:20px; font-size:12px; color:inherit; opacity:.55; font-family:'JetBrains Mono',monospace; letter-spacing:.02em; }
    .${scope}-meta span::before { content:""; display:inline-block; width:3px; height:3px; background:currentColor; border-radius:50%; vertical-align:middle; margin-right:8px; opacity:.5; }
    .${scope}-body { min-height:200px; line-height:1.8; font-size:15px; color:inherit; }
    .${scope}-body p { color:inherit; }
    .${scope}-body img { max-width:100%; height:auto; border-radius:6px; margin:14px 0; box-shadow:0 4px 18px rgba(0,0,0,.25); }
    .${scope}-body a { color:#ffb547; }
    .${scope}-body table { max-width:100%; border-collapse:collapse; }
    .${scope}-body td, .${scope}-body th { padding:6px 8px; }
    .${scope}-replies { margin-top:32px; padding-top:20px; border-top:1px solid rgba(128,128,128,.15); }
    .${scope}-replies-title { font-family:'JetBrains Mono',monospace; font-size:12px; color:#ffb547; letter-spacing:.1em; margin-bottom:12px; }
    .${scope}-reply { border:1px solid rgba(128,128,128,.15); border-radius:8px; padding:14px 16px; margin-bottom:8px; background:rgba(255,255,255,.02); }
    .${scope}-reply-meta { display:flex; justify-content:space-between; font-size:11px; color:inherit; opacity:.5; margin-bottom:8px; font-family:'JetBrains Mono',monospace; }
    .${scope}-reply-body { font-size:13px; line-height:1.7; color:inherit; opacity:.8; }
    .${scope}-footer { margin-top:40px; padding-top:20px; border-top:1px solid rgba(128,128,128,.15); text-align:center; }
    .${scope}-back { display:inline-flex; align-items:center; gap:8px; padding:12px 28px; background:transparent; color:inherit; border:1px solid rgba(255,181,71,.35); border-radius:8px; font-size:13px; font-weight:600; text-decoration:none; letter-spacing:.02em; transition:all .2s; }
    .${scope}-back:hover { background:rgba(255,181,71,.1); border-color:#ffb547; color:#ffb547; }
    @media (max-width:640px){ .${scope}-title { font-size:22px; } }
  `.replace(/\n\s+/g, "\n");

  const repliesScoped = replies.length > 0 ? `
    <div class="${scope}-replies">
      <div class="${scope}-replies-title">COMMENTS (${replies.length})</div>
      ${replies.map((r) => `
        <div class="${scope}-reply">
          <div class="${scope}-reply-meta">
            <span>${escapeHtml(r.author || "익명")}</span>
            <span>${r.regdate || ""}</span>
          </div>
          <div class="${scope}-reply-body">${r.content || ""}</div>
        </div>
      `).join("")}
    </div>` : "";

  return `
  <div class="board-content ${scope}-wrap">
    <style>${css}</style>
    <div class="${scope}-header">
      ${catName ? `<div class="${scope}-cat">${escapeHtml(catName)}</div>` : ""}
      <h1 class="${scope}-title">${escapeHtml(row.title || "")}</h1>
      <div class="${scope}-meta">
        <span>${L.authorBy} ${escapeHtml(row.author || L.defaultAuthor)}</span>
        <span>${row.regdate || ""}</span>
        <span>${L.viewsBy} ${row.views || 0}</span>
      </div>
    </div>
    <div class="${scope}-body">
      ${row.content || ""}
      ${photoHtml}
    </div>
    ${repliesScoped}
    <div class="${scope}-footer">
      <a href="${listHref}" class="${scope}-back">← ${L.backToList}</a>
    </div>
  </div>`;
}

async function renderBoardList(siteId: string, shopId: string, lang: string, category: number, pageNum: number, urlPrefix: string = "", tempDomain: string = "home.homenshop.com"): Promise<string> {
  const perPage = 20;
  const offset = (pageNum - 1) * perPage;

  // Get category info — including listStyle so we know whether to render as
  // table (0, default) or gallery (1). listStyle is stored on BoardCategory
  // per the legacy PHP conventions.
  const L = boardLabels(lang);
  let catName = L.board;
  let categoryId: string | undefined;
  let listStyle = 0;
  let imgWidth = 150;
  let imgHeight = 100;
  if (category > 0) {
    const cat = await prisma.boardCategory.findFirst({ where: { siteId, legacyId: category } });
    if (cat) {
      catName = cat.name;
      categoryId = cat.id;
      listStyle = cat.listStyle ?? 0;
      imgWidth = cat.imgWidth || 150;
      imgHeight = cat.imgHeight || 100;
    }
  }

  // Count total
  const whereFilter: Record<string, unknown> = { siteId, parentId: null };
  if (categoryId) whereFilter.categoryId = categoryId;
  const total = await prisma.boardPost.count({ where: whereFilter });
  const totalPages = Math.ceil(total / perPage);

  // Fetch rows
  const rows = await prisma.boardPost.findMany({
    where: whereFilter,
    orderBy: { legacyId: "desc" },
    skip: offset,
    take: perPage,
    select: { legacyId: true, title: true, author: true, regdate: true, views: true, photos: true },
  });

  // Pagination (shared between table + gallery) — uses currentColor so it
  // adapts to both light and dark templates. Active page gets amber accent.
  let paginationHtml = "";
  if (totalPages > 1) {
    const links: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const href = `${urlPrefix}/${lang}/board.html?action=list&category=${category}&page=${p}`;
      if (p === pageNum) {
        links.push(`<span style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 10px;background:linear-gradient(180deg,#ffb547,#f28a17);color:#1a1a1a;border-radius:8px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:13px;box-shadow:0 4px 12px rgba(255,181,71,.2);">${p}</span>`);
      } else {
        links.push(`<a href="${href}" style="display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 10px;color:inherit;text-decoration:none;border:1px solid rgba(128,128,128,.2);border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;opacity:.7;transition:all .15s;">${p}</a>`);
      }
    }
    paginationHtml = `<div style="display:flex;justify-content:center;gap:6px;margin-top:32px;flex-wrap:wrap;">${links.join("")}</div>`;
  }

  /* ─── Gallery mode (listStyle === 1) ─── */
  if (listStyle === 1) {
    const scope = `brd-gal-${category}`;
    // Use a generous thumb size — wider than the tiny plugin default so
    // cards look good on a full-page list view.
    const thumbW = Math.max(400, imgWidth * 3);
    const thumbH = Math.max(280, imgHeight * 3);

    const cardsHtml = rows.map((r) => {
      const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`;
      const photos = r.photos ? r.photos.split("|").filter(Boolean) : [];
      const firstPhoto = photos[0] || "";
      const imgSrc = firstPhoto
        ? `https://${tempDomain}/${shopId}/thumb/${thumbW}x${thumbH}/${encodeURIComponent(firstPhoto)}`
        : "";
      const title = escapeHtml(r.title || "");
      const date = (r.regdate || "").slice(0, 10);
      return `<a class="${scope}-card" href="${href}">
        <div class="${scope}-media">${
          imgSrc
            ? `<img src="${imgSrc}" alt="${title}" loading="lazy" />`
            : `<div class="${scope}-placeholder">📷</div>`
        }</div>
        <div class="${scope}-meta">
          <div class="${scope}-title">${title}</div>
          ${date ? `<div class="${scope}-date">${date}</div>` : ""}
        </div>
      </a>`;
    }).join("");

    // Self-scoped inline styles: use CSS vars that pick up from body (so dark
    // templates get dark cards, light templates get light cards). Fallback
    // values target a light theme.
    const css = `
      .board-content.${scope}-wrap { max-width:1240px !important; }
      .${scope}-wrap { width:100%; margin:20px auto; position:relative; color:inherit; padding:0 20px; box-sizing:border-box; }
      .${scope}-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; border-bottom:1px solid rgba(137,194,61,.25); padding-bottom:14px; margin-bottom:24px; }
      .${scope}-head h2 { font-size:22px; font-weight:700; margin:0; color:inherit; letter-spacing:-.01em; display:flex; align-items:center; gap:10px; }
      .${scope}-head h2::before { content:""; display:inline-block; width:5px; height:18px; background:linear-gradient(180deg,#ffb547 0%,#f28a17 100%); border-radius:2px; box-shadow:0 0 12px rgba(255,181,71,.45); }
      .${scope}-head .${scope}-count { font-family:'JetBrains Mono',monospace; font-size:12px; color:#888; letter-spacing:.05em; }
      .${scope}-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:16px; }
      .${scope}-card { display:block; text-decoration:none; color:inherit; border:1px solid rgba(128,128,128,.18); border-radius:10px; overflow:hidden; background:rgba(255,255,255,.02); transition:border-color .25s, transform .25s, box-shadow .25s; }
      .${scope}-card:hover { border-color:rgba(255,181,71,.55); transform:translateY(-3px); box-shadow:0 8px 24px rgba(255,181,71,.12); }
      .${scope}-media { position:relative; width:100%; aspect-ratio:3/2; overflow:hidden; background:#000; }
      .${scope}-media img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .45s; }
      .${scope}-card:hover .${scope}-media img { transform:scale(1.04); }
      .${scope}-placeholder { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:28px; color:#555; }
      .${scope}-meta { padding:12px 14px; }
      .${scope}-title { font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; letter-spacing:-.01em; }
      .${scope}-card:hover .${scope}-title { color:#ffb547; }
      .${scope}-date { font-family:'JetBrains Mono',monospace; font-size:11px; color:#888; margin-top:4px; }
      .${scope}-empty { grid-column:1/-1; text-align:center; color:#888; padding:60px 20px; border:1px dashed rgba(128,128,128,.2); border-radius:8px; }
      @media (max-width:900px){ .${scope}-grid{ grid-template-columns:repeat(2,1fr); gap:12px; } }
      @media (max-width:520px){ .${scope}-grid{ grid-template-columns:repeat(2,1fr); } .${scope}-title{ font-size:12px; } }
    `.replace(/\n\s+/g, "\n");

    return `
    <div class="board-content ${scope}-wrap">
      <style>${css}</style>
      <div class="${scope}-head">
        <h2>${escapeHtml(catName)}</h2>
        <span class="${scope}-count">${L.total} ${total} · ${L.page} ${pageNum}/${Math.max(1, totalPages)}</span>
      </div>
      <div class="${scope}-grid">
        ${cardsHtml || `<div class="${scope}-empty">${L.empty}</div>`}
      </div>
      ${paginationHtml}
    </div>`;
  }

  /* ─── Table mode (listStyle === 0, default) ──────────────────────
   * Scoped class names and color:inherit so the table adapts to both
   * light (default) and dark (UNION LED-style) templates. The underlying
   * .board-content container keeps color:inherit and we pick text/muted
   * colors via `currentColor` with rgba mixing — readable on any bg. */
  const scope = `brd-tbl-${category}`;
  const rowsHtml = rows.map((r) => {
    const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`;
    return `<tr class="${scope}-row">
      <td class="${scope}-num">${r.legacyId}</td>
      <td class="${scope}-title"><a href="${href}">${escapeHtml(r.title || "")}</a></td>
      <td class="${scope}-muted">${escapeHtml(r.author || L.defaultAuthor)}</td>
      <td class="${scope}-muted">${r.regdate || ""}</td>
      <td class="${scope}-muted">${r.views || 0}</td>
    </tr>`;
  }).join("");

  const css = `
    .board-content.${scope}-wrap { max-width:1240px !important; }
    .${scope}-wrap { width:100%; margin:20px auto; position:relative; color:inherit; padding:0 20px; box-sizing:border-box; }
    .${scope}-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; border-bottom:1px solid rgba(137,194,61,.25); padding-bottom:14px; margin-bottom:16px; }
    .${scope}-head h2 { font-size:22px; font-weight:700; margin:0; color:inherit; letter-spacing:-.01em; display:flex; align-items:center; gap:10px; }
    .${scope}-head h2::before { content:""; display:inline-block; width:5px; height:18px; background:linear-gradient(180deg,#ffb547 0%,#f28a17 100%); border-radius:2px; box-shadow:0 0 12px rgba(255,181,71,.45); }
    .${scope}-head .${scope}-count { font-family:'JetBrains Mono',monospace; font-size:12px; color:inherit; opacity:.55; letter-spacing:.05em; }
    .${scope}-table { width:100%; border-collapse:collapse; font-size:14px; color:inherit; }
    .${scope}-table thead tr { border-bottom:1px solid rgba(128,128,128,.25); }
    .${scope}-table th { padding:12px 10px; font-size:12px; font-weight:600; color:inherit; opacity:.55; letter-spacing:.04em; }
    .${scope}-table th.${scope}-col-num,
    .${scope}-table th.${scope}-col-meta { text-align:center; }
    .${scope}-table th.${scope}-col-title { text-align:left; }
    .${scope}-row { border-bottom:1px solid rgba(128,128,128,.12); transition:background .15s; }
    .${scope}-row:hover { background:rgba(255,181,71,.05); }
    .${scope}-row td { padding:14px 10px; vertical-align:middle; }
    .${scope}-num { text-align:center; width:72px; font-family:'JetBrains Mono',monospace; font-size:12px; color:inherit; opacity:.5; }
    .${scope}-title { color:inherit; }
    .${scope}-title a { color:inherit; text-decoration:none; font-size:14px; letter-spacing:-.01em; transition:color .15s; }
    .${scope}-title a:hover { color:#ffb547; }
    .${scope}-muted { text-align:center; width:100px; font-size:12px; color:inherit; opacity:.55; font-family:'JetBrains Mono',monospace; }
    .${scope}-muted:last-child { width:72px; }
    .${scope}-empty { padding:48px 20px; text-align:center; color:inherit; opacity:.5; font-size:14px; }
    @media (max-width:720px) {
      .${scope}-col-author, .${scope}-muted:nth-last-child(3),
      .${scope}-muted:nth-last-child(1) { display:none; }
      .${scope}-col-author, .${scope}-col-views { display:none; }
    }
  `.replace(/\n\s+/g, "\n");

  return `
  <div class="board-content ${scope}-wrap">
    <style>${css}</style>
    <div class="${scope}-head">
      <h2>${escapeHtml(catName)}</h2>
      <span class="${scope}-count">${L.total} ${total} · ${L.page} ${pageNum}/${Math.max(1, totalPages)}</span>
    </div>
    <table class="${scope}-table">
      <thead>
        <tr>
          <th class="${scope}-col-num">${L.no}</th>
          <th class="${scope}-col-title">${L.title}</th>
          <th class="${scope}-col-meta ${scope}-col-author">${L.author}</th>
          <th class="${scope}-col-meta">${L.date}</th>
          <th class="${scope}-col-meta ${scope}-col-views">${L.views}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || `<tr><td colspan="5" class="${scope}-empty">${L.empty}</td></tr>`}
      </tbody>
    </table>
    ${paginationHtml}
  </div>`;
}

/* ─── Product detail / list page rendering ─── */
async function renderProductRead(
  siteId: string, shopId: string, lang: string, productId: number, urlPrefix: string, goodsPage: string = "goods", prismaProductId?: string, prodSettings?: ProductDisplaySettings, tempDomain: string = "home.homenshop.com"
): Promise<string> {
  let pname = "", price = "", contents = "", specification = "", catId = 0, catName = "";
  let photos: string[] = [];

  // Fetch product from Prisma (by PG id or by legacy id)
  const pp = prismaProductId
    ? await prisma.product.findUnique({ where: { id: prismaProductId } })
    : await prisma.product.findFirst({ where: { siteId, legacyId: productId } });

  if (!pp) return `<div style="max-width:700px;margin:40px auto;padding:20px;text-align:center;color:#666;font-size:15px;">Product not found. (id=${productId})</div>`;

  pname = pp.name;
  price = pp.price > 0 ? `$${pp.price}` : "";
  contents = pp.description || "";
  specification = pp.specification || "";
  const imgs = (pp.images as string[] | null) || [];
  photos = pp.photos
    ? pp.photos.split("|").filter(Boolean)
    : imgs.flatMap((e) => String(e).split("|").filter(Boolean));
  catId = parseInt(pp.category || "0") || 0;
  if (catId > 0) {
    const catRow = await prisma.productCategory.findFirst({ where: { siteId, legacyId: catId, lang } });
    catName = catRow?.name || "";
  }

  // Build photo gallery — handle both legacy and new URL formats
  function photoUrl(p: string) {
    if (p.startsWith("http") || p.startsWith("/")) return p;
    return `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(p)}`;
  }

  const detailImgWidth = prodSettings?.detailWidth || 400;
  const mainImg = photos[0]
    ? `<img src="${photoUrl(photos[0])}" style="max-width:${detailImgWidth}px;width:100%;height:auto;border:1px solid #eee;" alt="${escapeHtml(pname)}" />`
    : "";
  const thumbs = photos.length > 1
    ? photos.map((p, i) =>
        `<img src="${photoUrl(p)}" onclick="document.getElementById('prod-main-img').src=this.src" style="width:60px;height:60px;object-fit:cover;border:1px solid #ddd;cursor:pointer;margin:2px;${i === 0 ? 'border-color:#999;' : ''}" alt="" />`
      ).join("")
    : "";

  // Back link
  const backHref = catId > 0
    ? `${urlPrefix}/${lang}/${goodsPage}.html?action=list&category=${catId}`
    : `${urlPrefix}/${lang}/${goodsPage}.html?action=list`;

  // CTA buttons + (for inquiry mode) inline form, controlled by the site's
  // productSettings.buttonMode. Default = "sales" (구매하기/바로구매).
  const buttonMode = prodSettings?.buttonMode ?? "sales";
  const ctaProductRef = pp.legacyId ? String(pp.legacyId) : pp.id;

  let ctaHtml = "";
  if (buttonMode === "sales") {
    ctaHtml = `<div class="product-detail-cta product-detail-cta-sales">
      <button type="button" class="product-detail-btn product-detail-btn-cart"
        onclick="alert('장바구니 담기는 준비 중입니다.');return false;">구매하기</button>
      <button type="button" class="product-detail-btn product-detail-btn-buy"
        onclick="alert('바로구매는 준비 중입니다.');return false;">바로구매</button>
    </div>`;
  } else if (buttonMode === "inquiry") {
    // Inline inquiry form. Posts to /api/contact/submit with product info
    // pre-filled in the message body so the recipient knows which item the
    // inquiry refers to.
    const productLabel = `[Inquiry] ${pname}${ctaProductRef ? ` (#${ctaProductRef})` : ""}`;
    const formId = `prod-inquiry-${ctaProductRef}`;
    ctaHtml = `<div class="product-detail-cta product-detail-cta-inquiry">
      <button type="button" class="product-detail-btn product-detail-btn-inquiry"
        onclick="document.getElementById('${formId}').classList.toggle('open');return false;">
        Send inquiry <span style="margin-left:6px;">→</span>
      </button>
      <form id="${formId}" class="product-detail-inquiry-form" onsubmit="
        var f=this;var btn=f.querySelector('button[type=submit]');var msgEl=f.querySelector('.product-inquiry-msg');
        btn.disabled=true;btn.textContent='Sending…';msgEl.textContent='';
        var payload={
          shopId:'${escapeHtml(shopId)}',
          source:'product',
          productId:'${escapeHtml(pp.id)}',
          ${pp.legacyId ? `productLegacyId:${pp.legacyId},` : ''}
          productName:'${escapeHtml(pname).replace(/'/g, "\\'")}',
          pageUrl:window.location.href,
          name:f.name.value.trim(),
          email:f.email.value.trim(),
          phone:f.phone.value.trim(),
          company:f.company.value.trim(),
          hp:f.hp.value,
          message:f.message.value
        };
        fetch('/api/contact/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
          .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
          .then(function(res){
            if(res.ok){msgEl.style.color='#047857';msgEl.textContent='Thank you — your inquiry has been sent. We will respond within one business day.';f.reset();}
            else{msgEl.style.color='#b91c1c';msgEl.textContent='Could not send: '+(res.d.error||'unknown error');}
          })
          .catch(function(){msgEl.style.color='#b91c1c';msgEl.textContent='Network error — please try again.';})
          .finally(function(){btn.disabled=false;btn.textContent='Send inquiry';});
        return false;">
        <input type="text" name="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;" />
        <div class="row">
          <input type="text" name="name" placeholder="Name *" required />
          <input type="text" name="company" placeholder="Company" />
        </div>
        <div class="row">
          <input type="email" name="email" placeholder="Email *" required />
          <input type="tel" name="phone" placeholder="Phone" />
        </div>
        <textarea name="message" placeholder="Quantity, target delivery date, condition (new / refurbished), shipping country…" required></textarea>
        <div class="actions">
          <button type="submit">Send inquiry</button>
          <span class="product-inquiry-msg"></span>
        </div>
      </form>
    </div>`;
  }
  // buttonMode === "none" → ctaHtml stays empty

  // Same `product-content` wrapper as the list view so themed CSS (and the
  // page-header :has(+ .product-content) slim-header rule) applies to both.
  return `<div class="product-content product-detail" style="max-width:900px;margin:20px auto;padding:20px;font-family:Tahoma,Arial,sans-serif;">
    <div class="product-detail-back" style="margin-bottom:15px;">
      <a href="${backHref}" style="color:#666;text-decoration:none;font-size:13px;">&larr; ${catName || "Product List"}</a>
    </div>
    <div class="product-detail-grid" style="display:flex;gap:30px;flex-wrap:wrap;">
      <div class="product-detail-photos" style="flex:0 0 auto;">
        ${mainImg ? `<div id="prod-main-img-wrap">${mainImg.replace('<img ', '<img id="prod-main-img" class="product-detail-mainimg" ')}</div>` : ""}
        ${thumbs ? `<div class="product-detail-thumbs" style="margin-top:8px;">${thumbs}</div>` : ""}
      </div>
      <div class="product-detail-info" style="flex:1;min-width:250px;">
        <h1 class="product-detail-name" style="font-size:20px;color:#333;margin:0 0 10px 0;font-weight:bold;">${escapeHtml(pname)}</h1>
        ${price ? `<div class="product-detail-price" style="font-size:18px;color:#c00;font-weight:bold;margin-bottom:15px;">${escapeHtml(price)}</div>` : ""}
        ${specification ? `<div class="product-detail-spec" style="font-size:13px;color:#666;margin-bottom:15px;line-height:1.6;">${specification}</div>` : ""}
        ${ctaHtml}
      </div>
    </div>
    ${contents ? `<div class="product-detail-desc" style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:13px;color:#555;line-height:1.8;">${contents}</div>` : ""}
  </div>`;
}

interface ProductDisplaySettings {
  itemsPerRow?: number;
  totalRows?: number;
  thumbWidth?: number;
  thumbHeight?: number;
  detailWidth?: number;
  /** Which CTA buttons appear on the product detail page.
   *   "sales"   — [구매하기] + [바로구매]   (general retail, default)
   *   "inquiry" — [Send inquiry] + inline form (B2B / export)
   *   "none"    — no buttons, display-only catalog
   */
  buttonMode?: "sales" | "inquiry" | "none";
  /** When true, inject a unified search box (products + board) into the
   *  published header and enable the ?action=search results page. Opt-in
   *  per site via 데이터관리 → 상품관리. */
  searchEnabled?: boolean;
  /** Whether to include board posts in the unified search results.
   *  Default true. Set false to limit search to products only. */
  boardSearchEnabled?: boolean;
}

async function renderProductList(
  siteId: string, shopId: string, lang: string, category: number, page: number, urlPrefix: string, goodsPage: string = "goods", prodSettings?: ProductDisplaySettings, tempDomain: string = "home.homenshop.com"
): Promise<string> {
  // Get categories from Prisma
  const categories = await prisma.productCategory.findMany({
    where: { siteId, lang },
    orderBy: { legacyId: "asc" },
  });

  // Category tabs
  // Semantic classes (product-tabs / product-tab / product-tab-active) are
  // emitted alongside legacy inline styles so themed CSS can override the
  // default look without disturbing un-themed legacy templates.
  const allHref = `${urlPrefix}/${lang}/${goodsPage}.html?action=list`;
  const tabClass = (active: boolean) =>
    `product-tab${active ? " product-tab-active" : ""}`;
  const tabInline = (active: boolean) =>
    `display:inline-block;padding:8px 20px;margin:0 2px;text-decoration:none;font-size:13px;font-weight:bold;color:${active ? '#fff' : '#555'};background:${active ? '#666' : '#f5f5f5'};border:1px solid #ddd;`;
  const catTabs = categories.map((c) => {
    const catId = c.legacyId ?? 0;
    const catName = c.name || "";
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=list&category=${catId}`;
    const active = catId === category;
    return `<a href="${href}" class="${tabClass(active)}" style="${tabInline(active)}">${escapeHtml(catName)}</a>`;
  }).join("");
  const allActive = category === 0;
  const tabsHtml = `<div class="product-tabs" style="margin-bottom:20px;text-align:center;">
    <a href="${allHref}" class="${tabClass(allActive)}" style="${tabInline(allActive)}">All</a>
    ${catTabs}
  </div>`;

  // Display settings: specific category uses its settings, All uses prodSettings
  const catSetting = category > 0
    ? categories.find((c) => c.legacyId === category)
    : null;
  let imgW: number, imgH: number, itemsPerRow: number, totalRows: number;
  if (category > 0 && catSetting) {
    imgW = catSetting.imgWidth || 120;
    imgH = catSetting.imgHeight || 120;
    itemsPerRow = catSetting.rows || 4;
    totalRows = 5;
  } else {
    imgW = prodSettings?.thumbWidth || 120;
    imgH = prodSettings?.thumbHeight || 120;
    itemsPerRow = prodSettings?.itemsPerRow || 4;
    totalRows = prodSettings?.totalRows || 5;
  }
  const titleLen = catSetting?.titleLen || 40;
  const perPage = Math.max(itemsPerRow * totalRows, 20);

  // Query products from Prisma
  const productWhere: Record<string, unknown> = { siteId };
  if (category > 0) productWhere.category = String(category);
  const offset = (page - 1) * perPage;

  const total = await prisma.product.count({ where: productWhere });
  const products = await prisma.product.findMany({
    where: productWhere,
    orderBy: { legacyId: "desc" },
    skip: offset,
    take: perPage,
  });
  const totalPages = Math.ceil(total / perPage);

  // Render product items
  const items = products.map((p) => {
    const pname = p.name || "";
    // Use images (JSON array) first, fall back to photos (pipe-delimited legacy)
    const imgs = (p.images as string[] | null) || [];
    const legacyPhotos = p.photos ? p.photos.split("|").filter(Boolean) : [];
    const allPhotos = imgs.length > 0 ? imgs : legacyPhotos;
    const firstPhoto = allPhotos[0] || "";
    let imgSrc = "";
    if (firstPhoto) {
      if (firstPhoto.startsWith("/") || firstPhoto.startsWith("http")) {
        imgSrc = firstPhoto;
      } else {
        imgSrc = `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`;
      }
    }
    // Use pid= for Prisma products with no legacyId, id= for legacy
    const idParam = p.legacyId ? `id=${p.legacyId}` : `pid=${p.id}`;
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=read&${idParam}`;
    const price = p.price > 0 ? `<div class="product-item-price" style="color:#c00;font-size:12px;margin-top:2px;">$${escapeHtml(String(p.price))}</div>` : "";
    return `<div class="product-item" style="text-align:center;">
      <a class="product-item-imglink" href="${href}">
        ${imgSrc ? `<img class="product-item-img" src="${imgSrc}" style="width:100%;max-width:${imgW}px;height:${imgH}px;object-fit:contain;border:1px solid #eee;" alt="${escapeHtml(pname)}" />` : `<div class="product-item-imgph" style="width:100%;max-width:${imgW}px;height:${imgH}px;background:#f9f9f9;border:1px solid #eee;margin:0 auto;"></div>`}
      </a>
      <div class="product-item-name" style="font-size:11px;color:#333;margin-top:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;max-height:2.8em;">
        <a href="${href}" style="color:#333;text-decoration:none;">${escapeHtml(pname)}</a>
      </div>
      ${price}
    </div>`;
  }).join("");

  // Pagination (show ±5 pages around current, plus first/last)
  let paginationHtml = "";
  if (totalPages > 1) {
    const catParam = category > 0 ? `&category=${category}` : "";
    const makeLink = (i: number) => {
      const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=list${catParam}&page=${i}`;
      return i === page
        ? `<span class="product-page product-page-active" style="display:inline-block;padding:4px 10px;margin:0 2px;font-weight:bold;color:#333;border:1px solid #333;">${i}</span>`
        : `<a class="product-page" href="${href}" style="display:inline-block;padding:4px 10px;margin:0 2px;color:#666;text-decoration:none;border:1px solid #ddd;">${i}</a>`;
    };
    const links: string[] = [];
    const rangeStart = Math.max(1, page - 5);
    const rangeEnd = Math.min(totalPages, page + 5);
    if (rangeStart > 1) { links.push(makeLink(1)); if (rangeStart > 2) links.push(`<span class="product-page-ellipsis" style="padding:4px 6px;color:#999;">...</span>`); }
    for (let i = rangeStart; i <= rangeEnd; i++) links.push(makeLink(i));
    if (rangeEnd < totalPages) { if (rangeEnd < totalPages - 1) links.push(`<span class="product-page-ellipsis" style="padding:4px 6px;color:#999;">...</span>`); links.push(makeLink(totalPages)); }
    paginationHtml = `<div class="product-pagination" style="text-align:center;margin-top:20px;">${links.join("")}</div>`;
  }

  return `<div class="product-content" style="max-width:900px;margin:20px auto;padding:20px;font-family:Tahoma,Arial,sans-serif;">
    ${tabsHtml}
    <div class="product-grid" style="display:grid;grid-template-columns:repeat(${itemsPerRow}, 1fr);gap:24px 12px;">${items}</div>
    ${paginationHtml}
  </div>`;
}

/* ─── Unified search (products + board) ──────────────────────────────
 * Opt-in per site (productSettings.searchEnabled). Renders a combined
 * results page for ?action=search&q=… split into a Product section and a
 * Board section. Uses Prisma `contains` (case-insensitive) so it works
 * for any migrated site without depending on the MeiliSearch index. */
type SearchLabels = { title: string; products: string; boards: string; empty: string; promptEmpty: string; resultsFor: string; placeholder: string; searchBtn: string };
const SEARCH_LABELS: Record<string, SearchLabels> = {
  ko: { title: "검색 결과", products: "상품", boards: "게시판", empty: "검색 결과가 없습니다.", promptEmpty: "검색어를 입력해 주세요.", resultsFor: "검색어", placeholder: "상품·게시판 검색", searchBtn: "검색" },
  en: { title: "Search results", products: "Products", boards: "Board", empty: "No results found.", promptEmpty: "Please enter a search term.", resultsFor: "Query", placeholder: "Search products & board", searchBtn: "Search" },
  ja: { title: "検索結果", products: "商品", boards: "掲示板", empty: "検索結果がありません。", promptEmpty: "検索語を入力してください。", resultsFor: "検索語", placeholder: "商品・掲示板を検索", searchBtn: "検索" },
  "zh-cn": { title: "搜索结果", products: "产品", boards: "公告板", empty: "没有搜索结果。", promptEmpty: "请输入搜索词。", resultsFor: "搜索词", placeholder: "搜索产品和公告板", searchBtn: "搜索" },
  "zh-tw": { title: "搜尋結果", products: "產品", boards: "公告板", empty: "沒有搜尋結果。", promptEmpty: "請輸入搜尋詞。", resultsFor: "搜尋詞", placeholder: "搜尋產品與公告板", searchBtn: "搜尋" },
  es: { title: "Resultados", products: "Productos", boards: "Tablón", empty: "Sin resultados.", promptEmpty: "Introduce un término de búsqueda.", resultsFor: "Búsqueda", placeholder: "Buscar productos y tablón", searchBtn: "Buscar" },
};
function searchLabels(lang: string): SearchLabels {
  return SEARCH_LABELS[lang] || SEARCH_LABELS["en"];
}

async function renderSearch(
  siteId: string, shopId: string, lang: string, rawQuery: string,
  urlPrefix: string, goodsPage: string, tempDomain: string,
  includeBoard: boolean = true,
): Promise<string> {
  const L = searchLabels(lang);
  const q = rawQuery.trim();
  const wrap = (inner: string) =>
    `<div class="board-content hns-search-results" style="max-width:1100px;width:100%;margin:24px auto;padding:0 20px;box-sizing:border-box;position:relative;">${inner}</div>`;

  if (!q) {
    return wrap(`<h2 style="font-size:22px;font-weight:700;margin:0 0 16px;">${escapeHtml(L.title)}</h2><p style="color:#888;">${escapeHtml(L.promptEmpty)}</p>`);
  }

  // Case-insensitive partial match across the most relevant text fields.
  const [products, posts] = await Promise.all([
    prisma.product.findMany({
      where: {
        siteId,
        lang,
        status: { not: "HIDDEN" },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { specification: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { legacyId: "desc" },
      take: 60,
    }),
    // Board search is gated by includeBoard (productSettings.boardSearchEnabled).
    // We deliberately drop the isPublic filter because legacy-migrated posts
    // often carry isPublic=false even though renderBoardList/Read publish them.
    // Keeping that filter caused publicly-visible posts (e.g. ybsurplus post 54
    // "Nikon Asml Mask") to be missing from search results — surprising users.
    includeBoard
      ? prisma.boardPost.findMany({
          where: {
            siteId,
            lang,
            parentId: null,
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { content: { contains: q, mode: "insensitive" } },
            ],
          },
          orderBy: { legacyId: "desc" },
          take: 60,
          select: { legacyId: true, title: true, author: true, regdate: true, category: { select: { name: true } } },
        })
      : Promise.resolve([] as Array<{ legacyId: number | null; title: string; author: string; regdate: string | null; category: { name: string } | null }>),
  ]);

  // Product cards (mirrors renderProductList markup, compact grid)
  const productCards = products.map((p) => {
    const pname = p.name || "";
    const imgs = (p.images as string[] | null) || [];
    const legacyPhotos = p.photos ? p.photos.split("|").filter(Boolean) : [];
    const firstPhoto = (imgs.length > 0 ? imgs : legacyPhotos)[0] || "";
    let imgSrc = "";
    if (firstPhoto) {
      imgSrc = (firstPhoto.startsWith("/") || firstPhoto.startsWith("http"))
        ? firstPhoto
        : `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`;
    }
    const idParam = p.legacyId ? `id=${p.legacyId}` : `pid=${p.id}`;
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=read&${idParam}`;
    return `<a class="hns-sr-card" href="${href}">
      <div class="hns-sr-thumb">${imgSrc ? `<img src="${imgSrc}" loading="lazy" alt="${escapeHtml(pname)}" />` : `<div class="hns-sr-ph"></div>`}</div>
      <div class="hns-sr-name">${escapeHtml(pname)}</div>
    </a>`;
  }).join("");

  // Board rows
  const boardRows = posts.map((r) => {
    const title = escapeHtml(r.title || "");
    const date = (r.regdate || "").slice(0, 10);
    const cat = r.category?.name ? escapeHtml(r.category.name) : "";
    const inner = `<span class="hns-sr-bt">${title}</span>${cat ? `<span class="hns-sr-bc">${cat}</span>` : ""}${date ? `<span class="hns-sr-bd">${date}</span>` : ""}`;
    return r.legacyId
      ? `<a class="hns-sr-row" href="${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}">${inner}</a>`
      : `<div class="hns-sr-row">${inner}</div>`;
  }).join("");

  const css = `
    .hns-search-results h2 { font-size:22px; font-weight:700; margin:0 0 4px; color:inherit; }
    .hns-search-results .hns-sr-q { color:#888; font-size:13px; margin:0 0 20px; }
    .hns-search-results h3 { font-size:15px; font-weight:700; margin:24px 0 12px; padding-bottom:8px; border-bottom:1px solid rgba(128,128,128,.2); display:flex; align-items:center; gap:8px; }
    .hns-search-results h3 .cnt { font-family:'JetBrains Mono',monospace; font-size:12px; color:#888; font-weight:500; }
    .hns-sr-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:18px 12px; }
    .hns-sr-card { display:block; text-decoration:none; color:inherit; }
    .hns-sr-thumb { width:100%; aspect-ratio:1/1; border:1px solid #eee; border-radius:8px; overflow:hidden; background:#fafafa; }
    .hns-sr-thumb img { width:100%; height:100%; object-fit:contain; display:block; }
    .hns-sr-ph { width:100%; height:100%; background:#f3f4f6; }
    .hns-sr-name { font-size:12px; margin-top:6px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .hns-sr-card:hover .hns-sr-name { color:#f28a17; }
    .hns-sr-list { display:flex; flex-direction:column; }
    .hns-sr-row { display:flex; align-items:center; gap:10px; padding:12px 4px; border-bottom:1px solid rgba(128,128,128,.12); text-decoration:none; color:inherit; }
    .hns-sr-row:hover { background:rgba(255,181,71,.06); }
    .hns-sr-bt { flex:1; min-width:0; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .hns-sr-bc { font-size:11px; color:#888; border:1px solid rgba(128,128,128,.25); border-radius:4px; padding:1px 6px; white-space:nowrap; }
    .hns-sr-bd { font-family:'JetBrains Mono',monospace; font-size:11px; color:#999; white-space:nowrap; }
    .hns-sr-empty { color:#888; padding:14px 4px; font-size:13px; }
    @media (max-width:900px){ .hns-sr-grid{ grid-template-columns:repeat(3,1fr); } }
    @media (max-width:520px){ .hns-sr-grid{ grid-template-columns:repeat(2,1fr); } }
  `.replace(/\n\s+/g, "\n");

  const total = products.length + posts.length;
  return wrap(`<style>${css}</style>
    <h2>${escapeHtml(L.title)}</h2>
    <p class="hns-sr-q">${escapeHtml(L.resultsFor)}: <b>${escapeHtml(q)}</b> · ${total}</p>
    ${total === 0 ? `<p class="hns-sr-empty">${escapeHtml(L.empty)}</p>` : ""}
    ${products.length > 0 ? `<h3>${escapeHtml(L.products)} <span class="cnt">${products.length}</span></h3><div class="hns-sr-grid">${productCards}</div>` : ""}
    ${posts.length > 0 ? `<h3>${escapeHtml(L.boards)} <span class="cnt">${posts.length}</span></h3><div class="hns-sr-list">${boardRows}</div>` : ""}
  `);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shopId: string; lang: string; slug?: string[] }> }
) {
  const { shopId, lang, slug } = await params;
  const url = new URL(request.url);

  // Auto-detect language: lang="_" means no language in URL, redirect to site's default
  if (lang === "_") {
    const siteForLang = await prisma.site.findUnique({
      where: { shopId },
      select: { defaultLanguage: true },
    });
    const defaultLang = siteForLang?.defaultLanguage || "ko";
    const hostHeader = request.headers.get("host") || "";
    // Custom domain = NOT one of our managed multi-tenant temp hosts.
    // home.homenshop.com, aesthetic.helper.so AND reseller `home.{domain}`
    // hosts all route by /{shopId}, so none is a per-site bound custom domain.
    const isCustomDomain =
      !!hostHeader &&
      !isManagedTempHost(hostHeader) &&
      !(await isResellerHomeHost(hostHeader));
    const prefix = isCustomDomain ? "" : `/${shopId}`;
    const slugPath = slug?.join("/") || "";
    const qs = url.search || "";
    return NextResponse.redirect(
      `https://${hostHeader}${prefix}/${defaultLang}/${slugPath}${qs}`,
      301
    );
  }

  const action = url.searchParams.get("action") || "";
  const rawBoardId = parseInt(url.searchParams.get("id") ?? "", 10);
  const boardId = Number.isFinite(rawBoardId) && rawBoardId > 0 ? rawBoardId : 0;
  const rawBoardCategory = parseInt(url.searchParams.get("category") ?? "", 10);
  const boardCategory = Number.isFinite(rawBoardCategory) && rawBoardCategory > 0 ? rawBoardCategory : 0;
  const boardPage = parsePageParam(url.searchParams.get("page"));
  const prismaProductId = url.searchParams.get("pid") || "";

  // Detect custom domain: anything that is NOT one of our managed temp
  // hosts (home.homenshop.com / aesthetic.helper.so / …). Custom domains
  // are bound 1:1 to a site so they omit /{shopId} from URLs; managed
  // temp hosts multiplex many sites under /{shopId}/{lang}/.
  const hostHeader = request.headers.get("host") || request.headers.get("x-forwarded-host") || "";
  // Reseller `home.{domain}` hosts are managed multi-tenant hosts (path-based
  // /{shopId}/...), NOT per-site custom domains — keep the /{shopId} prefix so
  // internal links don't lose the shopId (which caused shopless `/ko/*.html`
  // URLs → wrong-lang redirect loop on reseller member-site hosts).
  // Reseller member-site host branding (null on non-reseller hosts). Drives
  // both multi-tenant routing AND white-label expired/preparing pages.
  const resellerHomeBrand = hostHeader ? await getResellerHomeBranding(hostHeader) : null;
  const isResellerHome = !!resellerHomeBrand;
  const isCustomDomain =
    !!hostHeader && !isManagedTempHost(hostHeader) && !isResellerHome;
  const urlPrefix = isCustomDomain ? "" : `/${shopId}`;

  // Find the site by shopId with lang-filtered pages and HMF translations
  const site = await prisma.site.findUnique({
    where: { shopId },
    include: {
      pages: {
        where: { lang },
        orderBy: { sortOrder: "asc" },
      },
      hmfTranslations: true,
    },
  });

  if (!site) {
    // On a reseller member-site host, never let nginx fall through to the
    // homeNshop-branded static /expired.html. Serve a white-label page with a
    // status nginx does NOT intercept (410, not 404).
    if (resellerHomeBrand) {
      return new NextResponse(renderExpiredPage(shopId, "", resellerHomeBrand), {
        status: 410,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  // Host used for absolute asset + SEO URLs (image src, OG, canonical,
  // hreflang). On a reseller `home.{domain}` host, use that SAME host so the
  // reseller's published pages are fully white-label — never leaking
  // home.homenshop.com into page source / canonical / OG. That host already
  // serves /{shopId}/uploaded, /tpl, /thumb, … via the multi-tenant snippet,
  // so the URLs resolve. Otherwise fall back to the site's stable temp domain
  // (keeps SEO stable across the homenshop/helper aliases).
  const tempDomain = isResellerHome
    ? hostHeader.split(":")[0].toLowerCase()
    : getTempDomain(site);
  if (isSiteExpired(site)) {
    return new NextResponse(renderExpiredPage(shopId, site.name, resellerHomeBrand), {
      status: 410,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  if (!site.published) {
    // Site exists, owner just hasn't published yet. Returning 404 here
    // would let nginx's @legacy_static fallback hijack the response and
    // serve the legacy /expired.html — which says "계정이 만료되어
    // 삭제되었습니다". That's a flat-out lie for a brand-new site, so we
    // serve a "준비 중" page with a 200 instead.
    return new NextResponse(renderPreparingPage(shopId, site.name, true, resellerHomeBrand), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Fallback: if no pages for this lang, try defaultLanguage
  let pages = site.pages;
  if (pages.length === 0 && lang !== site.defaultLanguage) {
    const fallbackPages = await prisma.page.findMany({
      where: { siteId: site.id, lang: site.defaultLanguage },
      orderBy: { sortOrder: "asc" },
    });
    pages = fallbackPages;
  }

  // Select HMF for current language, fallback to Site defaults
  // Use || instead of ?? for menuHtml: empty string from "auto" mode should fall back to Site default
  const hmf = site.hmfTranslations?.find((h) => h.lang === lang)
    || site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);
  const siteHeaderHtml = hmf?.headerHtml ?? site.headerHtml ?? "";
  const siteMenuHtml = hmf?.menuHtml || site.menuHtml || "";
  const siteFooterHtml = hmf?.footerHtml ?? site.footerHtml ?? "";

  // Determine which page to show
  const pageSlug = slug?.[0]?.replace(/\.html$/, "") || "index";
  let page = pages.find((p) => p.slug === pageSlug);
  // Alias: goods <-> product
  if (!page && pageSlug === "goods") page = pages.find((p) => p.slug === "product");
  if (!page && pageSlug === "product") page = pages.find((p) => p.slug === "goods");
  if (!page) {
    page = pages.find((p) => p.isHome) || pages[0];
  }
  if (!page) {
    // Same nginx-404-hijack concern as the !published case above.
    // A fresh site that just had its Site row inserted but pages still
    // racing to commit hits this branch. Serve "준비 중" instead of a
    // 404 that nginx will replace with the legacy expired.html.
    return new NextResponse(renderPreparingPage(shopId, site.name, true, resellerHomeBrand), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Extract body HTML
  const pageContent = page.content as { html?: string; layers?: SceneGraph } | null;
  let bodyHtml = pageContent?.layers
    ? sceneToLegacyHtml(pageContent.layers)
    : (pageContent?.html || "");

  // Board read/list: render board content (replaces page body for board action pages)
  let boardSectionHtml = "";
  // Detect actual product page slug for URLs
  const productPageSlug = pages.find((p) => p.slug === "goods") ? "goods" : pages.find((p) => p.slug === "product") ? "product" : "goods";
  // Detect product vs board action
  const isProductPage = pageSlug === "goods" || pageSlug === "product";
  const isBoardPage = pageSlug === "board";
  // Product/Board page without action: default to list view
  const effectiveAction = ((isProductPage || isBoardPage) && !action) ? "list" : action;
  const isBoardAction = !isProductPage && (effectiveAction === "read" || effectiveAction === "list") && (isBoardPage || boardId > 0 || boardCategory > 0);
  const isProductAction = isProductPage && (effectiveAction === "read" || effectiveAction === "list");

  // Modern (responsive, in-flow) templates use a "page-header" + dynamic
  // list pattern: the body chrome is small and positioned in the normal
  // document flow, so prepending it before the list looks intentional. We
  // detect those by the HNS-MODERN-TEMPLATE marker their cssText carries.
  // Legacy templates use absolute-positioned full-page layouts that would
  // collide with an injected list, so we keep wiping bodyHtml for them.
  const isModernTpl =
    typeof site.cssText === "string" && site.cssText.includes("HNS-MODERN-TEMPLATE");

  const prodSettings = (site.productSettings as ProductDisplaySettings | null) || undefined;
  // Unified search (opt-in per site). search.html?action=search&q=… falls
  // back to the home page slug, so we clear bodyHtml unconditionally and
  // render the combined results into #hns_body.
  const searchEnabled = prodSettings?.searchEnabled === true;
  const isSearchAction = searchEnabled && action === "search";
  if (isSearchAction) {
    // boardSearchEnabled defaults to true so existing opt-ins keep including
    // board posts; setting it false limits search to products only.
    const includeBoard = prodSettings?.boardSearchEnabled !== false;
    boardSectionHtml = await renderSearch(site.id, shopId, lang, url.searchParams.get("q") || "", urlPrefix, productPageSlug, tempDomain, includeBoard);
    bodyHtml = "";
  } else if (isProductAction) {
    if (effectiveAction === "read" && prismaProductId) {
      boardSectionHtml = await renderProductRead(site.id, shopId, lang, 0, urlPrefix, productPageSlug, prismaProductId, prodSettings, tempDomain);
    } else if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = await renderProductRead(site.id, shopId, lang, boardId, urlPrefix, productPageSlug, undefined, prodSettings, tempDomain);
    } else if (effectiveAction === "list") {
      boardSectionHtml = await renderProductList(site.id, shopId, lang, boardCategory, boardPage, urlPrefix, productPageSlug, prodSettings, tempDomain);
    }
    if (boardSectionHtml && !isModernTpl) {
      bodyHtml = "";
    }
  } else if (isBoardAction) {
    if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = await renderBoardRead(site.id, shopId, lang, boardId, urlPrefix, tempDomain);
    } else if (effectiveAction === "list") {
      boardSectionHtml = await renderBoardList(site.id, shopId, lang, boardCategory, boardPage, urlPrefix, tempDomain);
    }
    // Board action pages: clear body HTML for legacy absolute-positioned
    // templates (where leftover page elements create unwanted space).
    // Modern in-flow templates keep their page-header chrome.
    if (boardSectionHtml && !isModernTpl) {
      bodyHtml = "";
    }
  }

  // Get template CSS
  const templatePath = site.templatePath || "";

  // BoardPlugin: inject dynamic board lists into page body (for all pages)
  bodyHtml = await renderBoardPluginContent(site.id, shopId, lang, pageSlug, bodyHtml, urlPrefix, tempDomain);

  // ProductPlugin: inject dynamic product lists into page body
  bodyHtml = await renderProductPluginContent(site.id, shopId, lang, pageSlug, bodyHtml, urlPrefix, tempDomain);
  let templateCss = "";
  if (templatePath) {
    templateCss = readTemplateCss(templatePath);
  }

  // Get page-specific CSS — boost position/size properties with !important
  // so they override site-upgrade.css !important rules (pageCss is page-specific)
  const rawPageCss = (page as any).css || "";
  // Strip base-level geometry that an inline-positioned element owns (drag/resize
  // wrote it as plain inline). Without this the boosted page-CSS rule
  // `#id{left:..!important}` beats the element's plain inline value, so the
  // object snaps back to its old CSS position.
  //
  // Owners must include BOTH the body AND the raw HMF (header/menu/footer) HTML.
  // HMF objects (logo, nav `#v-wdg-nav`, header/footer images) are pinned via
  // SiteHmf inline styles shared across all pages, but per-page CSS can carry
  // legacy `#id{left:..!important}` rules with stale coordinates. The editor
  // canvas strips those (design-editor.tsx collectInlineGeometryOwners over
  // header+menu+footer), so the editor shows the inline position — but the
  // published route previously scanned only `bodyHtml`, leaving the stale CSS
  // to win and shifting header objects (e.g. the nav 26px right of the editor),
  // which desynced sushi-icon ↔ menu alignment. Scan the HMF HTML too so the
  // inline geometry governs in BOTH places. Device `@media` blocks preserved.
  const strippedPageCss = stripPinnedGeometryCss(
    rawPageCss,
    collectInlineGeometryOwners(
      bodyHtml + siteHeaderHtml + siteMenuHtml + siteFooterHtml,
    ),
  );
  let pageCss = strippedPageCss.replace(
    /(\b(?:top|left|width|height|display|position|z-index)\s*:\s*)([^;!}]+)(;|})/gi,
    (_: string, prop: string, val: string, end: string) =>
      val.trim().includes('!important') ? `${prop}${val}${end}` : `${prop}${val.trim()} !important${end}`
  );
  // Force /api/img URLs in pageCss to absolute (only exists on homenshop.net)
  pageCss = rewriteApiImgUrls(pageCss);

  // Rewrite CSS url() for bare filenames
  const tplFilesBase = `/tpl/${templatePath}/files`;
  let siteCss = (site.cssText || "").replace(
    /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
    (_, filename: string) => `url(${tplFilesBase}/${filename})`
  );
  // Strip body background-image (legacy bg.jpg/tm.gif don't render properly in new system)
  siteCss = siteCss.replace(
    /(body\s*\{[^}]*?)background\s*:\s*url\([^)]*\)[^;]*;?/gi,
    "$1"
  );
  siteCss = rewriteApiImgUrls(siteCss);

  // Detect modern template. Signals:
  //   - Legacy heuristic: 100vw breakout uses `calc(-50vw + 50%)`
  //   - Explicit marker: `/* HNS-MODERN-TEMPLATE */` in template or site CSS
  //     (added to system templates like Agency, Plus Academy that author
  //      full-width layouts with `max-width: 100%` containers rather than
  //      fixed 1000/1200/1360px centered blocks). Without this flag the
  //      scale-to-fit script would force the body to 1000px and defeat
  //      the template's full-width intent.
  const allCss = templateCss + siteCss;
  const isModernTemplate =
    allCss.includes("calc(-50vw + 50%)") ||
    allCss.includes("calc(-50vw+50%)") ||
    allCss.includes("/* HNS-MODERN-TEMPLATE */");

  // Generate dynamic menu from pages list (respects showInMenu, parentId, hidden pages)
  const skipSlugs = new Set(["user", "users", "agreement", "empty"]);
  const visiblePages = pages.filter(
    (p) => p.showInMenu !== false && !skipSlugs.has(p.slug)
  );
  const topLevelPages = visiblePages.filter((p) => !p.parentId);
  const getChildren = (parentId: string) =>
    visiblePages.filter((p) => p.parentId === parentId);

  // Per-item menu icon (Page.menuIcon): rendered ABOVE the label so a site
  // can place a small decorative/category icon over each top-menu entry. The
  // menu is generated from the pages list, so this is automatically identical
  // on every page (replaces the legacy per-page absolutely-positioned icon
  // <div>s that drifted out of alignment from page to page).
  const menuIconImg = (icon: string | null | undefined) =>
    icon
      ? `<img class="hns-menu-icon" src="${escapeHtml(icon)}" alt="" aria-hidden="true">`
      : "";
  const menuItems = topLevelPages
    .map((p) => {
      const label = p.menuTitle || p.title;
      const icon = menuIconImg((p as { menuIcon?: string | null }).menuIcon);
      const href = p.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${p.slug}.html`;
      const target = p.externalUrl && /^https?:\/\//.test(p.externalUrl) ? ` target="_blank"` : "";
      const actualHref = p.externalUrl || href;
      const children = getChildren(p.id);

      if (children.length === 0) {
        return `<li><a title="${label}" href="${actualHref}"${target}>${icon}<span class="hns-menu-label">${label}</span></a></li>`;
      }

      const subItems = children
        .map((c) => {
          const cLabel = c.menuTitle || c.title;
          const cIcon = menuIconImg((c as { menuIcon?: string | null }).menuIcon);
          const cHref = c.externalUrl || (c.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${c.slug}.html`);
          const cTarget = c.externalUrl && /^https?:\/\//.test(c.externalUrl) ? ` target="_blank"` : "";
          return `<li><a title="${cLabel}" href="${cHref}"${cTarget}>${cIcon}<span class="hns-menu-label">${cLabel}</span></a></li>`;
        })
        .join("");

      return `<li><a title="${label}" href="${actualHref}"${target}>${icon}<span class="hns-menu-label">${label}</span></a><ul class="submenu">${subItems}</ul></li>`;
    })
    .join("");
  const generatedMenu = `<ul class="mainmenu">${menuItems}</ul>`;
  // Stacking CSS — only emitted when at least one item actually has an icon,
  // so icon-less sites are untouched. Each menu link becomes a centered
  // column (icon on top, label below).
  const hasMenuIcons = topLevelPages.some(
    (p) => !!(p as { menuIcon?: string | null }).menuIcon
  );
  const menuIconCss = hasMenuIcons
    ? `
    .mainmenu > li > a { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; line-height: 1.15; }
    .mainmenu .hns-menu-icon { display: block; width: auto; height: auto; max-width: 46px; max-height: 38px; margin: 0 auto; pointer-events: none; }
    .mainmenu .submenu .hns-menu-icon { max-width: 28px; max-height: 24px; }
    `
    : "";

  // Build language switcher HTML
  const siteLanguages = (site as any).languages as string[] | undefined;
  let langSwitcherHtml = "";
  let langBannerHtml = "";
  if (siteLanguages && siteLanguages.length > 1) {
    const langNames: Record<string, string> = {
      ko: "한국어",
      en: "English",
      ja: "日本語",
      "zh-cn": "中文 (简)",
      "zh-tw": "中文 (繁)",
      es: "Español",
    };
    // 2026-05-19 사용자 보고:
    //   (a) 셀렉트박스가 중앙 정렬 → 오른쪽 정렬로
    //   (b) 언어 선택해도 전환이 안 됨 → switchScript IIFE 닫는 brace 1개
    //       누락(SyntaxError) 수정. 이전: `}})` → 수정: `}}})`. 안전을 위해
    //       inline IIFE 대신 named function으로 분리하여 가독성/디버깅 ↑.
    const switchScript = `(function(l){var p=window.location.pathname;var m=p.match(/^\\/(ko|en|ja|zh-cn|zh-tw|es)\\//);if(m){window.location.href='/'+l+p.substring(m[0].length-1);}else{var m2=p.match(/^\\/[^\\/]+\\/(ko|en|ja|zh-cn|zh-tw|es)\\//);if(m2){window.location.href=p.replace(m2[0],'/'+p.split('/')[1]+'/'+l+'/');}else{window.location.href='/'+l+'/index.html';}}})`;
    const options = siteLanguages
      .map((l) => {
        const selected = l === lang ? " selected" : "";
        return `<option value="${l}"${selected}>${langNames[l] || l}</option>`;
      })
      .join("");
    // Footer-positioned switcher. 오른쪽 정렬 + 미세한 패딩으로 모달감 약화.
    langSwitcherHtml = `<div style="text-align:right;padding:16px 20px;font-size:12px;color:#888;">
  <label for="hns-lang-switch" style="margin-right:8px;">🌐</label>
  <select id="hns-lang-switch" onchange="${switchScript}(this.value)" style="font-size:12px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer;">${options}</select>
</div>`;

    // First-visit banner — if the user's browser language differs from
    // the page's language AND they haven't dismissed the banner, offer
    // to switch. Cookie 'hns_lang_banner_dismissed' lasts 30 days. The
    // detection runs client-side so it works for static-cached pages.
    const langLabels: Record<string, { switchTo: string; dismiss: string; suggestion: string }> = {
      ko: { switchTo: "한국어로 보기", dismiss: "닫기", suggestion: "한국어로 보시겠어요?" },
      en: { switchTo: "Switch to English", dismiss: "Dismiss", suggestion: "View this site in English?" },
      ja: { switchTo: "日本語で表示", dismiss: "閉じる", suggestion: "日本語で表示しますか?" },
      "zh-cn": { switchTo: "切换至中文", dismiss: "关闭", suggestion: "用中文查看?" },
      "zh-tw": { switchTo: "切換至中文", dismiss: "關閉", suggestion: "用中文查看?" },
      es: { switchTo: "Cambiar a español", dismiss: "Cerrar", suggestion: "¿Ver en español?" },
    };
    const labelsJson = JSON.stringify(langLabels);
    const sitelangsJson = JSON.stringify(siteLanguages);
    langBannerHtml = `<script>(function(){
      try {
        var current = ${JSON.stringify(lang)};
        var siteLangs = ${sitelangsJson};
        var labels = ${labelsJson};
        if (document.cookie.indexOf('hns_lang_banner_dismissed=1') !== -1) return;
        // Pick the user's preferred language that's actually offered.
        var browserLangs = (navigator.languages || [navigator.language || 'en']).map(function(s){return s.toLowerCase();});
        var pick = null;
        for (var i=0;i<browserLangs.length;i++){
          var b = browserLangs[i];
          if (siteLangs.indexOf(b) !== -1){ pick = b; break; }
          var pre = b.split('-')[0];
          if (siteLangs.indexOf(pre) !== -1){ pick = pre; break; }
          if ((b === 'zh-hans' || b === 'zh') && siteLangs.indexOf('zh-cn') !== -1){ pick = 'zh-cn'; break; }
          if (b === 'zh-hant' && siteLangs.indexOf('zh-tw') !== -1){ pick = 'zh-tw'; break; }
        }
        if (!pick || pick === current) return;
        var lbl = labels[pick] || labels.en;
        var bar = document.createElement('div');
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#0f1226;color:#fff;padding:10px 16px;font-size:13px;z-index:99999;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-family:system-ui,-apple-system,sans-serif;';
        bar.innerHTML = '<span>' + lbl.suggestion + '</span>' +
          '<button type="button" id="hns-lang-banner-yes" style="background:#3b5bff;color:#fff;border:0;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">' + lbl.switchTo + '</button>' +
          '<button type="button" id="hns-lang-banner-no" style="background:transparent;color:#aab;border:1px solid #444;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;">' + lbl.dismiss + '</button>';
        document.body.appendChild(bar);
        document.getElementById('hns-lang-banner-yes').onclick = function(){
          ${switchScript}(pick);
        };
        document.getElementById('hns-lang-banner-no').onclick = function(){
          document.cookie = 'hns_lang_banner_dismissed=1;path=/;max-age=' + (60*60*24*30) + ';SameSite=Lax';
          bar.parentNode.removeChild(bar);
        };
      } catch(e) {}
    })();</script>`;
  }

  // Rewrite asset URLs in HTML sections
  let headerHtml = templatePath
    ? rewriteAssetUrls(siteHeaderHtml, templatePath)
    : siteHeaderHtml;
  const rawMenuHtml = templatePath
    ? rewriteAssetUrls(siteMenuHtml, templatePath)
    : siteMenuHtml;
  let menuHtml: string;
  // Wrap generated menu in the nav container div that template CSS targets
  const wrappedMenu = `<div id="v-wdg-nav" class="v-home-ap-hd-nav menu dragable">${generatedMenu}</div>`;

  // AI-generated sites put the navigation inline inside headerHtml (logo + nav +
  // CTA in one row). When we also render menuHtml below, the page shows a
  // duplicate menu bar. Detect "header already has a <nav> block with links"
  // and, when true, replace the nav's links with fresh ones from the pages
  // list (keeping the header's visual design + showInMenu auto-sync) and
  // suppress the legacy second menu bar entirely.
  //
  // However: some hand-crafted headers use structured nav markup with
  // dropdowns (`<div class="has-sub">`, `<div class="ul-subnav">`, etc).
  // Overwriting those with a flat `<a>`-only link list destroys the
  // dropdown UI. We consider the nav "custom" when it contains child
  // `<div>`/`<ul>`/`<button>` elements OR has an explicit opt-out class
  // / data attribute — in those cases we preserve the nav as-authored and
  // only suppress the legacy second menu bar.
  const headerHasNavWithLinks =
    /<nav[\s>][\s\S]*?<a\s[\s\S]*?<\/nav>/i.test(headerHtml);
  const headerNavIsCustom =
    /<nav[^>]*(?:data-preserve|class="[^"]*(?:ul-nav-custom|has-dropdown)[^"]*")/i.test(headerHtml) ||
    /<nav[\s>][\s\S]*?<(?:div|ul|button|details)\b[\s\S]*?<\/nav>/i.test(headerHtml);
  // Single-page sites with on-page hash anchors (#event, #line, #visit, …)
  // — typical for Claude Designs / one-pager exports — must NOT have their
  // nav links overwritten with the page list. If the page list has only
  // "HOME" but the nav defines 5 sections on the same page, regenerating
  // would wipe out 4 navigation entries and leave the user with a single
  // HOME link. Treat the existing nav as authoritative when every link
  // inside it is a hash anchor.
  const navAllHashAnchors = (() => {
    const navMatch = /<nav\b[^>]*>([\s\S]*?)<\/nav>/i.exec(headerHtml);
    if (!navMatch) return false;
    const inside = navMatch[1];
    const hrefs = Array.from(inside.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["']/gi))
      .map((m) => m[1].trim());
    if (hrefs.length === 0) return false;
    return hrefs.every((h) => h.startsWith("#"));
  })();
  if (headerHasNavWithLinks && !headerNavIsCustom && !navAllHashAnchors) {
    const navLinks = topLevelPages
      .map((p) => {
        const label = p.menuTitle || p.title;
        const icon = menuIconImg((p as { menuIcon?: string | null }).menuIcon);
        const href = p.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${p.slug}.html`;
        const actualHref = p.externalUrl || href;
        const target = p.externalUrl && /^https?:\/\//.test(p.externalUrl) ? ` target="_blank"` : "";
        return `<a href="${actualHref}"${target}>${icon}<span class="hns-menu-label">${label}</span></a>`;
      })
      .join("\n");
    headerHtml = headerHtml.replace(
      /(<nav\b[^>]*>)([\s\S]*?)(<\/nav>)/i,
      (_m, open, _old, close) => `${open}\n${navLinks}\n${close}`
    );
    menuHtml = "";
  } else if (headerHasNavWithLinks && (headerNavIsCustom || navAllHashAnchors)) {
    // Nav is preserved as-authored (custom dropdown markup OR single-page
    // hash-anchor links); still suppress the legacy second menu bar.
    menuHtml = "";
  } else if (!rawMenuHtml) {
    // Check if the header already embeds the legacy nav widget.
    // This happens after the HMF editor saves — it merges menuHtml into
    // headerHtml for WYSIWYG editing (matching published-route structure),
    // then saves the combined result as headerHtml with empty menuHtml.
    // In that case we refresh the mainmenu links in-place and skip
    // generating a second nav widget (which would cause duplicates).
    const headerHasLegacyNavWidget =
      /id=["']v-wdg-nav["']|class=["'][^"']*v-home-ap-hd-nav/.test(headerHtml);
    if (headerHasLegacyNavWidget) {
      headerHtml = headerHtml.replace(
        /(<ul[^>]*class="mainmenu"[^>]*>)([\s\S]*?)(<\/ul>)/i,
        (_m, open, _old, close) => `${open}${menuItems}${close}`
      );
      menuHtml = "";
    } else {
      menuHtml = wrappedMenu;
    }
  } else {
    // Try to inject menu into v-wdg-jmenu-opts div first
    const jmenuReplaced = rawMenuHtml.replace(
      /(<div[^>]*id="v-wdg-jmenu-opts"[^>]*>)[^<]*(<\/div>)/i,
      `$1$2${generatedMenu}`
    );
    if (jmenuReplaced !== rawMenuHtml) {
      menuHtml = jmenuReplaced;
    } else {
      // Replace empty <ul class="mainmenu"></ul> with generated menu
      const mainmenuReplaced = rawMenuHtml.replace(
        /<ul\s+class="mainmenu">\s*<\/ul>/i,
        generatedMenu
      );
      if (mainmenuReplaced !== rawMenuHtml) {
        menuHtml = mainmenuReplaced;
      } else {
        // Check if rawMenuHtml already has menu items (any ul with li tags)
        if (/<ul[^>]*class="mainmenu"[^>]*>\s*<li/i.test(rawMenuHtml)) {
          // HMF has a complete menu — replace mainmenu contents with generated items
          // Use greedy match to capture entire mainmenu including nested submenus
          menuHtml = rawMenuHtml.replace(
            /(<ul[^>]*class="mainmenu"[^>]*>)([\s\S]*)(<\/ul>\s*<\/DIV>)/i,
            (_m, open, _old, close) => `${open}${menuItems}${close}`
          );
        } else if (/<ul[^>]*>\s*<li/i.test(rawMenuHtml)) {
          // Non-mainmenu ul with items — replace first ul contents
          menuHtml = rawMenuHtml.replace(
            /(<ul[^>]*>)([\s\S]*)(<\/ul>)/i,
            (_m, open, _old, close) => `${open}${menuItems}${close}`
          );
        } else {
          // Append generated menu after the rawMenuHtml
          menuHtml = rawMenuHtml + generatedMenu;
        }
      }
    }
  }
  const footerHtml = templatePath
    ? rewriteAssetUrls(siteFooterHtml, templatePath)
    : siteFooterHtml;
  const processedBodyHtml = templatePath
    ? rewriteAssetUrls(bodyHtml, templatePath)
    : bodyHtml;

  // Rewrite root-relative internal links (`href="/about.html"`, `action="/contact.html"`)
  // to include the site's /{shopId}/{lang} prefix. Without this, a template that
  // uses absolute paths for navigation breaks on home.homenshop.com because the
  // browser treats /about.html as the domain root. Custom domains get an empty
  // `urlPrefix`, so they fall back to /{lang}/about.html which is correct for them.
  //
  // Scope: only path-style values (begin with a single /). Skips:
  //   - protocol-relative URLs (//cdn.example/…)
  //   - external URLs (http://, https://)
  //   - hash/query-only (#foo, ?tab=x)
  //   - already-prefixed paths (starting with /${shopId}/ or /${lang}/ on custom domains)
  //   - tpl / uploaded / api asset paths that must stay rooted at domain root
  //
  // Safe to no-op for paths that are already well-formed.
  const siteBasePath = `${urlPrefix}/${lang}`; // e.g. "/test313322/ko" or "/ko" (custom)
  // `uploaded` = legacy PHP user-data path; `uploads` = Next.js /api/upload
  // destination (UPLOAD_URL default). Both are served at the domain root by
  // nginx, so they must NOT be prefixed with /{shopId}/{lang}/.
  const RESERVED_ROOTS = /^\/(tpl|uploaded|uploads|api|_next|static|favicon|ko|en|ja|zh|vi)(\/|$)/i;
  const rewriteInternalLinks = (h: string): string =>
    h.replace(
      /(href|action|src)=(["'])(\/[^"'#?][^"']*)(["'])/gi,
      (match, attr, q1, urlPath, q2) => {
        // Skip asset roots already served from the domain root.
        if (RESERVED_ROOTS.test(urlPath)) return match;
        // Skip if already prefixed with the shopId.
        if (urlPrefix && urlPath.startsWith(`${urlPrefix}/`)) return match;
        // On custom domain (empty urlPrefix), skip if already prefixed with /{lang}/.
        if (!urlPrefix && /^\/(ko|en|ja|zh|vi)\//i.test(urlPath)) return match;
        // Prepend the site base path.
        return `${attr}=${q1}${siteBasePath}${urlPath}${q2}`;
      },
    );

  // Clean editor artifacts from published HTML
  const cleanHtml = (h: string) => h
    .replace(/<div class="de-resize-handle[^"]*"[^>]*><\/div>/g, "")
    .replace(/\bde-selected\b/g, "")
    // Strip inline width/height/position styles from the root hns_header
    // /hns_menu/hns_footer wrappers. The design editor sometimes records
    // computed pixel widths (e.g. `style="width:1159px;height:113px;"`)
    // on these wrappers when the user drags/resizes the header. Those
    // pixel widths then force horizontal overflow on mobile because no
    // media query targets them. Children .dragable elements keep their
    // own inline styles — we only neutralize the three root wrappers.
    .replace(
      /(<(?:div|header)\s+id="hns_(?:header|menu|footer)"[^>]*?)\s+style="[^"]*"/gi,
      "$1",
    );
  // Demote inline geometry `!important` → plain inline on header/body/menu so
  // the device `@media` re-pins (tablet ≤1024 / mobile ≤767, themselves
  // `!important`) actually win. Without this, an inline `!important` left/top/
  // width/height (baked from legacy HTML or the editor's live-preview pin)
  // beats the stylesheet `@media !important` and freezes every breakpoint at
  // the desktop coordinates — i.e. tablet/mobile edits never show on publish.
  // Footer is handled separately by stripFooterPinnedTop (relative flow).
  const cleanedBodyHtml = rewriteInternalLinks(cleanHtml(stripInlineGeometryImportant(processedBodyHtml)));
  const cleanedHeaderHtml = rewriteInternalLinks(cleanHtml(stripInlineGeometryImportant(headerHtml)));
  menuHtml = stripInlineGeometryImportant(menuHtml);
  // Footer objects flow AFTER the body (relative), never at a fixed absolute
  // top. Strip inline top/position so the `#hns_footer > .dragable` relative
  // rule governs (inline !important would otherwise beat it). Same helper runs
  // in the editor injection, keeping editor ↔ published WYSIWYG identical.
  // Footer too: demote inline geometry `!important` so footer device re-pins
  // (left/width/height) win at tablet/mobile. top/position are then removed
  // outright by stripFooterPinnedTop for direct children (relative flow), and
  // the `#hns_footer > .dragable{top:auto!important}` rule out-specifies any
  // device `@media` top, so footer flow is unaffected.
  const cleanedFooterHtml = stripFooterPinnedTop(
    stripInlineGeometryImportant(rewriteInternalLinks(cleanHtml(footerHtml))),
  );

  // Build CSS based on template type
  const publishedCss = isModernTemplate
    ? `
    /* Modern template: section-based layout with 100vw breakouts */
    #hns_menu:empty { min-height: 0; display: none; }
    body { margin: 0; padding: 0; }
    #hns_header, #hns_body, #hns_footer { position: relative; }
    .de-resize-handle { display: none !important; }
    @media (max-width: 1240px) {
      html, body { overflow-x: hidden; }
    }
    `
    : `
    /* Legacy template: absolute positioning */
    /* ── CSS variable safe defaults ──────────────────────────────────────────
       Dark templates (e.g. body{background:#333;color:#fff}) set body-level
       colors that bleed into every element via inheritance. We:
         1. Define --brand-* fallback values so all var() theme rules work even
            when no explicit theme has been saved (overridden by HNS-THEME-TOKENS
            block in pageCss which comes later in the cascade).
         2. Reset body background + text color with !important so template rules
            never win over our neutral base.
       ──────────────────────────────────────────────────────────────────────── */
    :root {
      --brand-surface: #ffffff;
      --brand-text:    #111827;
      --brand-color:   #111827;
      --brand-accent:  #3182f6;
    }
    body {
      margin: 0; padding: 0;
      background-image: none !important;
      background-color: transparent !important;
      color: var(--brand-text) !important;
    }
    a { color: var(--brand-color); }
    #hns_header { background-color: var(--brand-surface); color: var(--brand-text); }
    #hns_body   { background-color: var(--brand-surface); }
    /* Logo image must track its box on tablet/mobile. The logo art usually
       carries a fixed inline width (e.g. 406px); on mobile the box shrinks via
       a device @media re-pin (e.g. ~324px) but the fixed img does not, so it
       overflows the 375 artboard and the logo shifts right / looks oversized.
       Cap the img to the box at ≤1024 only (desktop untouched → no regression
       for sites whose logo intentionally fills/overflows its box at full size),
       letting height follow to preserve aspect ratio. Mirrors the editor, where
       the logo fits its box. Scoped to #hns_h_logo. */
    @media (max-width: 1024px) {
      #hns_h_logo > a { display: block; }
      #hns_h_logo img { display: block; max-width: 100% !important; height: auto !important; }
      /* Facebook page embed must not push the artboard wider than the
         viewport on mobile. The widget renders at its authored width but is
         capped to the container so it never causes horizontal overflow. */
      .fb-page, .fb_iframe_widget, .fb_iframe_widget span,
      .hns-fb-embed, iframe[src*="facebook.com/plugins"],
      .hns-gmap-embed, iframe[src*="google.com/maps"], iframe[src*="maps.google"] { max-width: 100% !important; }
      /* Body/footer content images: cap a fixed-px image to its (per-device-
         shrunk) box so a 350px QR inside a 297px box scales down to fit instead
         of overflowing. Excludes object-fit fill-the-box photos (height:auto
         would collapse them). Matches the editor canvas rule (WYSIWYG). */
      #hns_body .dragable img:not([style*="object-fit"]),
      #hns_footer .dragable img:not([style*="object-fit"]) { max-width: 100% !important; height: auto !important; }
    }
    #hns_header { position: relative; }
    #hns_body { position: relative; }
    /* Positioning context so footer objects the user dragged free
       (data-hns-footer-free, absolute) are placed RELATIVE TO THE FOOTER, not
       the whole page. Relative (no offset) keeps the footer's own flow position. */
    #hns_footer { position: relative; }
    /* Default footer height (150px). Overridden by the per-device user footer
       style block (data-hns-footer) whose min-height is !important. */
    #hns_footer { min-height: 150px; }
    #hns_menu:empty { display: none; }
    #hns_footer_content { top: 0 !important; position: relative !important; }
    /* Default footer objects flow below the body. Objects the user explicitly
       dragged free (marked) keep their own absolute geometry, like the header. */
    #hns_footer > .dragable:not([data-hns-footer-free]) {
      top: auto !important;
      position: relative !important;
    }
    .de-resize-handle { display: none !important; }
    html, body { overflow-x: hidden; }
    .c_v_home_dft { overflow-x: hidden; overflow-y: visible; width: 1000px !important; margin: 0 auto !important; }
    `;

  // Device-override pages (Wix-style 3-mode absolute editor) carry their own
  // per-breakpoint `@media` re-pins, stamped with DEVICE_MEDIA_COMMENT_MARK in
  // pageCss. For those, the legacy single `vw/1000` scale would double-transform
  // (artboard scaled AND layers re-pinned), breaking WYSIWYG. Instead we scale
  // each breakpoint band by its OWN artboard width (Mobile 375 / Tablet 768 /
  // PC 1000) so the published page mirrors the editor's fixed-width artboards.
  const hasDeviceOverrides = pageCss.includes(DEVICE_MEDIA_COMMENT_MARK);

  // Real authored design width. Many legacy sites are wider than the default
  // 1000px viewport (e.g. konnichiwa's header/hero run out to ~1130px). The
  // shrink-to-fit script must scale the WHOLE authored width down — pinning to
  // 1000 clips everything past 1000 on every device. Detect it from the
  // `#v_home_dft` / `.c_v_home_dft` width rule (mirrors the editor's
  // designCanvasWidth) and never go below 1000.
  const designWidth = (() => {
    // Explicit user-set PC width (페이지 탭 → 페이지 폭) wins at ANY value,
    // including narrower than the 1000 default. Mirrors the editor's
    // designCanvasWidth so editor ⇄ published stay in lockstep.
    const managed = parsePageWidthCss(pageCss);
    if (managed) return managed;
    const sources = [pageCss, templateCss, site.cssText || ""].join("\n");
    const re =
      /(?:#v_home_dft|\.c_v_home_dft)\s*\{[^}]*?(?<![a-z-])width\s*:\s*(\d+)px/gi;
    let max = 1000;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sources)) !== null) {
      const w = parseInt(m[1], 10);
      if (w > max) max = w;
    }
    return max;
  })();

  // Scale-to-fit script only for legacy templates
  const scaleScript = isModernTemplate
    ? ''
    : hasDeviceOverrides
      ? `<script>(function(){
  window.__dbg=location.search.indexOf('debug')>-1; var el = document.getElementById('v_home_dft');
  if (!el) return;
  document.documentElement.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  document.body.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  var PCW = ${designWidth};
  el.style.cssText += 'width:'+PCW+'px;margin:0 auto;overflow-x:hidden;overflow-y:visible;position:relative;';
  function artboard(vw){ return vw <= 767 ? 375 : vw <= 1024 ? 768 : PCW; }
  function sf() {
    var vw = document.documentElement.clientWidth;
    var aw = artboard(vw);
    // Pin the artboard to its breakpoint width so the device @media re-pins
    // (which are authored against 375/768/1000) land where the editor showed
    // them, then scale the whole band to fill the viewport.
    el.style.width = aw + 'px';
    if (vw >= 1025) {
      // Desktop band: PCW artboard, centered, never scaled UP. If the user set
      // a PC width wider than the viewport, scale DOWN to fit (no h-scroll).
      if (vw < PCW) {
        var dsc = vw / PCW;
        el.style.margin = '0';
        el.style.transformOrigin = 'top left';
        el.style.transform = 'scale(' + dsc + ')';
        el.style.marginBottom = '-' + ((1 - dsc) * el.scrollHeight) + 'px';
      } else {
        el.style.margin = '0 auto';
        el.style.transform = '';
        el.style.transformOrigin = '';
        el.style.marginBottom = '';
      }
      return;
    }
    var sc = vw / aw;
    el.style.margin = '0';
    el.style.transformOrigin = 'top left';
    el.style.transform = 'scale(' + sc + ')'; if(window.__dbg){document.title='vw='+vw+' aw='+aw+' sc='+sc.toFixed(3);}
    el.style.marginBottom = '-' + ((1 - sc) * el.scrollHeight) + 'px';
  }
  sf();
  window.addEventListener('resize', sf);
})();</script>`
      : `<script>(function(){
  window.__dbg=location.search.indexOf('debug')>-1; var el = document.getElementById('v_home_dft');
  if (!el) return;
  var DW = ${designWidth};
  document.documentElement.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  document.body.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  el.style.cssText += 'width:'+DW+'px;margin:0 auto;overflow-x:hidden;overflow-y:visible;position:relative;';
  function sf() {
    var vw = document.documentElement.clientWidth;
    if (vw < DW) {
      var sc = vw / DW;
      el.style.transformOrigin = 'top left';
      el.style.transform = 'scale(' + sc + ')'; if(window.__dbg){document.title='vw='+vw+' DW='+DW+' sc='+sc.toFixed(3);}
      el.style.marginBottom = '-' + ((1 - sc) * el.scrollHeight) + 'px';
    } else {
      el.style.transform = '';
      el.style.marginBottom = '';
    }
  }
  sf();
  window.addEventListener('resize', sf);
})();</script>`;

  // Min-height calculation script only for legacy templates
  // hns_body is position:relative, so absolute children are relative to it (no offsetTop subtraction needed)
  // Recalculate after images load for accurate heights
  const minHeightScript = isModernTemplate || isBoardAction || isProductAction
    ? ''
    : `<script>(function(){var el=document.getElementById('hns_body');if(!el)return;function calc(){var m=0;var all=el.querySelectorAll('.dragable');for(var i=0;i<all.length;i++){var c=all[i],cs=window.getComputedStyle(c);if(cs.position!=='absolute'||cs.display==='none'||cs.visibility==='hidden')continue;var l=parseInt(cs.left)||0;if(el.offsetWidth>0&&l>=el.offsetWidth)continue;var t=parseInt(cs.top)||0,h=Math.max(c.offsetHeight||0,c.scrollHeight||0);if(t+h>m)m=t+h;}if(m>0)el.style.minHeight=m+'px';}calc();var imgs=el.querySelectorAll('img');var n=0;function onImg(){n++;if(n>=imgs.length)calc();}for(var j=0;j<imgs.length;j++){if(imgs[j].complete)n++;else{imgs[j].addEventListener('load',onImg);imgs[j].addEventListener('error',onImg);}}if(n>=imgs.length&&imgs.length>0)calc();setTimeout(calc,500);setTimeout(calc,1500);})();</script>`;

  // ─── Sprint 9k: runtime for `data-hns-interaction` ────────────────
  // The editor's InspectorPanel writes a JSON payload into this attribute
  // on any layer. We wire up the matching click behavior here so the
  // editor doesn't need to emit different HTML per interaction kind.
  const interactionScript = `<script>(function(){
    function scrollTo(id, smooth){
      if(!id) return;
      var el = document.getElementById(id);
      if(!el) return;
      el.scrollIntoView({behavior: smooth ? 'smooth' : 'auto', block: 'start'});
    }
    function toggleCls(id, cls){
      if(!id || !cls) return;
      var el = document.getElementById(id);
      if(!el) return;
      el.classList.toggle(cls);
    }
    function openModal(id){
      if(!id) return;
      var el = document.getElementById(id);
      if(!el) return;
      el.classList.add('is-open');
      el.setAttribute('aria-hidden', 'false');
    }
    document.addEventListener('click', function(e){
      var t = e.target;
      while(t && t.nodeType === 1){
        if(t.hasAttribute && t.hasAttribute('data-hns-interaction')) break;
        t = t.parentNode;
      }
      if(!t || !t.getAttribute) return;
      var raw = t.getAttribute('data-hns-interaction');
      if(!raw) return;
      var cfg;
      try { cfg = JSON.parse(raw); } catch(_){ return; }
      if(!cfg || !cfg.kind) return;
      if(cfg.kind === 'link'){
        if(!cfg.href) return;
        e.preventDefault();
        if(cfg.target === '_blank') window.open(cfg.href, '_blank', 'noopener');
        else window.location.href = cfg.href;
      } else if(cfg.kind === 'scrollTo'){
        e.preventDefault();
        scrollTo(cfg.targetId, cfg.smooth !== false);
      } else if(cfg.kind === 'modal'){
        e.preventDefault();
        openModal(cfg.targetId);
      } else if(cfg.kind === 'toggle'){
        e.preventDefault();
        toggleCls(cfg.targetId, cfg.className);
      }
    }, false);
  })();</script>`;

  const boardPageCss = '';

  // Per-item SEO: override page-level SEO with product/board item data
  let itemSeoTitle = "";
  let itemSeoDesc = "";
  let itemSeoKeywords = "";
  let itemOgImage = "";
  // Captured detail rows for JSON-LD (populated in the same branches)
  let productDetailForLd: {
    name: string; description?: string | null; specification?: string | null;
    price?: number | null; images: string[]; category?: string | null;
    sku?: string | null;
  } | null = null;
  let articleDetailForLd: {
    title: string; content?: string | null; author?: string | null;
    datePublished?: string | null; images: string[]; section?: string | null;
  } | null = null;
  if (isProductAction && effectiveAction === "read" && prismaProductId) {
    // SEO for Prisma product
    try {
      const pp = await prisma.product.findUnique({ where: { id: prismaProductId } });
      if (pp) {
        itemSeoTitle = pp.seoTitle?.trim() || `${pp.name} - ${site.name}`;
        const rawDesc = String(pp.description || "");
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = pp.seoDescription?.trim() || (plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc);
        itemSeoKeywords = pp.name.replace(/[,/|]/g, ", ");
        const imgs = (pp.images as string[] | null) || [];
        if (imgs[0]) itemOgImage = imgs[0];
        productDetailForLd = {
          name: pp.name,
          description: pp.description || "",
          specification: pp.specification || "",
          price: pp.price || null,
          images: imgs,
          category: pp.category || null,
          sku: pp.id,
        };
      }
    } catch { /* fallback */ }
  } else if (isProductAction && effectiveAction === "read" && boardId > 0) {
    try {
      const pRow = await prisma.product.findFirst({
        where: { siteId: site.id, legacyId: boardId },
        select: { id: true, name: true, description: true, photos: true, specification: true, price: true, category: true, images: true, seoTitle: true, seoDescription: true },
      });
      if (pRow) {
        itemSeoTitle = pRow.seoTitle?.trim() || `${pRow.name} - ${site.name}`;
        const rawDesc = pRow.specification || pRow.description || "";
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = pRow.seoDescription?.trim() || (plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc);
        itemSeoKeywords = pRow.name.replace(/[,/|]/g, ", ");
        const pPhotos = pRow.photos ? pRow.photos.split("|").filter(Boolean) : [];
        if (pPhotos[0]) {
          itemOgImage = `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(pPhotos[0])}`;
        }
        const jsonImages = (pRow.images as string[] | null) || [];
        const absImages = (jsonImages.length > 0 ? jsonImages : pPhotos).map((p) =>
          p.startsWith("http") || p.startsWith("/")
            ? p
            : `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(p)}`
        );
        productDetailForLd = {
          name: pRow.name,
          description: pRow.description || "",
          specification: pRow.specification || "",
          price: pRow.price || null,
          images: absImages,
          category: pRow.category || null,
          sku: pRow.id,
        };
      }
    } catch { /* fallback */ }
  } else if (isBoardAction && effectiveAction === "read" && boardId > 0) {
    try {
      const bRow = await prisma.boardPost.findFirst({
        where: { siteId: site.id, legacyId: boardId },
        select: { title: true, content: true, photos: true, author: true, regdate: true, seoTitle: true, seoDescription: true, category: { select: { name: true } } },
      });
      if (bRow) {
        itemSeoTitle = bRow.seoTitle?.trim() || `${bRow.title} - ${site.name}`;
        const rawDesc = bRow.content || "";
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = bRow.seoDescription?.trim() || (plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc);
        itemSeoKeywords = bRow.title;
        const bPhotos = bRow.photos ? bRow.photos.split("|").filter(Boolean) : [];
        const imageExts = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]);
        const photoImages = bPhotos.filter(p => imageExts.has(p.split(".").pop()?.toLowerCase() || ""));
        if (photoImages[0]) {
          itemOgImage = `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(photoImages[0])}`;
        }
        const absImages = photoImages.map(
          (p) => `https://${tempDomain}/${shopId}/uploaded/${encodeURIComponent(p)}`
        );
        articleDetailForLd = {
          title: bRow.title || "",
          content: bRow.content || "",
          author: bRow.author || null,
          datePublished: bRow.regdate || null,
          images: absImages,
          section: bRow.category?.name || null,
        };
      }
    } catch { /* fallback */ }
  }

  // Use item-level SEO if available, otherwise fall back to page-level
  // SEO meta source priority:
  //   1. item-level (product/board read pages) — most specific
  //   2. Page.seoTitle / seoDescription / seoKeywords — per-page override
  //   3. Site.seoMeta.title / description / keywords — ONLY for the home
  //      page. The audit runs on the homepage so its meta is homepage-
  //      scoped; applying it site-wide would clone the home title onto
  //      /company.html, /business.html, etc.
  //   4. fallback "{page.title} - {site.name}"
  const _siteSeoMetaForPage =
    site.seoMeta && typeof site.seoMeta === "object" && !Array.isArray(site.seoMeta)
      ? (site.seoMeta as Record<string, unknown>)
      : {};
  const _siteMetaTitle = page.isHome && typeof _siteSeoMetaForPage.title === "string" ? _siteSeoMetaForPage.title : "";
  const _siteMetaDesc = page.isHome && typeof _siteSeoMetaForPage.description === "string" ? _siteSeoMetaForPage.description : "";
  const _siteMetaKeywords = page.isHome && typeof _siteSeoMetaForPage.keywords === "string" ? _siteSeoMetaForPage.keywords : "";
  const finalSeoTitle = itemSeoTitle || (page as any).seoTitle || _siteMetaTitle || (page.title + ' - ' + site.name);
  const finalSeoDesc = itemSeoDesc || (page as any).seoDescription || _siteMetaDesc || "";
  const finalSeoKeywords = itemSeoKeywords || (page as any).seoKeywords || _siteMetaKeywords || "";
  const finalOgImage = itemOgImage || (page as any).ogImage || "";

  // SEO: Canonical URL and meta tags. For managed temp hosts we always
  // canonicalize to the site's chosen tempDomain (not the host header)
  // so visiting via the alias does not create duplicate-content URLs.
  const canonicalBase = isCustomDomain ? `https://${hostHeader}` : `https://${tempDomain}/${shopId}`;
  const canonicalUrl = `${canonicalBase}/${lang}/${pageSlug}.html${(effectiveAction === "read" && boardId > 0) ? `?action=read&id=${boardId}` : ''}`;
  const seoMeta = {
    keywords: finalSeoKeywords ? `<meta name="keywords" content="${finalSeoKeywords.replace(/"/g, '&quot;')}" />` : '',
    desc: finalSeoDesc ? `<meta name="description" content="${finalSeoDesc.replace(/"/g, '&quot;')}" />` : '',
    ogDesc: finalSeoDesc ? `<meta property="og:description" content="${finalSeoDesc.replace(/"/g, '&quot;')}" />` : '',
    ogSiteName: `<meta property="og:site_name" content="${site.name}" />`,
    ogUrl: `<meta property="og:url" content="${canonicalUrl}" />`,
    canonical: `<link rel="canonical" href="${canonicalUrl}" />`,
  };

  // Google Verification & Analytics
  const googleVerifMeta = (site as any).googleVerification ? `<meta name="google-site-verification" content="${(site as any).googleVerification}" />` : '';
  const gaScript = (site as any).googleAnalyticsId ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${(site as any).googleAnalyticsId}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${(site as any).googleAnalyticsId}');</script>` : '';
  const viewportMeta = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />';

  /* ─── GEO: hreflang alternates ─── */
  const siteLangsForHreflang = (site.languages && site.languages.length > 0) ? site.languages : [site.defaultLanguage];
  const hreflangBase = isCustomDomain ? `https://${hostHeader}` : `https://${tempDomain}/${shopId}`;
  const currentQs = (effectiveAction === "read" && boardId > 0) ? `?action=read&id=${boardId}` : '';
  const hreflangLinks = siteLangsForHreflang.map(l =>
    `<link rel="alternate" hreflang="${l}" href="${hreflangBase}/${l}/${pageSlug}.html${currentQs}" />`
  ).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${hreflangBase}/${site.defaultLanguage}/${pageSlug}.html${currentQs}" />`;

  /* ─── GEO: Twitter Card ─── */
  const twitterMeta = [
    '<meta name="twitter:card" content="' + (finalOgImage ? 'summary_large_image' : 'summary') + '" />',
    `<meta name="twitter:title" content="${escapeHtml(finalSeoTitle)}" />`,
    finalSeoDesc ? `<meta name="twitter:description" content="${finalSeoDesc.replace(/"/g, '&quot;')}" />` : '',
    finalOgImage ? `<meta name="twitter:image" content="${finalOgImage.replace(/"/g, '&quot;')}" />` : '',
  ].filter(Boolean).join("\n  ");

  /* ─── GEO: JSON-LD structured data ─── */
  //    Pull the full public-business identity from Site columns so the
  //    Organization schema has telephone / address / email / logo — these
  //    are what AI engines (ChatGPT, Perplexity, Google AI Overviews) cite.
  //    publicEmail/Phone/Address are distinct from contactEmail (which is
  //    the form submission target, often a private admin inbox).
  const resolvedLogoUrl = site.logoUrl
    ? (site.logoUrl.startsWith("http") ? site.logoUrl : `${hreflangBase}${site.logoUrl}`)
    : null;
  const siteSeoMeta = (site.seoMeta && typeof site.seoMeta === "object" && !Array.isArray(site.seoMeta))
    ? (site.seoMeta as Record<string, unknown>)
    : {};
  const ldCtx: JsonLdContext = {
    baseUrl: hreflangBase,
    currentUrl: canonicalUrl,
    lang,
    site: {
      name: site.name,
      description: site.description || null,
      defaultLanguage: site.defaultLanguage,
      languages: site.languages,
      contactEmail: site.publicEmail || null,
      contactPhone: site.publicPhone || null,
      address: site.publicAddress || null,
      logoUrl: resolvedLogoUrl,
      alternateName: typeof siteSeoMeta.alternateName === "string" ? siteSeoMeta.alternateName : null,
      slogan: typeof siteSeoMeta.slogan === "string" ? siteSeoMeta.slogan : null,
      foundingDate: typeof siteSeoMeta.foundingDate === "string" ? siteSeoMeta.foundingDate : null,
      areaServed: Array.isArray(siteSeoMeta.areaServed)
        ? (siteSeoMeta.areaServed as string[])
        : typeof siteSeoMeta.areaServed === "string"
          ? siteSeoMeta.areaServed
          : null,
      sameAs: Array.isArray(siteSeoMeta.sameAs) ? (siteSeoMeta.sameAs as string[]) : null,
    },
  };
  const jsonLdObjects: Array<Record<string, unknown> | null> = [
    buildWebSiteJsonLd(ldCtx),
    buildOrganizationJsonLd(ldCtx),
  ];
  if (isProductAction && effectiveAction === "read" && productDetailForLd) {
    jsonLdObjects.push(buildProductJsonLd(ldCtx, {
      name: productDetailForLd.name,
      description: productDetailForLd.description,
      specification: productDetailForLd.specification,
      price: productDetailForLd.price,
      priceCurrency: "USD",
      images: productDetailForLd.images,
      category: productDetailForLd.category,
      sku: productDetailForLd.sku,
    }));
    const crumbs: Array<{ name: string; url: string }> = [
      { name: site.name, url: `${hreflangBase}/${lang}/` },
      { name: page.title || pageSlug, url: `${hreflangBase}/${lang}/${pageSlug}.html` },
      { name: productDetailForLd.name, url: canonicalUrl },
    ];
    jsonLdObjects.push(buildBreadcrumbJsonLd(ldCtx, crumbs));
  } else if (isBoardAction && effectiveAction === "read" && articleDetailForLd) {
    jsonLdObjects.push(buildArticleJsonLd(ldCtx, articleDetailForLd));
    const crumbs: Array<{ name: string; url: string }> = [
      { name: site.name, url: `${hreflangBase}/${lang}/` },
      { name: page.title || pageSlug, url: `${hreflangBase}/${lang}/${pageSlug}.html` },
      { name: articleDetailForLd.title, url: canonicalUrl },
    ];
    jsonLdObjects.push(buildBreadcrumbJsonLd(ldCtx, crumbs));
  }
  // AEO 콘텐츠 블록 — 일반 페이지 뷰에서만 JSON-LD(FAQPage/HowTo/DefinedTerm)
  // + 가시 섹션 렌더. board/product/search 액션 페이지는 body를 교체하므로 제외.
  const aeoBlocks =
    !isProductAction && !isBoardAction && !isSearchAction
      ? normalizeAeoBlocks(page.aeoBlocks)
      : [];
  for (const obj of buildAeoJsonLd(aeoBlocks)) jsonLdObjects.push(obj);
  const aeoSectionHtml = renderAeoHtml(aeoBlocks, lang);
  const jsonLdBlock = renderJsonLdBlock(jsonLdObjects);

  // Unified search box — injected into #hns_header (absolute, top-right) only
  // when the site opted in via 데이터관리 → 상품관리. Self-scoped styles so it
  // works across arbitrary templates without touching template CSS.
  const sl = searchLabels(lang);
  const searchBoxHtml = searchEnabled
    ? `<form id="hns-search" action="${urlPrefix}/${lang}/search.html" method="get" role="search">
      <input type="hidden" name="action" value="search" />
      <input type="search" name="q" value="${escapeHtml(url.searchParams.get("q") || "")}" placeholder="${escapeHtml(sl.placeholder)}" aria-label="${escapeHtml(sl.placeholder)}" autocomplete="off" />
      <button type="submit" aria-label="${escapeHtml(sl.searchBtn)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></button>
      <style>
        /* 초기엔 opacity:0 으로 숨겨두고, JS가 우측 여백을 계산한 뒤 fade-in.
           right 값은 아래 인라인 스크립트가 헤더 내 버튼/링크의 위치를 측정해
           동적으로 설정 — "Request a quote" 같은 우측 고정 버튼과 겹치지 않음. */
        #hns-search{position:absolute;bottom:18px;right:-9999px;opacity:0;transition:opacity .2s;z-index:99999;display:flex;align-items:center;background:rgba(255,255,255,.92);border:1px solid rgba(0,0,0,.14);border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}
        #hns-search input[type=search]{border:0;outline:0;background:transparent;font-size:13px;color:#222;padding:8px 4px 8px 16px;width:170px;-webkit-appearance:none;}
        #hns-search input[type=search]::placeholder{color:#999;}
        #hns-search button{border:0;background:transparent;cursor:pointer;color:#555;padding:8px 14px 8px 8px;display:flex;align-items:center;}
        #hns-search button:hover{color:#f28a17;}
        /* 모바일: 입력폭 축소 */
        @media(max-width:768px){#hns-search input[type=search]{width:108px;padding-left:12px;}}
      </style>
      <script>
      (function(){
        var sf=document.getElementById('hns-search');
        if(!sf)return;
        /* 헤더 안의 우측 요소(버튼·링크)를 스캔해서 검색바가 겹치지 않을
           최소 right 오프셋을 계산한다. 폰트·이미지 로드 후 재계산. */
        function place(){
          var hdr=document.getElementById('hns_header');
          if(!hdr)return;
          var hRect=hdr.getBoundingClientRect();
          var w=window.innerWidth;
          /* 모바일(768px 이하): 햄버거 메뉴 → 우측 여백만 확보 */
          if(w<=768){sf.style.right='10px';sf.style.bottom='14px';sf.style.opacity='1';return;}
          var minRight=18;
          hdr.querySelectorAll('a[href],button').forEach(function(el){
            if(sf===el||sf.contains(el))return;
            var r=el.getBoundingClientRect();
            /* 너무 작거나(아이콘 등) 헤더 왼쪽 절반 → 무시 */
            if(r.width<24||r.height<10)return;
            if(r.left<hRect.left+hRect.width*0.45)return;
            /* 이 요소의 왼쪽 끝에서 헤더 오른쪽까지의 거리 + 여백 8px */
            var need=hRect.right-r.left+8;
            if(need>minRight)minRight=need;
          });
          sf.style.right=minRight+'px';
          sf.style.opacity='1';
        }
        /* DOMContentLoaded 이후 즉시 + 100ms 재계산(폰트·이미지 로드 대기) */
        function run(){place();setTimeout(place,120);}
        if(document.readyState!=='loading')run();
        else document.addEventListener('DOMContentLoaded',run);
        window.addEventListener('resize',place);
      })();
      </script>
    </form>`
    : "";

  const html = (isBoardAction || isProductAction || isSearchAction)
  ? `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  ${viewportMeta}
  ${googleVerifMeta}
  <title>${escapeHtml(finalSeoTitle)}</title>
  ${seoMeta.desc}
  ${finalOgImage ? '<meta property="og:image" content="' + finalOgImage.replace(/"/g, '&quot;') + '" />' : ''}
  <meta property="og:title" content="${escapeHtml(finalSeoTitle)}" />
  <meta property="og:type" content="${(isProductAction && effectiveAction === 'read') ? 'product' : 'article'}" />
  ${seoMeta.keywords}
  ${seoMeta.ogDesc}
  ${seoMeta.ogSiteName}
  ${seoMeta.ogUrl}
  ${seoMeta.canonical}
  ${hreflangLinks}
  ${twitterMeta}
  ${jsonLdBlock}
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Cute+Font&family=Do+Hyeon&family=East+Sea+Dokdo&family=Gaegu:wght@300;400;700&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Gugi&family=Hi+Melody&family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&family=Jeju+Gothic&family=Jeju+Hallasan&family=Jeju+Myeongjo&family=Jua&family=Nanum+Brush+Script&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Gothic+Coding:wght@400;700&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;500;700;900&family=Poor+Story&family=Single+Day&family=Song+Myung&family=Stylish&family=Sunflower:wght@300;500;700&family=Yeon+Sung&family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" rel="stylesheet" />
  <style>
    ${templateCss}
    ${siteCss}
    ${publishedCss}
    ${menuIconCss}
    .board-content { font-family: 'Noto Sans KR', sans-serif; }
    .board-content a:hover { color: #89C23D !important; }
    .board-content table tr:hover { background: rgba(255,255,255,0.03); }
    .board-content img { border-radius: 4px; }

    /* Modern templates: page-header sits ABOVE the auto-rendered list,
       so #hns_body must be a normal block (stack children vertically).
       Legacy templates centred the lone boardSection horizontally — keep
       that behavior when there's no template marker. */
    ${isModernTpl
      ? "#hns_body { display: block; }\n    #hns_body > .product-content, #hns_body > .board-content { width: 100%; max-width: 100%; }"
      : "#hns_body { display: flex; justify-content: center; }\n    .board-content { max-width: var(--menu-width, 780px); }"}
  </style>
  ${gaScript}
</head>
<body>
  <div id="v_home_dft" class="c_v_home_dft">
    <div id="hns_header">${cleanedHeaderHtml}${menuHtml}${searchBoxHtml}</div>
    <div id="hns_menu"></div>
    <div id="hns_body">${cleanedBodyHtml}${boardSectionHtml}</div>
    <div id="hns_footer">${cleanedFooterHtml}${langSwitcherHtml}</div>
  </div>
  ${langBannerHtml}
  <script>(function(){
    var hdr=document.getElementById('hns_header');
    if(!hdr)return;
    var m=0;
    var els=hdr.querySelectorAll('.dragable');
    for(var i=0;i<els.length;i++){
      var cs=window.getComputedStyle(els[i]);
      var t=parseInt(cs.top)||0,h=parseInt(cs.height)||els[i].offsetHeight||0;
      if(t+h>m)m=t+h;
    }
    if(m>0)hdr.style.minHeight=m+'px';
    var nav=hdr.querySelector('.menu')||hdr.querySelector('#v-wdg-nav');
    if(nav){var nw=nav.offsetWidth||nav.scrollWidth;if(nw>200)document.documentElement.style.setProperty('--menu-width',nw+'px');}
    ${isModernTemplate ? '' : `var ft=document.getElementById('hns_footer');
    if(ft){
      var fc=ft.querySelectorAll('.dragable');
      for(var j=0;j<fc.length;j++){
        fc[j].style.position='relative';
        fc[j].style.top='auto';
        fc[j].style.left='auto';
        fc[j].style.width='100%';
      }
    }`}
  })();</script>
  ${scaleScript}
  ${interactionScript}
</body>
</html>`
  : `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  ${viewportMeta}
  ${googleVerifMeta}
  <title>${escapeHtml(finalSeoTitle)}</title>
  ${seoMeta.desc}
  ${seoMeta.keywords}
  ${finalOgImage ? '<meta property="og:image" content="' + finalOgImage.replace(/"/g, '&quot;') + '" />' : ''}
  <meta property="og:title" content="${escapeHtml(finalSeoTitle)}" />
  ${seoMeta.ogDesc}
  <meta property="og:type" content="website" />
  ${seoMeta.ogSiteName}
  ${seoMeta.ogUrl}
  ${seoMeta.canonical}
  ${hreflangLinks}
  ${twitterMeta}
  ${jsonLdBlock}
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Cute+Font&family=Do+Hyeon&family=East+Sea+Dokdo&family=Gaegu:wght@300;400;700&family=Gowun+Batang:wght@400;700&family=Gowun+Dodum&family=Gugi&family=Hi+Melody&family=IBM+Plex+Sans+KR:wght@300;400;500;600;700&family=Jeju+Gothic&family=Jeju+Hallasan&family=Jeju+Myeongjo&family=Jua&family=Nanum+Brush+Script&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Gothic+Coding:wght@400;700&family=Nanum+Myeongjo:wght@400;700;800&family=Nanum+Pen+Script&family=Noto+Sans+KR:wght@300;400;500;700;900&family=Noto+Serif+KR:wght@300;400;500;700;900&family=Poor+Story&family=Single+Day&family=Song+Myung&family=Stylish&family=Sunflower:wght@300;500;700&family=Yeon+Sung&family=JetBrains+Mono:wght@400;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css" rel="stylesheet" />
  <style>
    /* Template CSS */
    ${templateCss}
    /* Site CSS */
    ${siteCss}
    /* Page CSS */
    ${pageCss}
    /* Published page overrides */
    ${publishedCss}
    /* Per-item menu icons (Page.menuIcon) */
    ${menuIconCss}
    /* Board content styles */
    .board-content { font-family: 'Noto Sans KR', sans-serif; }
    .board-content a:hover { color: #89C23D !important; }
    .board-content table tr:hover { background: rgba(255,255,255,0.03); }
    .board-content img { border-radius: 4px; }
  </style>
  ${gaScript}
</head>
<body>
  <div id="v_home_dft" class="c_v_home_dft">
    ${langSwitcherHtml}
    <div id="hns_header">${cleanedHeaderHtml}${menuHtml}${searchBoxHtml}</div>
    <div id="hns_menu"></div>
    <div id="hns_body">${cleanedBodyHtml}${aeoSectionHtml}</div>
    <div id="hns_footer">${cleanedFooterHtml}</div>
  </div>
  ${minHeightScript}
  ${scaleScript}
  ${interactionScript}
</body>
</html>`;

  // Migrate legacy wowasp_ prefixed IDs to hns_
  let migratedHtml = html.replace(/wowaspfoot/g, "hnsfoot").replace(/wowasp_/g, "hns_");

  // Full white-label: on a reseller `home.{domain}` host, rewrite any absolute
  // managed-host asset URLs baked into the STORED content (logos/icons inserted
  // as https://home.homenshop.com/{shopId}/...) to the reseller host, so the
  // page source carries zero homenshop.com references. That host serves the
  // same /{shopId}/uploaded paths via the multi-tenant snippet, so they resolve.
  if (isResellerHome) {
    for (const leakHost of ["home.homenshop.com", getTempDomain(site)]) {
      if (leakHost && leakHost !== tempDomain) {
        migratedHtml = migratedHtml.split(`//${leakHost}/`).join(`//${tempDomain}/`);
      }
    }
  }

  return new NextResponse(migratedHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Builder workflow freshness: a published page must reflect an owner's
      // save/publish quickly. The old `max-age=60, s-maxage=300` meant edits
      // could stay hidden for up to 5 min behind a CDN/nginx cache (owners kept
      // reporting "my change isn't showing" — e.g. a header z-index fix that was
      // already live in the HTML). Browser revalidates every load (max-age=0);
      // the CDN holds a fresh copy only ~10s but may serve stale while it
      // revalidates in the background, so visitor performance is preserved.
      "Cache-Control": "public, max-age=0, s-maxage=10, stale-while-revalidate=300",
    },
  });
}
