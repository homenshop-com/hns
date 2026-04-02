import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readTemplateCss, rewriteAssetUrls } from "@/lib/template-parser";
import { execSync } from "child_process";

/* ─── Board rendering helpers ─── */
const LEGACY_DATA_ROOT = "/var/www/legacy-data/userdata";

interface BoardRow {
  id: number;
  title: string;
  contents: string;
  username: string;
  regdate: string;
  click: number;
  photos: string;
  category: number;
  parent: number;
}

// Query SQLite via python3 helper (handles multiline HTML content safely)
function sqliteQuery(dbPath: string, sql: string): Record<string, string>[] {
  try {
    const result = execSync(
      `python3 /var/www/homenshop-next/scripts/sqlite-query.py "${dbPath}"`,
      { timeout: 5000, encoding: "utf-8", input: sql, maxBuffer: 10 * 1024 * 1024 }
    );
    if (!result.trim()) return [];
    return JSON.parse(result);
  } catch {
    return [];
  }
}

function sqliteQueryOne(dbPath: string, sql: string): Record<string, string> | null {
  const rows = sqliteQuery(dbPath, sql);
  return rows.length > 0 ? rows[0] : null;
}

function getDbPath(shopId: string): string | null {
  // Sanitize shopId to prevent path traversal
  const safeId = shopId.replace(/[^a-zA-Z0-9_-]/g, "");
  const p = `${LEGACY_DATA_ROOT}/${safeId}/db/.sqlite3`;
  try {
    execSync(`test -f "${p}"`, { timeout: 1000 });
    return p;
  } catch {
    return null;
  }
}

function escapeHtml(s: unknown): string {
  const str = String(s ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Escape single quotes for SQLite queries
function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function renderBoardRead(dbPath: string, shopId: string, lang: string, id: number, urlPrefix: string = ""): string {
  const row = sqliteQueryOne(dbPath, `SELECT * FROM Board WHERE id = ${id}`);
  if (!row) return `<div class="board-content" style="width:100%;margin:20px auto;position:relative;padding:40px 20px;color:#999;text-align:center;font-size:15px;">게시글을 찾을 수 없습니다. (id=${id})</div>`;

  // Photo/attachment handling
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

  // Category name
  const cat = sqliteQueryOne(dbPath, `SELECT category as name FROM BoardCategory WHERE id = ${parseInt(row.category) || 0}`);
  const catName = cat?.name || "";

  // Replies
  const replies = sqliteQuery(dbPath, `SELECT * FROM Board WHERE parent = ${id} ORDER BY id ASC`);
  const repliesHtml = replies.map((r) => `
    <div style="border-top:1px solid #e5e5e5;padding:12px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;color:#888;">
        <span>${escapeHtml(r.username || "익명")}</span>
        <span>${r.regdate || ""}</span>
      </div>
      <div style="font-size:13px;line-height:1.6;color:#333;">${r.contents || ""}</div>
    </div>
  `).join("");

  const category = parseInt(row.category) || 0;
  const listHref = `${urlPrefix}/${lang}/board.html?action=list&category=${category}`;

  return `
  <div class="board-content" style="width:100%;margin:20px auto;position:relative;color:#333;">
    <div style="border-bottom:2px solid #89C23D;padding-bottom:12px;margin-bottom:16px;">
      ${catName ? `<div style="font-size:11px;color:#89C23D;margin-bottom:4px;">${escapeHtml(catName)}</div>` : ""}
      <h2 style="font-size:18px;font-weight:bold;color:#1a1a1a;margin:0 0 8px 0;">${escapeHtml(row.title || "")}</h2>
      <div style="display:flex;gap:20px;font-size:12px;color:#888;">
        <span>작성자: ${escapeHtml(row.username || "관리자")}</span>
        <span>날짜: ${row.regdate || ""}</span>
        <span>조회: ${row.click || 0}</span>
      </div>
    </div>
    <div style="min-height:200px;line-height:1.8;font-size:14px;color:#333;">
      ${row.contents || ""}
      ${photoHtml}
    </div>
    ${replies.length > 0 ? `<div style="margin-top:24px;"><div style="font-size:14px;font-weight:bold;color:#89C23D;margin-bottom:8px;">댓글 (${replies.length})</div>${repliesHtml}</div>` : ""}
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e5e5;text-align:center;">
      <a href="${listHref}" style="display:inline-block;padding:8px 24px;background:#89C23D;color:#fff;border-radius:4px;font-size:13px;font-weight:bold;text-decoration:none;">목록으로</a>
    </div>
  </div>`;
}

function renderBoardList(dbPath: string, shopId: string, lang: string, category: number, pageNum: number, urlPrefix: string = ""): string {
  const perPage = 20;
  const offset = (pageNum - 1) * perPage;

  // Get category info
  let catName = "게시판";
  if (category > 0) {
    const cat = sqliteQueryOne(dbPath, `SELECT category as name FROM BoardCategory WHERE id = ${category}`);
    if (cat) catName = cat.name;
  }

  // Count total
  const whereClause = category > 0 ? `WHERE category = ${category} AND parent = 0` : "WHERE parent = 0";
  const countRow = sqliteQueryOne(dbPath, `SELECT COUNT(*) as cnt FROM Board ${whereClause}`);
  const total = parseInt(countRow?.cnt || "0");
  const totalPages = Math.ceil(total / perPage);

  // Fetch rows
  const rows = sqliteQuery(dbPath, `SELECT id, title, username, regdate, click, category, photos FROM Board ${whereClause} ORDER BY id DESC LIMIT ${perPage} OFFSET ${offset}`);

  // Build table rows
  const rowsHtml = rows.map((r) => {
    const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.id}`;
    return `<tr style="border-bottom:1px solid #e5e5e5;">
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.id}</td>
      <td style="padding:10px 8px;"><a href="${href}" style="color:#333;text-decoration:none;font-size:14px;">${escapeHtml(r.title || "")}</a></td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${escapeHtml(r.username || "관리자")}</td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.regdate || ""}</td>
      <td style="padding:10px 8px;text-align:center;color:#888;font-size:13px;">${r.click || 0}</td>
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

/* ─── BoardPlugin: inject dynamic board lists into page body ─── */
function renderBoardPluginContent(
  dbPath: string, shopId: string, lang: string, pageSlug: string, bodyHtml: string, urlPrefix: string = ""
): string {
  // Fetch all BoardPlugin entries for this page
  const pageFile = pageSlug === "index" ? "index.html" : `${pageSlug}.html`;
  const plugins = sqliteQuery(dbPath, `SELECT * FROM BoardPlugin WHERE page = '${pageFile}'`);
  if (plugins.length === 0) return bodyHtml;

  let result = bodyHtml;

  for (const plugin of plugins) {
    const divId = String(plugin.divid || "");
    const category = parseInt(String(plugin.category)) || 0;
    const nums = parseInt(String(plugin.nums)) || 5;
    const titleLen = parseInt(String(plugin.titlelen)) || 20;
    const dateStyle = String(plugin.datestyle || "0");
    const displayStyle = parseInt(String(plugin.displaystyle)) || 0;
    const skinFile = String(plugin.skin_file || "");

    // Check if this div exists in the body HTML
    if (!divId || !result.includes(divId)) continue;

    // Fetch board entries for this category
    const whereClause = category > 0
      ? `WHERE category = ${category} AND parent = 0`
      : "WHERE parent = 0";
    const rows = sqliteQuery(dbPath, `SELECT id, title, username, regdate, click, category, photos FROM Board ${whereClause} ORDER BY id DESC LIMIT ${nums}`);

    // Build the link page for board items
    const boardPage = skinFile || `board.html?action=list&category=${category}`;

    let contentHtml = "";

    if (displayStyle === 0) {
      // List style: title + date
      const items = rows.map((r) => {
        const title = r.title || "";
        const truncTitle = title.length > titleLen ? title.substring(0, titleLen) + ".." : title;
        const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.id}`;
        const date = dateStyle === "0" || !dateStyle
          ? (r.regdate || "").trim()
          : (r.regdate || "").trim().substring(0, 7); // Y/m format
        return `<li style="line-height:22px;list-style:none;display:flex;justify-content:space-between;padding:2px 0;">
          <a href="${href}" style="color:#ccc;text-decoration:none;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(truncTitle)}</a>
          <span style="color:#777;font-size:11px;flex-shrink:0;margin-left:8px;">${date}</span>
        </li>`;
      }).join("");
      contentHtml = `<ul style="margin:0;padding:0;">${items}</ul>`;
    } else if (displayStyle === 1) {
      // Gallery style: images with titles (use thumbnail URL)
      const imgW = parseInt(String(plugin.img_w)) || 150;
      const imgH = parseInt(String(plugin.img_h)) || 100;
      const thumbSize = `${imgW}x${imgH}`;
      const items = rows.map((r) => {
        const photos = r.photos ? String(r.photos).split("|").filter(Boolean) : [];
        const firstPhoto = photos[0] || "";
        const imgSrc = firstPhoto
          ? `https://home.homenshop.com/${shopId}/thumb/${thumbSize}/${encodeURIComponent(firstPhoto)}`
          : "";
        const title = r.title || "";
        const truncTitle = title.length > titleLen ? title.substring(0, titleLen) + ".." : title;
        const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.id}`;
        return `<div style="display:inline-block;vertical-align:top;text-align:center;margin:4px;">
          <a href="${href}">
            ${imgSrc ? `<img src="${imgSrc}" style="width:${imgW}px;height:${imgH}px;object-fit:cover;border-radius:4px;" alt="${escapeHtml(truncTitle)}" />` : `<div style="width:${imgW}px;height:${imgH}px;background:#333;border-radius:4px;"></div>`}
          </a>
          <div style="font-size:11px;color:#ccc;margin-top:4px;max-width:${imgW}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <a href="${href}" style="color:#ccc;text-decoration:none;">${escapeHtml(truncTitle)}</a>
          </div>
        </div>`;
      }).join("");
      contentHtml = items;
    } else if (displayStyle === 2) {
      // Slideshow style: images cycling (simplified as first image display)
      const allPhotos: { src: string; title: string; href: string }[] = [];
      for (const r of rows) {
        const photos = r.photos ? r.photos.split("|").filter(Boolean) : [];
        for (const p of photos) {
          allPhotos.push({
            src: `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`,
            title: r.title || "",
            href: `${urlPrefix}/${lang}/board.html?action=read&id=${r.id}`,
          });
        }
      }
      if (allPhotos.length > 0) {
        const sliderId = `slider_${divId.replace(/[^a-zA-Z0-9]/g, "_")}`;
        const slides = allPhotos.map((p, i) =>
          `<div class="${sliderId}_slide" style="display:${i === 0 ? 'block' : 'none'};width:100%;height:100%;">
            <a href="${p.href}"><img src="${p.src}" style="width:100%;height:100%;object-fit:cover;" alt="${escapeHtml(p.title)}" /></a>
          </div>`
        ).join("");
        contentHtml = `${slides}<script>(function(){var s=document.querySelectorAll('.${sliderId}_slide'),i=0;if(s.length<2)return;setInterval(function(){s[i].style.display='none';i=(i+1)%s.length;s[i].style.display='block';},3000);})();</script>`;
      }
    }

    if (contentHtml) {
      // The boardPlugin divs in the DB body already contain stale content from the legacy system.
      // We need to REPLACE the inner content of these divs with fresh data.
      // Use tag-depth counting to find the matching closing </div> for the boardPlugin div.
      const escapedId = divId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const openTagRegex = new RegExp(
        `<(?:div|DIV)[^>]*id=["']?${escapedId}["']?[^>]*>`,
        "i"
      );
      const openMatch = openTagRegex.exec(result);
      if (openMatch) {
        const startOfTag = openMatch.index;
        const afterOpenTag = startOfTag + openMatch[0].length;
        // Count nested divs to find the correct closing </div>
        let depth = 1;
        let pos = afterOpenTag;
        while (pos < result.length && depth > 0) {
          const nextOpen = result.indexOf("<div", pos);
          const nextDIV = result.indexOf("<DIV", pos);
          const nextOpenPos = Math.min(
            nextOpen === -1 ? Infinity : nextOpen,
            nextDIV === -1 ? Infinity : nextDIV
          );
          const nextCloseLC = result.indexOf("</div>", pos);
          const nextCloseUC = result.indexOf("</DIV>", pos);
          const nextClosePos = Math.min(
            nextCloseLC === -1 ? Infinity : nextCloseLC,
            nextCloseUC === -1 ? Infinity : nextCloseUC
          );
          if (nextClosePos === Infinity) break;
          if (nextOpenPos < nextClosePos) {
            depth++;
            pos = nextOpenPos + 4;
          } else {
            depth--;
            if (depth === 0) {
              // Replace content between opening tag and this closing tag
              result = result.substring(0, afterOpenTag) + contentHtml + result.substring(nextClosePos);
              break;
            }
            pos = nextClosePos + 6;
          }
        }
      }
    }
  }

  return result;
}



/* ─── Product detail / list page rendering ─── */
function renderProductRead(
  dbPath: string, shopId: string, lang: string, productId: number, urlPrefix: string, goodsPage: string = "goods"
): string {
  const row = sqliteQueryOne(dbPath, `SELECT * FROM Product WHERE id = ${productId}`);
  if (!row) return `<div style="max-width:700px;margin:40px auto;padding:20px;text-align:center;color:#666;font-size:15px;">Product not found. (id=${productId})</div>`;

  const pname = String(row.pname || "");
  const price = row.price ? `$${row.price}` : "";
  const contents = String(row.contents || "");
  const photos = row.photos ? String(row.photos).split("|").filter(Boolean) : [];
  const specification = String(row.specification || "");

  // Build photo gallery
  const mainImg = photos[0]
    ? `<img src="https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(photos[0])}" style="max-width:400px;width:100%;height:auto;border:1px solid #eee;" alt="${escapeHtml(pname)}" />`
    : "";
  const thumbs = photos.length > 1
    ? photos.map((p, i) =>
        `<img src="https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}" onclick="document.getElementById('prod-main-img').src=this.src" style="width:60px;height:60px;object-fit:cover;border:1px solid #ddd;cursor:pointer;margin:2px;${i === 0 ? 'border-color:#999;' : ''}" alt="" />`
      ).join("")
    : "";

  // Get category name
  const catId = parseInt(String(row.category)) || 0;
  const catRow = sqliteQueryOne(dbPath, `SELECT category FROM ProductCategory WHERE id = ${catId} AND lang = '${escapeSql(lang)}'`);
  const catName = catRow ? String(catRow.category) : "";

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

function renderProductList(
  dbPath: string, shopId: string, lang: string, category: number, page: number, urlPrefix: string, goodsPage: string = "goods"
): string {
  // Get categories
  const categories = sqliteQuery(dbPath,
    `SELECT * FROM ProductCategory WHERE lang = '${escapeSql(lang)}' ORDER BY id`
  );

  // Category tabs
  const allHref = `${urlPrefix}/${lang}/${goodsPage}.html?action=list`;
  const catTabs = categories.map((c) => {
    const catId = parseInt(String(c.id)) || 0;
    const catName = String(c.category || "");
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=list&category=${catId}`;
    const active = catId === category;
    return `<a href="${href}" style="display:inline-block;padding:8px 20px;margin:0 2px;text-decoration:none;font-size:13px;font-weight:bold;color:${active ? '#fff' : '#555'};background:${active ? '#666' : '#f5f5f5'};border:1px solid #ddd;">${escapeHtml(catName)}</a>`;
  }).join("");
  const allActive = category === 0;
  const tabsHtml = `<div style="margin-bottom:20px;text-align:center;">
    <a href="${allHref}" style="display:inline-block;padding:8px 20px;margin:0 2px;text-decoration:none;font-size:13px;font-weight:bold;color:${allActive ? '#fff' : '#555'};background:${allActive ? '#666' : '#f5f5f5'};border:1px solid #ddd;">All</a>
    ${catTabs}
  </div>`;

  // Get category display settings
  const catSetting = category > 0
    ? sqliteQueryOne(dbPath, `SELECT * FROM ProductCategory WHERE id = ${category} AND lang = '${escapeSql(lang)}'`)
    : categories[0] || null;
  const imgW = parseInt(String(catSetting?.img_w)) || 135;
  const imgH = parseInt(String(catSetting?.img_h)) || 135;
  const titleLen = parseInt(String(catSetting?.titlelen)) || 40;
  const perPage = parseInt(String(catSetting?.rows)) || 40;

  // Query products
  const whereClause = category > 0 ? `WHERE category = ${category}` : "";
  const offset = (page - 1) * perPage;
  const rows = sqliteQuery(dbPath,
    `SELECT * FROM Product ${whereClause} ORDER BY id DESC LIMIT ${perPage} OFFSET ${offset}`
  );
  const countRow = sqliteQueryOne(dbPath,
    `SELECT COUNT(*) as cnt FROM Product ${whereClause}`
  );
  const total = parseInt(String(countRow?.cnt)) || 0;
  const totalPages = Math.ceil(total / perPage);

  // Product grid
  const items = rows.map((r) => {
    const pname = String(r.pname || "");
    const truncName = pname.length > titleLen ? pname.substring(0, titleLen) + ".." : pname;
    const photos = r.photos ? String(r.photos).split("|").filter(Boolean) : [];
    const firstPhoto = photos[0] || "";
    const imgSrc = firstPhoto
      ? `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`
      : "";
    const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=read&id=${r.id}`;
    const price = r.price ? `<div style="color:#c00;font-size:12px;margin-top:2px;">$${escapeHtml(String(r.price))}</div>` : "";
    return `<div style="display:inline-block;vertical-align:top;text-align:center;margin:8px;width:${imgW + 20}px;">
      <a href="${href}">
        ${imgSrc ? `<img src="${imgSrc}" style="width:${imgW}px;height:${imgH}px;object-fit:contain;border:1px solid #eee;" alt="${escapeHtml(truncName)}" />` : `<div style="width:${imgW}px;height:${imgH}px;background:#f9f9f9;border:1px solid #eee;"></div>`}
      </a>
      <div style="font-size:11px;color:#333;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        <a href="${href}" style="color:#333;text-decoration:none;">${escapeHtml(truncName)}</a>
      </div>
      ${price}
    </div>`;
  }).join("");

  // Pagination
  let paginationHtml = "";
  if (totalPages > 1) {
    const links = [];
    for (let i = 1; i <= totalPages; i++) {
      const catParam = category > 0 ? `&category=${category}` : "";
      const href = `${urlPrefix}/${lang}/${goodsPage}.html?action=list${catParam}&page=${i}`;
      if (i === page) {
        links.push(`<span style="display:inline-block;padding:4px 10px;margin:0 2px;font-weight:bold;color:#333;border:1px solid #333;">${i}</span>`);
      } else {
        links.push(`<a href="${href}" style="display:inline-block;padding:4px 10px;margin:0 2px;color:#666;text-decoration:none;border:1px solid #ddd;">${i}</a>`);
      }
    }
    paginationHtml = `<div style="text-align:center;margin-top:20px;">${links.join("")}</div>`;
  }

  return `<div style="max-width:900px;margin:20px auto;padding:20px;font-family:Tahoma,Arial,sans-serif;">
    ${tabsHtml}
    <div style="text-align:center;">${items}</div>
    ${paginationHtml}
  </div>`;
}

/* ─── Product plugin rendering ─── */
function renderProductPluginContent(
  dbPath: string, shopId: string, lang: string, pageSlug: string,
  bodyHtml: string, urlPrefix: string
): string {
  // Read ProductPlugin entries for this page
  const plugins = sqliteQuery(dbPath,
    `SELECT * FROM ProductPlugin WHERE lang = '${escapeSql(lang)}' AND page = '${escapeSql(pageSlug)}.html'`
  );
  if (plugins.length === 0) return bodyHtml;

  let result = bodyHtml;

  for (const plugin of plugins) {
    const divId = String(plugin.divid || "");
    const category = parseInt(String(plugin.category)) || 0;
    const nums = parseInt(String(plugin.nums)) || 7;
    const titleLen = parseInt(String(plugin.titlelen)) || 38;
    const imgW = parseInt(String(plugin.img_w)) || 128;
    const imgH = parseInt(String(plugin.img_h)) || 125;
    const displayStyle = parseInt(String(plugin.displaystyle)) || 0;
    const skinFile = String(plugin.skin_file || "goods.html");

    if (!divId || !result.includes(divId)) continue;

    // Fetch products
    const whereClause = category > 0
      ? `WHERE category = ${category}`
      : "";
    const rows = sqliteQuery(dbPath,
      `SELECT * FROM Product ${whereClause} ORDER BY id DESC LIMIT ${nums}`
    );

    const goodsPage = skinFile || "goods.html";
    let contentHtml = "";

    // Product list: horizontal image + title layout
    const items = rows.map((r) => {
      const pname = String(r.pname || "");
      const truncName = pname.length > titleLen ? pname.substring(0, titleLen) + ".." : pname;
      const photos = r.photos ? String(r.photos).split("|").filter(Boolean) : [];
      const firstPhoto = photos[0] || "";
      const imgSrc = firstPhoto
        ? `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`
        : "";
      const href = `${urlPrefix}/${lang}/${goodsPage}?action=read&id=${r.id}`;
      const price = r.price ? `<span style="color:#333;font-size:12px;">$${r.price}</span>` : "";
      return `<div style="flex:1;min-width:0;text-align:center;">
        <a href="${href}">
          ${imgSrc ? `<img src="${imgSrc}" style="width:${imgW}px;height:${imgH}px;object-fit:contain;border:1px solid #eee;" alt="${escapeHtml(truncName)}" />` : `<div style="width:${imgW}px;height:${imgH}px;background:#f5f5f5;border:1px solid #eee;"></div>`}
        </a>
        <div style="font-size:11px;color:#333;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <a href="${href}" style="color:#333;text-decoration:none;">${escapeHtml(truncName)}</a>
        </div>
        ${price}
      </div>`;
    }).join("");
    contentHtml = `<div style="display:flex;justify-content:space-evenly;align-items:flex-start;width:100%;gap:4px;">${items}</div>`;

    if (contentHtml) {
      // Replace inner content of the productPlugin div
      const escapedId = divId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const openTagRegex = new RegExp(
        `<(?:div|DIV)[^>]*id=["']?${escapedId}["']?[^>]*>`,
        "i"
      );
      const openMatch = openTagRegex.exec(result);
      if (openMatch) {
        const startOfTag = openMatch.index;
        const afterOpenTag = startOfTag + openMatch[0].length;
        let depth = 1;
        let pos = afterOpenTag;
        while (pos < result.length && depth > 0) {
          const nextOpen = result.indexOf("<div", pos);
          const nextDIV = result.indexOf("<DIV", pos);
          const nextOpenPos = Math.min(
            nextOpen === -1 ? Infinity : nextOpen,
            nextDIV === -1 ? Infinity : nextDIV
          );
          const nextCloseLC = result.indexOf("</div>", pos);
          const nextCloseUC = result.indexOf("</DIV>", pos);
          const nextClosePos = Math.min(
            nextCloseLC === -1 ? Infinity : nextCloseLC,
            nextCloseUC === -1 ? Infinity : nextCloseUC
          );
          if (nextClosePos === Infinity) break;
          if (nextOpenPos < nextClosePos) {
            depth += 1;
            pos = nextOpenPos + 4;
          } else {
            depth -= 1;
            if (depth === 0) {
              result = result.substring(0, afterOpenTag) + contentHtml + result.substring(nextClosePos);
              break;
            }
            pos = nextClosePos + 6;
          }
        }
      }
    }
  }

  return result;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ shopId: string; lang: string; slug?: string[] }> }
) {
  const { shopId, lang, slug } = await params;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const boardId = parseInt(url.searchParams.get("id") || "0");
  const boardCategory = parseInt(url.searchParams.get("category") || "0");
  const boardPage = parseInt(url.searchParams.get("page") || "1");

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
  const hmf = site.hmfTranslations?.find((h) => h.lang === lang)
    || site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);
  const siteHeaderHtml = hmf?.headerHtml ?? site.headerHtml ?? "";
  const siteMenuHtml = hmf?.menuHtml ?? site.menuHtml ?? "";
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

  // Dynamic board content
  const dbPath = getDbPath(shopId);

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

  if (dbPath && isProductAction) {
    if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = renderProductRead(dbPath, shopId, lang, boardId, urlPrefix, productPageSlug);
    } else if (effectiveAction === "list") {
      boardSectionHtml = renderProductList(dbPath, shopId, lang, boardCategory, boardPage, urlPrefix, productPageSlug);
    }
    if (boardSectionHtml) {
      bodyHtml = "";
    }
  } else if (dbPath && isBoardAction) {
    if (effectiveAction === "read" && boardId > 0) {
      boardSectionHtml = renderBoardRead(dbPath, shopId, lang, boardId, urlPrefix);
    } else if (effectiveAction === "list") {
      boardSectionHtml = renderBoardList(dbPath, shopId, lang, boardCategory, boardPage, urlPrefix);
    }
    // Board action pages: clear body HTML (absolute-positioned page elements create unwanted space)
    if (boardSectionHtml) {
      bodyHtml = "";
    }
  }

  // BoardPlugin: inject dynamic board lists into page body (for all pages)
  if (dbPath) {
    bodyHtml = renderBoardPluginContent(dbPath, shopId, lang, pageSlug, bodyHtml, urlPrefix);
  }

  // ProductPlugin: inject dynamic product lists into page body
  if (dbPath) {
    bodyHtml = renderProductPluginContent(dbPath, shopId, lang, pageSlug, bodyHtml, urlPrefix);
  }

  // Get template CSS
  const templatePath = site.templatePath || "";
  let templateCss = "";
  if (templatePath) {
    templateCss = readTemplateCss(templatePath);
  }

  // Get page-specific CSS — boost position/size properties with !important
  // so they override site-upgrade.css !important rules (pageCss is page-specific)
  const rawPageCss = (page as any).css || "";
  const pageCss = rawPageCss.replace(
    /(\b(?:top|left|width|height|display|position|z-index)\s*:\s*)([^;!}]+)(;|})/gi,
    (_: string, prop: string, val: string, end: string) =>
      val.trim().includes('!important') ? `${prop}${val}${end}` : `${prop}${val.trim()} !important${end}`
  );

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
      const target = p.externalUrl ? ` target="_blank"` : "";
      const actualHref = p.externalUrl || href;
      const children = getChildren(p.id);

      if (children.length === 0) {
        return `<li><a title="${label}" href="${actualHref}"${target}>${label}</a></li>`;
      }

      const subItems = children
        .map((c) => {
          const cLabel = c.menuTitle || c.title;
          const cHref = c.externalUrl || (c.isHome ? `${urlPrefix}/${lang}/` : `${urlPrefix}/${lang}/${c.slug}.html`);
          const cTarget = c.externalUrl ? ` target="_blank"` : "";
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
  if (!rawMenuHtml) {
    menuHtml = generatedMenu;
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
        if (/<ul[^>]*>\s*<li/i.test(rawMenuHtml)) {
          // HMF already has a complete menu, don't duplicate
          menuHtml = rawMenuHtml;
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
    .c_v_home_dft { overflow: hidden; width: 1000px !important; margin: 0 auto !important; }
    `;

  // Scale-to-fit script only for legacy templates
  const scaleScript = isModernTemplate ? '' : `<script>(function(){
  window.__dbg=location.search.indexOf('debug')>-1; var el = document.getElementById('v_home_dft');
  if (!el) return;
  document.documentElement.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  document.body.style.cssText += 'margin:0;padding:0;overflow-x:hidden;';
  el.style.cssText += 'width:1000px;margin:0 auto;overflow:hidden;position:relative;';
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
    : `<script>(function(){var el=document.getElementById('hns_body');if(!el)return;function calc(){var m=0;var all=el.querySelectorAll('.dragable');for(var i=0;i<all.length;i++){var c=all[i],cs=window.getComputedStyle(c);if(cs.position==='absolute'){var t=parseInt(cs.top)||0,h=c.offsetHeight||0;if(t+h>m)m=t+h;}}if(m>0)el.style.minHeight=m+'px';}calc();var imgs=el.querySelectorAll('img');var n=0;function onImg(){n++;if(n>=imgs.length)calc();}for(var j=0;j<imgs.length;j++){if(imgs[j].complete)n++;else{imgs[j].addEventListener('load',onImg);imgs[j].addEventListener('error',onImg);}}if(n>=imgs.length&&imgs.length>0)calc();setTimeout(calc,500);})();</script>`;

  const boardPageCss = '';

  // Per-item SEO: override page-level SEO with product/board item data
  let itemSeoTitle = "";
  let itemSeoDesc = "";
  let itemSeoKeywords = "";
  let itemOgImage = "";
  if (dbPath && isProductAction && effectiveAction === "read" && boardId > 0) {
    const pRow = sqliteQueryOne(dbPath, `SELECT pname, contents, photos, specification FROM Product WHERE id = ${boardId}`);
    if (pRow) {
      const pname = String(pRow.pname || "");
      itemSeoTitle = `${pname} - ${site.name}`;
      // Description: use specification or strip HTML from contents (first 160 chars)
      const rawDesc = String(pRow.specification || pRow.contents || "");
      const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      itemSeoDesc = plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc;
      itemSeoKeywords = pname.replace(/[,/|]/g, ", ");
      const pPhotos = pRow.photos ? String(pRow.photos).split("|").filter(Boolean) : [];
      if (pPhotos[0]) {
        itemOgImage = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(pPhotos[0])}`;
      }
    }
  } else if (dbPath && isBoardAction && effectiveAction === "read" && boardId > 0) {
    const bRow = sqliteQueryOne(dbPath, `SELECT title, contents, photos FROM Board WHERE id = ${boardId}`);
    if (bRow) {
      const bTitle = String(bRow.title || "");
      itemSeoTitle = `${bTitle} - ${site.name}`;
      const rawDesc = String(bRow.contents || "");
      const plainDesc = rawDesc.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      itemSeoDesc = plainDesc.length > 160 ? plainDesc.substring(0, 157) + "..." : plainDesc;
      itemSeoKeywords = bTitle;
      const bPhotos = bRow.photos ? String(bRow.photos).split("|").filter(Boolean) : [];
      const imageExts = new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"]);
      const firstImage = bPhotos.find(p => imageExts.has(p.split(".").pop()?.toLowerCase() || ""));
      if (firstImage) {
        itemOgImage = `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(firstImage)}`;
      }
    }
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
