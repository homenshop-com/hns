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

/* ─── Board rendering helpers ─── */

function escapeHtml(s: unknown): string {
  const str = String(s ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function renderBoardRead(siteId: string, shopId: string, lang: string, id: number, urlPrefix: string = ""): Promise<string> {
  const row = await prisma.boardPost.findFirst({
    where: { siteId, legacyId: id },
    include: { category: { select: { name: true, legacyId: true } } },
  });
  if (!row) return `<div class="board-content" style="width:100%;margin:20px auto;position:relative;padding:40px 20px;color:#999;text-align:center;font-size:15px;">게시글을 찾을 수 없습니다. (id=${id})</div>`;

  const photos = row.photos ? row.photos.split("|").filter(Boolean) : [];
  const imageExts = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]);
  const photoHtml = photos.map((p) => {
    const src = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`;
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

  return `
  <div class="board-content" style="width:100%;margin:20px auto;position:relative;color:#333;">
    <div style="border-bottom:2px solid #89C23D;padding-bottom:12px;margin-bottom:16px;">
      ${catName ? `<div style="font-size:11px;color:#89C23D;margin-bottom:4px;">${escapeHtml(catName)}</div>` : ""}
      <h2 style="font-size:18px;font-weight:bold;color:#1a1a1a;margin:0 0 8px 0;">${escapeHtml(row.title || "")}</h2>
      <div style="display:flex;gap:20px;font-size:12px;color:#888;">
        <span>작성자: ${escapeHtml(row.author || "관리자")}</span>
        <span>날짜: ${row.regdate || ""}</span>
        <span>조회: ${row.views || 0}</span>
      </div>
    </div>
    <div style="min-height:200px;line-height:1.8;font-size:14px;color:#333;">
      ${row.content || ""}
      ${photoHtml}
    </div>
    ${replies.length > 0 ? `<div style="margin-top:24px;"><div style="font-size:14px;font-weight:bold;color:#89C23D;margin-bottom:8px;">댓글 (${replies.length})</div>${repliesHtml}</div>` : ""}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;text-align:center;">
      <a href="${listHref}" style="display:inline-block;padding:8px 24px;background:#89C23D;color:#fff;border-radius:4px;font-size:13px;font-weight:bold;text-decoration:none;">목록으로</a>
    </div>
  </div>`;
}

async function renderBoardList(siteId: string, shopId: string, lang: string, category: number, pageNum: number, urlPrefix: string = ""): Promise<string> {
  const perPage = 20;
  const offset = (pageNum - 1) * perPage;

  // Get category info
  let catName = "게시판";
  let categoryId: string | undefined;
  if (category > 0) {
    const cat = await prisma.boardCategory.findFirst({ where: { siteId, legacyId: category } });
    if (cat) { catName = cat.name; categoryId = cat.id; }
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

  // Build table rows
  const rowsHtml = rows.map((r) => {
    const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`;
    return `<tr style="border-bottom:1px solid #e5e5e5;">
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.legacyId}</td>
      <td style="padding:10px 8px;"><a href="${href}" style="color:#333;text-decoration:none;font-size:14px;">${escapeHtml(r.title || "")}</a></td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${escapeHtml(r.author || "관리자")}</td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.regdate || ""}</td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.views || 0}</td>
    </tr>`;
  }).join("");

  // Pagination
  let paginationHtml = "";
  if (totalPages > 1) {
    const links: string[] = [];
    for (let p = 1; p <= totalPages; p++) {
      const href = `${urlPrefix}/${lang}/board.html?action=list&category=${category}&page=${p}`;
      if (p === pageNum) {
        links.push(`<span style="display:inline-block;padding:4px 10px;background:#89C23D;color:#fff;border-radius:3px;font-weight:bold;">${p}</span>`);
      } else {
        links.push(`<a href="${href}" style="display:inline-block;padding:4px 10px;color:#999;text-decoration:none;">${p}</a>`);
      }
    }
    paginationHtml = `<div style="text-align:center;margin-top:20px;">${links.join("")}</div>`;
  }

  return `
  <div class="board-content" style="width:100%;margin:20px auto;position:relative;color:#333;">
    <h2 style="font-size:18px;font-weight:bold;color:#89C23D;border-bottom:2px solid #89C23D;padding-bottom:12px;margin:0 0 16px 0;">${escapeHtml(catName)}</h2>
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:2px solid #ccc;">
          <th style="padding:10px 8px;text-align:center;color:#666;font-size:13px;width:60px;">번호</th>
          <th style="padding:10px 8px;text-align:left;color:#666;font-size:13px;">제목</th>
          <th style="padding:10px 8px;text-align:center;color:#666;font-size:13px;width:100px;">작성자</th>
          <th style="padding:10px 8px;text-align:center;color:#666;font-size:13px;width:100px;">날짜</th>
          <th style="padding:10px 8px;text-align:center;color:#666;font-size:13px;width:60px;">조회</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="5" style="padding:40px;text-align:center;color:#999;">등록된 글이 없습니다.</td></tr>'}
      </tbody>
    </table>
    ${paginationHtml}
  </div>`;
}

/* ─── Product detail / list page rendering ─── */
async function renderProductRead(
  siteId: string, shopId: string, lang: string, productId: number, urlPrefix: string, goodsPage: string = "goods", prismaProductId?: string, prodSettings?: ProductDisplaySettings
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
    return `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`;
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

  return `<div style="max-width:900px;margin:20px auto;padding:20px;font-family:Tahoma,Arial,sans-serif;">
    <div style="margin-bottom:15px;">
      <a href="${backHref}" style="color:#666;text-decoration:none;font-size:13px;">&larr; ${catName || "Product List"}</a>
    </div>
    <div style="display:flex;gap:30px;flex-wrap:wrap;">
      <div style="flex:0 0 auto;">
        ${mainImg ? `<div id="prod-main-img-wrap">${mainImg.replace('<img ', '<img id="prod-main-img" ')}</div>` : ""}
        ${thumbs ? `<div style="margin-top:8px;">${thumbs}</div>` : ""}
      </div>
      <div style="flex:1;min-width:250px;">
        <h1 style="font-size:20px;color:#333;margin:0 0 10px 0;font-weight:bold;">${escapeHtml(pname)}</h1>
        ${price ? `<div style="font-size:18px;color:#c00;font-weight:bold;margin-bottom:15px;">${escapeHtml(price)}</div>` : ""}
        ${specification ? `<div style="font-size:13px;color:#666;margin-bottom:15px;line-height:1.6;">${specification}</div>` : ""}
      </div>
    </div>
    ${contents ? `<div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:13px;color:#555;line-height:1.8;">${contents}</div>` : ""}
  </div>`;
}

interface ProductDisplaySettings {
  itemsPerRow?: number;
  totalRows?: number;
  thumbWidth?: number;
  thumbHeight?: number;
  detailWidth?: number;
}

async function renderProductList(
  siteId: string, shopId: string, lang: string, category: number, page: number, urlPrefix: string, goodsPage: string = "goods", prodSettings?: ProductDisplaySettings
): Promise<string> {
  // Get categories from Prisma
  const categories = await prisma.productCategory.findMany({
    where: { siteId, lang },
    orderBy: { legacyId: "asc" },
  });

  // Category tabs
  const allHref = `${urlPrefix}/${lang}/${goodsPage}.html?action=list`;
  const catTabs = categories.map((c) => {
    const catId = c.legacyId ?? 0;
    const catName = c.name || "";
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=list&category=${catId}`;
    const active = catId === category;
    return `<a href="${href}" style="display:inline-block;padding:8px 20px;margin:0 2px;text-decoration:none;font-size:13px;font-weight:bold;color:${active ? '#fff' : '#555'};background:${active ? '#666' : '#f5f5f5'};border:1px solid #ddd;">${escapeHtml(catName)}</a>`;
  }).join("");
  const allActive = category === 0;
  const tabsHtml = `<div style="margin-bottom:20px;text-align:center;">
    <a href="${allHref}" style="display:inline-block;padding:8px 20px;margin:0 2px;text-decoration:none;font-size:13px;font-weight:bold;color:${allActive ? '#fff' : '#555'};background:${allActive ? '#666' : '#f5f5f5'};border:1px solid #ddd;">All</a>
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
        imgSrc = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`;
      }
    }
    // Use pid= for Prisma products with no legacyId, id= for legacy
    const idParam = p.legacyId ? `id=${p.legacyId}` : `pid=${p.id}`;
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=read&${idParam}`;
    const price = p.price > 0 ? `<div style="color:#c00;font-size:12px;margin-top:2px;">$${escapeHtml(String(p.price))}</div>` : "";
    return `<div style="text-align:center;">
      <a href="${href}">
        ${imgSrc ? `<img src="${imgSrc}" style="width:100%;max-width:${imgW}px;height:${imgH}px;object-fit:contain;border:1px solid #eee;" alt="${escapeHtml(pname)}" />` : `<div style="width:100%;max-width:${imgW}px;height:${imgH}px;background:#f9f9f9;border:1px solid #eee;margin:0 auto;"></div>`}
      </a>
      <div style="font-size:11px;color:#333;margin-top:4px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4;max-height:2.8em;">
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
        ? `<span style="display:inline-block;padding:4px 10px;margin:0 2px;font-weight:bold;color:#333;border:1px solid #333;">${i}</span>`
        : `<a href="${href}" style="display:inline-block;padding:4px 10px;margin:0 2px;color:#666;text-decoration:none;border:1px solid #ddd;">${i}</a>`;
    };
    const links: string[] = [];
    const rangeStart = Math.max(1, page - 5);
    const rangeEnd = Math.min(totalPages, page + 5);
    if (rangeStart > 1) { links.push(makeLink(1)); if (rangeStart > 2) links.push(`<span style="padding:4px 6px;color:#999;">...</span>`); }
    for (let i = rangeStart; i <= rangeEnd; i++) links.push(makeLink(i));
    if (rangeEnd < totalPages) { if (rangeEnd < totalPages - 1) links.push(`<span style="padding:4px 6px;color:#999;">...</span>`); links.push(makeLink(totalPages)); }
    paginationHtml = `<div style="text-align:center;margin-top:20px;">${links.join("")}</div>`;
  }

  return `<div style="max-width:900px;margin:20px auto;padding:20px;font-family:Tahoma,Arial,sans-serif;">
    ${tabsHtml}
    <div style="display:grid;grid-template-columns:repeat(${itemsPerRow}, 1fr);gap:24px 12px;">${items}</div>
    ${paginationHtml}
  </div>`;
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
    const isCustomDomain = hostHeader && !hostHeader.includes("homenshop");
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

  // Detect custom domain: if Host header is not homenshop.com/net, omit shopId from URLs
  const hostHeader = request.headers.get("host") || request.headers.get("x-forwarded-host") || "";
  const isCustomDomain = hostHeader && !hostHeader.includes("homenshop");
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

  if (!site || !site.published) {
    return new NextResponse("Not Found", { status: 404 });
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
    return new NextResponse("Not Found", { status: 404 });
  }

  // Extract body HTML
  const pageContent = page.content as { html?: string } | null;
  let bodyHtml = pageContent?.html || "";

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

  const prodSettings = (site.productSettings as ProductDisplaySettings | null) || undefined;
  if (isProductAction) {
    if (effectiveAction === "read" && prismaProductId) {
      boardSectionHtml = await renderProductRead(site.id, shopId, lang, 0, urlPrefix, productPageSlug, prismaProductId, prodSettings);
    } else if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = await renderProductRead(site.id, shopId, lang, boardId, urlPrefix, productPageSlug, undefined, prodSettings);
    } else if (effectiveAction === "list") {
      boardSectionHtml = await renderProductList(site.id, shopId, lang, boardCategory, boardPage, urlPrefix, productPageSlug, prodSettings);
    }
    if (boardSectionHtml) {
      bodyHtml = "";
    }
  } else if (isBoardAction) {
    if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = await renderBoardRead(site.id, shopId, lang, boardId, urlPrefix);
    } else if (effectiveAction === "list") {
      boardSectionHtml = await renderBoardList(site.id, shopId, lang, boardCategory, boardPage, urlPrefix);
    }
    // Board action pages: clear body HTML (absolute-positioned page elements create unwanted space)
    if (boardSectionHtml) {
      bodyHtml = "";
    }
  }

  // Get template CSS
  const templatePath = site.templatePath || "";

  // BoardPlugin: inject dynamic board lists into page body (for all pages)
  bodyHtml = await renderBoardPluginContent(site.id, shopId, lang, pageSlug, bodyHtml, urlPrefix);

  // ProductPlugin: inject dynamic product lists into page body
  bodyHtml = await renderProductPluginContent(site.id, shopId, lang, pageSlug, bodyHtml, urlPrefix);
  let templateCss = "";
  if (templatePath) {
    templateCss = readTemplateCss(templatePath);
  }

  // Get page-specific CSS — boost position/size properties with !important
  // so they override site-upgrade.css !important rules (pageCss is page-specific)
  const rawPageCss = (page as any).css || "";
  let pageCss = rawPageCss.replace(
    /(\b(?:top|left|width|height|display|position|z-index)\s*:\s*)([^;!}]+)(;|})/gi,
    (_: string, prop: string, val: string, end: string) =>
      val.trim().includes('!important') ? `${prop}${val}${end}` : `${prop}${val.trim()} !important${end}`
  );
  // Force /api/img URLs in pageCss to absolute (only exists on homenshop.com)
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

  // Detect modern template: uses 100vw breakout patterns (check both template CSS and site CSS)
  const allCss = templateCss + siteCss;
  const isModernTemplate = allCss.includes("calc(-50vw + 50%)") || allCss.includes("calc(-50vw+50%)");

  // Generate dynamic menu from pages list (respects showInMenu, parentId, hidden pages)
  const skipSlugs = new Set(["user", "users", "agreement", "empty"]);
  const visiblePages = pages.filter(
    (p) => p.showInMenu !== false && !skipSlugs.has(p.slug)
  );
  const topLevelPages = visiblePages.filter((p) => !p.parentId);
  const getChildren = (parentId: string) =>
    visiblePages.filter((p) => p.parentId === parentId);

  const menuItems = topLevelPages
    .map((p) => {
      const label = p.menuTitle || p.title;
      const href = p.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${p.slug}.html`;
      const target = p.externalUrl && /^https?:\/\//.test(p.externalUrl) ? ` target="_blank"` : "";
      const actualHref = p.externalUrl || href;
      const children = getChildren(p.id);

      if (children.length === 0) {
        return `<li><a title="${label}" href="${actualHref}"${target}>${label}</a></li>`;
      }

      const subItems = children
        .map((c) => {
          const cLabel = c.menuTitle || c.title;
          const cHref = c.externalUrl || (c.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${c.slug}.html`);
          const cTarget = c.externalUrl && /^https?:\/\//.test(c.externalUrl) ? ` target="_blank"` : "";
          return `<li><a title="${cLabel}" href="${cHref}"${cTarget}>${cLabel}</a></li>`;
        })
        .join("");

      return `<li><a title="${label}" href="${actualHref}"${target}>${label}</a><ul class="submenu">${subItems}</ul></li>`;
    })
    .join("");
  const generatedMenu = `<ul class="mainmenu">${menuItems}</ul>`;

  // Build language switcher HTML
  const siteLanguages = (site as any).languages as string[] | undefined;
  let langSwitcherHtml = "";
  if (siteLanguages && siteLanguages.length > 1) {
    const langNames: Record<string, string> = { ko: "한국어", en: "English", ja: "日本語", "zh-cn": "中文", es: "Español" };
    const options = siteLanguages.map((l) => {
      const selected = l === lang ? " selected" : "";
      return `<option value="${l}"${selected}>${langNames[l] || l}</option>`;
    }).join("");
    langSwitcherHtml = `<div style="position:absolute;top:6px;right:10px;z-index:10000;">
      <label style="font-size:11px;color:#999;">Language</label>
      <select onchange="var l=this.value;var p=window.location.pathname;var m=p.match(/^\\/(ko|en|ja)\\//);if(m){window.location.href='/'+l+p.substring(m[0].length-1);}else{var m2=p.match(/^\\/[^\\/]+\\/(ko|en|ja)\\//);if(m2){window.location.href=p.replace(m2[0],'/'+p.split('/')[1]+'/'+l+'/');}else{window.location.href='/'+l+'/index.html';}}" style="font-size:11px;padding:2px 4px;">${options}</select>
    </div>`;
  }

  // Rewrite asset URLs in HTML sections
  const headerHtml = templatePath
    ? rewriteAssetUrls(siteHeaderHtml, templatePath)
    : siteHeaderHtml;
  const rawMenuHtml = templatePath
    ? rewriteAssetUrls(siteMenuHtml, templatePath)
    : siteMenuHtml;
  let menuHtml: string;
  // Wrap generated menu in the nav container div that template CSS targets
  const wrappedMenu = `<div id="v-wdg-nav" class="v-home-ap-hd-nav menu dragable">${generatedMenu}</div>`;
  if (!rawMenuHtml) {
    menuHtml = wrappedMenu;
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

  // Clean editor artifacts from published HTML
  const cleanHtml = (h: string) => h
    .replace(/<div class="de-resize-handle[^"]*"[^>]*><\/div>/g, "")
    .replace(/\bde-selected\b/g, "");
  const cleanedBodyHtml = cleanHtml(processedBodyHtml);
  const cleanedHeaderHtml = cleanHtml(headerHtml);
  const cleanedFooterHtml = cleanHtml(footerHtml);

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
    body { margin: 0; padding: 0; background-image: none !important; }
    #hns_header { position: relative; }
    #hns_body { position: relative; }
    #hns_footer { position: static; }
    #hns_menu:empty { display: none; }
    #hns_footer_content { top: 0 !important; position: relative !important; }
    #hns_footer > .dragable {
      top: auto !important;
      position: relative !important;
    }
    .de-resize-handle { display: none !important; }
    html, body { overflow-x: hidden; }
    .c_v_home_dft { overflow-x: hidden; overflow-y: visible; width: 1000px !important; margin: 0 auto !important; }
    `;

  // Scale-to-fit script only for legacy templates
  const scaleScript = isModernTemplate ? '' : `<script>(function(){
  window.__dbg=location.search.indexOf('debug')>-1; var el = document.getElementById('v_home_dft');
  if (!el) return;
  document.documentElement.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  document.body.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  el.style.cssText += 'width:1000px;margin:0 auto;overflow-x:hidden;overflow-y:visible;position:relative;';
  function sf() {
    var vw = document.documentElement.clientWidth;
    if (vw < 1000) {
      var sc = vw / 1000;
      el.style.transformOrigin = 'top left';
      el.style.transform = 'scale(' + sc + ')'; if(window.__dbg){document.title='vw='+vw+' sc='+sc.toFixed(3)+' rect='+el.getBoundingClientRect().left;}
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
    : `<script>(function(){var el=document.getElementById('hns_body');if(!el)return;function calc(){var m=0;var all=el.querySelectorAll('.dragable');for(var i=0;i<all.length;i++){var c=all[i],cs=window.getComputedStyle(c);if(cs.position==='absolute'){var t=parseInt(cs.top)||0,h=Math.max(c.offsetHeight||0,c.scrollHeight||0);if(t+h>m)m=t+h;}}if(m>0)el.style.minHeight=m+'px';}calc();var imgs=el.querySelectorAll('img');var n=0;function onImg(){n++;if(n>=imgs.length)calc();}for(var j=0;j<imgs.length;j++){if(imgs[j].complete)n++;else{imgs[j].addEventListener('load',onImg);imgs[j].addEventListener('error',onImg);}}if(n>=imgs.length&&imgs.length>0)calc();setTimeout(calc,500);setTimeout(calc,1500);})();</script>`;

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
        itemSeoTitle = `${pp.name} - ${site.name}`;
        const rawDesc = String(pp.description || "");
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc;
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
        select: { id: true, name: true, description: true, photos: true, specification: true, price: true, category: true, images: true },
      });
      if (pRow) {
        itemSeoTitle = `${pRow.name} - ${site.name}`;
        const rawDesc = pRow.specification || pRow.description || "";
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc;
        itemSeoKeywords = pRow.name.replace(/[,/|]/g, ", ");
        const pPhotos = pRow.photos ? pRow.photos.split("|").filter(Boolean) : [];
        if (pPhotos[0]) {
          itemOgImage = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(pPhotos[0])}`;
        }
        const jsonImages = (pRow.images as string[] | null) || [];
        const absImages = (jsonImages.length > 0 ? jsonImages : pPhotos).map((p) =>
          p.startsWith("http") || p.startsWith("/")
            ? p
            : `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`
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
        select: { title: true, content: true, photos: true, author: true, regdate: true, category: { select: { name: true } } },
      });
      if (bRow) {
        itemSeoTitle = `${bRow.title} - ${site.name}`;
        const rawDesc = bRow.content || "";
        const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        itemSeoDesc = plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc;
        itemSeoKeywords = bRow.title;
        const bPhotos = bRow.photos ? bRow.photos.split("|").filter(Boolean) : [];
        const imageExts = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]);
        const photoImages = bPhotos.filter(p => imageExts.has(p.split(".").pop()?.toLowerCase() || ""));
        if (photoImages[0]) {
          itemOgImage = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(photoImages[0])}`;
        }
        const absImages = photoImages.map(
          (p) => `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`
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
  const finalSeoTitle = itemSeoTitle || (page as any).seoTitle || (page.title + ' - ' + site.name);
  const finalSeoDesc = itemSeoDesc || (page as any).seoDescription || "";
  const finalSeoKeywords = itemSeoKeywords || (page as any).seoKeywords || "";
  const finalOgImage = itemOgImage || (page as any).ogImage || "";

  // SEO: Canonical URL and meta tags
  const canonicalBase = isCustomDomain ? `https://${hostHeader}` : `https://home.homenshop.com/${shopId}`;
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
  const hreflangBase = isCustomDomain ? `https://${hostHeader}` : `https://home.homenshop.com/${shopId}`;
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
  const ldCtx: JsonLdContext = {
    baseUrl: hreflangBase,
    currentUrl: canonicalUrl,
    lang,
    site: {
      name: site.name,
      description: site.description || null,
      defaultLanguage: site.defaultLanguage,
      languages: site.languages,
      logoUrl: null,
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
  const jsonLdBlock = renderJsonLdBlock(jsonLdObjects);

  const html = (isBoardAction || isProductAction)
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
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet" />
  <style>
    ${templateCss}
    ${siteCss}
    ${publishedCss}
    .board-content { font-family: 'Noto Sans KR', sans-serif; }
    .board-content a:hover { color: #89C23D !important; }
    .board-content table tr:hover { background: rgba(255,255,255,0.03); }
    .board-content img { border-radius: 4px; }

    #hns_body { display: flex; justify-content: center; }
    .board-content { max-width: var(--menu-width, 780px); }
  </style>
  ${gaScript}
</head>
<body>
  <div id="v_home_dft" class="c_v_home_dft">
    ${langSwitcherHtml}
    <div id="hns_header">${cleanedHeaderHtml}${menuHtml}</div>
    <div id="hns_menu"></div>
    <div id="hns_body">${boardSectionHtml}</div>
    <div id="hns_footer">${cleanedFooterHtml}</div>
  </div>
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
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&display=swap" rel="stylesheet" />
  <style>
    /* Template CSS */
    ${templateCss}
    /* Site CSS */
    ${siteCss}
    /* Page CSS */
    ${pageCss}
    /* Published page overrides */
    ${publishedCss}
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
    <div id="hns_header">${cleanedHeaderHtml}${menuHtml}</div>
    <div id="hns_menu"></div>
    <div id="hns_body">${cleanedBodyHtml}</div>
    <div id="hns_footer">${cleanedFooterHtml}</div>
  </div>
  ${minHeightScript}
  ${scaleScript}
</body>
</html>`;

  // Migrate legacy wowasp_ prefixed IDs to hns_
  const migratedHtml = html.replace(/wowaspfoot/g, "hnsfoot").replace(/wowasp_/g, "hns_");

  return new NextResponse(migratedHtml, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
