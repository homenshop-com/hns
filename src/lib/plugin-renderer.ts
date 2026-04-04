import { prisma } from "@/lib/db";

export function escapeHtml(s: unknown): string {
  const str = String(s ?? "");
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ─── Tag-depth content replacement ─── */
function replaceInnerByDivId(html: string, divId: string, newContent: string): string {
  const escapedId = divId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openTagRegex = new RegExp(
    `<(?:div|DIV)[^>]*id=["']?${escapedId}["']?[^>]*>`,
    "i"
  );
  const openMatch = openTagRegex.exec(html);
  if (!openMatch) return html;

  const afterOpenTag = openMatch.index + openMatch[0].length;
  let depth = 1;
  let pos = afterOpenTag;
  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf("<div", pos);
    const nextDIV = html.indexOf("<DIV", pos);
    const nextOpenPos = Math.min(
      nextOpen === -1 ? Infinity : nextOpen,
      nextDIV === -1 ? Infinity : nextDIV
    );
    const nextCloseLC = html.indexOf("</div>", pos);
    const nextCloseUC = html.indexOf("</DIV>", pos);
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
        return html.substring(0, afterOpenTag) + newContent + html.substring(nextClosePos);
      }
      pos = nextClosePos + 6;
    }
  }
  return html;
}

/* ─── BoardPlugin rendering (Prisma) ─── */
export async function renderBoardPluginContent(
  siteId: string, shopId: string, lang: string, pageSlug: string,
  bodyHtml: string, urlPrefix: string = ""
): Promise<string> {
  const pageFile = pageSlug === "index" ? "index.html" : `${pageSlug}.html`;
  const plugins = await prisma.boardPlugin.findMany({
    where: { siteId, page: pageFile },
  });
  if (plugins.length === 0) return bodyHtml;

  let result = bodyHtml;

  for (const plugin of plugins) {
    const divId = plugin.divId;
    const legacyCatId = plugin.legacyCatId;
    const nums = plugin.nums;
    const titleLen = plugin.titleLen;
    const dateStyle = plugin.dateStyle;
    const displayStyle = plugin.displayStyle;
    const skinFile = plugin.skinFile;

    if (!divId || !result.includes(divId)) continue;

    // Find category by legacyCatId
    const catFilter: Record<string, unknown> = { siteId, parentId: null };
    if (legacyCatId && legacyCatId > 0) {
      const cat = await prisma.boardCategory.findFirst({
        where: { siteId, legacyId: legacyCatId },
      });
      if (cat) catFilter.categoryId = cat.id;
    }

    const rows = await prisma.boardPost.findMany({
      where: catFilter,
      orderBy: { legacyId: "desc" },
      take: nums,
      select: { legacyId: true, title: true, regdate: true, photos: true },
    });

    const boardPage = skinFile || `board.html?action=list&category=${legacyCatId || 0}`;
    let contentHtml = "";

    if (displayStyle === 0) {
      const items = rows.map((r) => {
        const title = r.title || "";
        const truncTitle = title.length > titleLen ? title.substring(0, titleLen) + ".." : title;
        const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`;
        const date = dateStyle === "0" || !dateStyle
          ? (r.regdate || "").trim()
          : (r.regdate || "").trim().substring(0, 7);
        return `<li style="line-height:22px;list-style:none;display:flex;justify-content:space-between;padding:2px 0;">
          <a href="${href}" style="color:#ccc;text-decoration:none;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(truncTitle)}</a>
          <span style="color:#777;font-size:11px;flex-shrink:0;margin-left:8px;">${date}</span>
        </li>`;
      }).join("");
      contentHtml = `<ul style="margin:0;padding:0;">${items}</ul>`;
    } else if (displayStyle === 1) {
      const imgW = plugin.imgWidth;
      const imgH = plugin.imgHeight;
      const thumbSize = `${imgW}x${imgH}`;
      const items = rows.map((r) => {
        const photos = r.photos ? r.photos.split("|").filter(Boolean) : [];
        const firstPhoto = photos[0] || "";
        const imgSrc = firstPhoto
          ? `https://home.homenshop.com/${shopId}/thumb/${thumbSize}/${encodeURIComponent(firstPhoto)}`
          : "";
        const title = r.title || "";
        const truncTitle = title.length > titleLen ? title.substring(0, titleLen) + ".." : title;
        const href = `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`;
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
      const allPhotos: { src: string; title: string; href: string }[] = [];
      for (const r of rows) {
        const photos = r.photos ? r.photos.split("|").filter(Boolean) : [];
        for (const p of photos) {
          allPhotos.push({
            src: `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(p)}`,
            title: r.title || "",
            href: `${urlPrefix}/${lang}/board.html?action=read&id=${r.legacyId}`,
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
      result = replaceInnerByDivId(result, divId, contentHtml);
    }
  }

  return result;
}

/* ─── ProductPlugin rendering (Prisma) ─── */
export async function renderProductPluginContent(
  siteId: string, shopId: string, lang: string, pageSlug: string,
  bodyHtml: string, urlPrefix: string = ""
): Promise<string> {
  const pageFile = `${pageSlug === "index" ? "index" : pageSlug}.html`;
  const plugins = await prisma.productPlugin.findMany({
    where: { siteId, lang, page: pageFile },
  });
  if (plugins.length === 0) return bodyHtml;

  let result = bodyHtml;

  for (const plugin of plugins) {
    const divId = plugin.divId;
    const legacyCatId = plugin.legacyCatId;
    const nums = plugin.nums;
    const titleLen = plugin.titleLen;
    const imgW = plugin.imgWidth;
    const imgH = plugin.imgHeight;
    const skinFile = plugin.skinFile || "goods.html";

    if (!divId || !result.includes(divId)) continue;

    const where: Record<string, unknown> = { siteId };
    if (legacyCatId && legacyCatId > 0) {
      where.category = String(legacyCatId);
    }

    const rows = await prisma.product.findMany({
      where,
      orderBy: { legacyId: "desc" },
      take: nums,
      select: { legacyId: true, name: true, price: true, photos: true },
    });

    const goodsPage = skinFile || "goods.html";

    const items = rows.map((r) => {
      const pname = r.name || "";
      const truncName = pname.length > titleLen ? pname.substring(0, titleLen) + ".." : pname;
      const photos = r.photos ? r.photos.split("|").filter(Boolean) : [];
      const firstPhoto = photos[0] || "";
      const imgSrc = firstPhoto
        ? `https://home.homenshop.com/${shopId}/uploaded/${encodeURIComponent(firstPhoto)}`
        : "";
      const href = `${urlPrefix}/${lang}/${goodsPage}?action=read&id=${r.legacyId}`;
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
    const contentHtml = `<div style="display:flex;justify-content:space-evenly;align-items:flex-start;width:100%;gap:4px;">${items}</div>`;

    if (contentHtml) {
      result = replaceInnerByDivId(result, divId, contentHtml);
    }
  }

  return result;
}
