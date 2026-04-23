#!/usr/bin/env node
/**
 * Rebuild unionled/ko/index.html so the hardcoded placeholder cards get
 * filled with real xunion5 photos + links.
 *
 * What changes:
 *   1. 12 product-lineup cards  → each card gets a real xunion5 photo as
 *      background + `href` points to the matching `board.html?action=list&category=X`
 *   2.  5 featured-case cards   → real installation photos as background +
 *      link to the specific BoardPost (board.html?action=read&id=X)
 *   3.  2 notice columns (8 rows) → real posts from
 *        left:  '공지사항' (cat 1) — recent customer-delivery lists
 *        right: '견적문의 및 주문' (cat 13) — recent inquiries / FAQ
 *   4. Filter buttons (전체/실내/옥외/...) kept visual; no JS filter logic added
 *
 * CSS added to Site.cssText + Template.cssText (once, marker-guarded):
 *   - `.ul-product-card > img` absolute cover so the existing .overlay sits on top
 *   - `.ul-case-card > img` same treatment
 *
 * Run:
 *   DATABASE_URL="..." node scripts/rebuild-unionled-index-page.mjs
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const SHOP_ID = "unionled";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

const THUMB_CARD = "600x400";
const THUMB_CASE = "900x600";

/** Product lineup card map — 12 cards, each pinned to a (category, filter-keyword) */
const LINEUP = [
  { name: "실내용 전광판",        cat: 3,  badge: "Indoor",     tag: "Indoor LED",        pick: null },
  { name: "교회·학교 실내 전광판",  cat: 3,  badge: "Indoor",     tag: "Indoor LED",        pick: ["교회", "학교", "성당"] },
  { name: "관공서 옥외 전광판",     cat: 4,  badge: "Outdoor",    tag: "Outdoor billboard", pick: ["관공서", "시청", "군청", "청"] },
  { name: "상가 옥외 사이니지",     cat: 4,  badge: "Outdoor",    tag: "Outdoor billboard", pick: null },
  { name: "주문형 현황판",          cat: 11, badge: "On-Demand",  tag: "On-demand billboard", pick: null },
  { name: "주유소 가격 전광판",     cat: 5,  badge: "Gas",        tag: "Gas Station signage", pick: ["주유", "유가"] },
  { name: "LPG 주유소 전광판",      cat: 5,  badge: "Gas",        tag: "Gas Station signage", pick: ["LPG", "lpg", "충전"] },
  { name: "풀컬러 LED 전광판",      cat: 6,  badge: "Full color", tag: "Full color signage", pick: null },
  { name: "대형 풀컬러 사이니지",   cat: 6,  badge: "Full color", tag: "Full color signage", pick: ["대형", "RGB"] },
  { name: "관공서 실내 안내판",     cat: 3,  badge: "Indoor",     tag: "Indoor LED",        pick: ["관공서", "안내"] },
  { name: "학원·학교 옥외",         cat: 4,  badge: "Outdoor",    tag: "Outdoor billboard", pick: ["학원", "학교"] },
  { name: "특수형 현황판",          cat: 10, badge: "Special",    tag: "Special signage",   pick: null },
];

/** Featured cases — 5 cards (index 0 is the large hero card) */
const CASES = [
  { loc: "Full color · 대형",  title: null, tags: ["풀컬러", "옥외", "대형"], cat: 6 },
  { loc: "Indoor · 실내",      title: null, tags: ["풀컬러", "실내"],        cat: 3 },
  { loc: "Gas · 주유소",       title: null, tags: ["가격표시"],              cat: 5 },
  { loc: "Outdoor · 옥외",     title: null, tags: ["관공서"],                cat: 4 },
  { loc: "Custom · 주문형",    title: null, tags: ["주문형"],                cat: 11 },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function findPost(client, siteId, legacyCatId, keywords, excludeIds) {
  const bc = await client.query(
    `SELECT id FROM "BoardCategory" WHERE "siteId"=$1 AND "legacyId"=$2 AND lang='ko' LIMIT 1`,
    [siteId, legacyCatId],
  );
  if (bc.rowCount === 0) return null;
  const catId = bc.rows[0].id;

  const base = `SELECT "legacyId", title, photos FROM "BoardPost"
                  WHERE "siteId"=$1 AND "categoryId"=$2 AND lang='ko'
                    AND photos IS NOT NULL AND photos <> ''`;
  const params = [siteId, catId];
  let where = base;
  if (excludeIds && excludeIds.length) {
    params.push(excludeIds);
    where += ` AND "legacyId" <> ALL($${params.length}::int[])`;
  }
  if (keywords && keywords.length) {
    const likes = keywords.map((_, i) => `title ILIKE $${params.length + i + 1}`).join(" OR ");
    where += ` AND (${likes})`;
    keywords.forEach((k) => params.push(`%${k}%`));
    const r1 = await client.query(where + ` ORDER BY "legacyId" DESC LIMIT 1`, params);
    if (r1.rowCount > 0) return r1.rows[0];
    // fall-through: no keyword match, return latest for category
  }
  // Strip keyword likes if we fell through
  const paramsFallback = excludeIds && excludeIds.length
    ? [siteId, catId, excludeIds]
    : [siteId, catId];
  const fallbackWhere = excludeIds && excludeIds.length
    ? base + ` AND "legacyId" <> ALL($3::int[])`
    : base;
  const r2 = await client.query(fallbackWhere + ` ORDER BY "legacyId" DESC LIMIT 1`, paramsFallback);
  return r2.rowCount > 0 ? r2.rows[0] : null;
}

function firstPhoto(post) {
  if (!post?.photos) return null;
  return post.photos.split("|").filter(Boolean)[0] || null;
}

function thumbUrl(shopId, photo, size) {
  return `https://home.homenshop.com/${shopId}/thumb/${size}/${encodeURIComponent(photo)}`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* ── Fetch all the posts we need, tracking used IDs so we don't repeat ── */
  const lineupPosts = [];
  const usedIds = [];
  for (const item of LINEUP) {
    const post = await findPost(client, SITE_ID, item.cat, item.pick, usedIds);
    if (post) usedIds.push(post.legacyId);
    lineupPosts.push({ item, post });
  }

  const casePosts = [];
  const caseUsedIds = [];
  for (const c of CASES) {
    const post = await findPost(client, SITE_ID, c.cat, null, caseUsedIds);
    if (post) caseUsedIds.push(post.legacyId);
    casePosts.push({ c, post });
  }

  /* ── Notice posts: left=공지사항 latest 4, right=견적문의 latest 4 ── */
  async function latest(catLegacy, limit) {
    const bc = await client.query(
      `SELECT id FROM "BoardCategory" WHERE "siteId"=$1 AND "legacyId"=$2 AND lang='ko' LIMIT 1`,
      [SITE_ID, catLegacy],
    );
    if (bc.rowCount === 0) return [];
    const r = await client.query(
      `SELECT "legacyId", title, regdate FROM "BoardPost"
         WHERE "siteId"=$1 AND "categoryId"=$2 AND lang='ko'
         ORDER BY "legacyId" DESC LIMIT $3`,
      [SITE_ID, bc.rows[0].id, limit],
    );
    return r.rows;
  }
  const noticeLeft = await latest(1, 4);     // 공지사항 (customer list)
  const noticeRight = await latest(13, 4);   // 견적문의 및 주문 (QNA)

  /* ── Load current content ── */
  const cur = await client.query(
    `SELECT id, content FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug='index' LIMIT 1`,
    [SITE_ID],
  );
  if (cur.rowCount === 0) throw new Error("index page not found");
  const pageId = cur.rows[0].id;
  const content = cur.rows[0].content;
  let html = typeof content === "string" ? JSON.parse(content).html : content?.html || "";

  /* ── 1. Product lineup cards: inject <img> + fix href ──
   *    The pattern is always:
   *      <a class="ul-product-card" href="products.html">
   *        ↑↑ blank line ↑↑
   *        <div class="overlay"></div>
   *        <div class="badge">Indoor</div>
   *        ...
   *        <div class="name">실내용 전광판</div>
   */
  let lineupIdx = 0;
  html = html.replace(
    /<a class="ul-product-card" href="products\.html">([\s\S]*?)<\/a>/g,
    (full, inner) => {
      const { item, post } = lineupPosts[lineupIdx++] || {};
      if (!item) return full;
      const photo = firstPhoto(post);
      const imgTag = photo
        ? `<img src="${thumbUrl(SHOP_ID, photo, THUMB_CARD)}" alt="${escapeHtml(item.name)}" class="ul-card-bg" loading="lazy" />`
        : "";
      const href = `board.html?action=list&category=${item.cat}`;
      return `<a class="ul-product-card" href="${href}">${imgTag}${inner}</a>`;
    },
  );

  /* ── 2. Case cards: inject <img> inside .ul-case-card, update info block ── */
  let caseIdx = 0;
  html = html.replace(
    /<div class="ul-case-card( large)?">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g,
    (full, large, inner) => {
      const { c, post } = casePosts[caseIdx++] || {};
      if (!c) return full;
      const photo = firstPhoto(post);
      const imgTag = photo
        ? `<img src="${thumbUrl(SHOP_ID, photo, THUMB_CASE)}" alt="${escapeHtml(post?.title || c.loc)}" class="ul-card-bg" loading="lazy" />`
        : "";
      const href = post ? `board.html?action=read&id=${post.legacyId}` : "cases.html";
      const title = escapeHtml(post?.title || c.title || c.loc);
      const tags = c.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("");
      // Rebuild the whole card with a link wrapper so clicks go to the post
      return `<div class="ul-case-card${large || ""}">${imgTag}
          <a class="ul-case-link" href="${href}" aria-label="${title}"></a>
          <div class="grad"></div>
          <div class="info">
            <span class="loc">${escapeHtml(c.loc)}</span>
            <div class="title">${title}</div>
            <div class="tags">${tags}</div>
          </div>
        </div>
      </div>
    </div>`;
    },
  );

  /* ── 3. Notice rows: replace the 8 <li class="ul-notice-item"> entries ── */
  function noticeLis(rows, fallbackTag) {
    if (!rows.length) return "";
    return rows.map((r) => {
      const d = (r.regdate || "").slice(0, 10).replace(/-/g, ".");
      const href = `board.html?action=read&id=${r.legacyId}`;
      const title = escapeHtml((r.title || "").slice(0, 40));
      return `<li class="ul-notice-item"><a href="${href}" style="display:contents;color:inherit;text-decoration:none;"><div class="t"><span class="tag">${fallbackTag}</span>${title}</div><div class="d">${d}</div></a></li>`;
    }).join("\n            ");
  }
  const leftHtml = noticeLis(noticeLeft, "Notice");
  const rightHtml = noticeLis(noticeRight, "Q&amp;A");
  if (leftHtml) {
    html = html.replace(
      /(<ul class="ul-notice-list">)([\s\S]*?)(<\/ul>)/,
      `$1\n            ${leftHtml}\n          $3`,
    );
  }
  if (rightHtml) {
    // Second occurrence
    let replaced = 0;
    html = html.replace(
      /(<ul class="ul-notice-list">)([\s\S]*?)(<\/ul>)/g,
      (m, a, _b, c) => {
        replaced++;
        return replaced === 2 ? `${a}\n            ${rightHtml}\n          ${c}` : m;
      },
    );
  }

  /* ── Also make the MORE links point to the right board lists ── */
  html = html.replace(
    /<a href="#" class="more">MORE/,
    `<a href="board.html?action=list&category=1" class="more">MORE`,
  );
  html = html.replace(
    /<a href="#" class="more">MORE/,
    `<a href="board.html?action=list&category=13" class="more">MORE`,
  );

  /* ── Also update the filter pills into real links (전체/실내/옥외/...) ── */
  const pillMap = [
    { label: "전체",   href: "products.html" },
    { label: "실내용", href: "board.html?action=list&category=3" },
    { label: "옥외용", href: "board.html?action=list&category=4" },
    { label: "주문형", href: "board.html?action=list&category=11" },
    { label: "주유소", href: "board.html?action=list&category=5" },
    { label: "풀컬러", href: "board.html?action=list&category=6" },
  ];
  html = html.replace(
    /<div class="ul-product-nav">([\s\S]*?)<\/div>/,
    `<div class="ul-product-nav">${pillMap.map((p, i) =>
      `<a href="${p.href}"${i === 0 ? ' class="active"' : ""}>${p.label}</a>`).join("\n      ")}</div>`,
  );

  /* ── Save ── */
  await client.query(
    `UPDATE "Page" SET content = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify({ html }), pageId],
  );
  console.log(`✓ Updated index.html (${html.length} chars)`);

  /* ── Extra CSS for absolute-positioned images inside existing cards ── */
  const marker = "/* HNS-UNIONLED-INDEX-IMG-v2 */";
  const css = `
${marker}
.ul-product-card { position: relative; overflow: hidden; display: block; }
.ul-product-card .ul-card-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  transition: transform 0.5s ease;
}
.ul-product-card:hover .ul-card-bg { transform: scale(1.05); }
.ul-product-card .overlay,
.ul-product-card .badge,
.ul-product-card .meta { position: relative; z-index: 2; }
.ul-product-card .overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.9) 100%);
  z-index: 1;
}

.ul-case-card { position: relative; overflow: hidden; }
.ul-case-card .ul-card-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  transition: transform 0.5s ease;
}
.ul-case-card:hover .ul-card-bg { transform: scale(1.04); }
.ul-case-card .ul-case-link {
  position: absolute;
  inset: 0;
  z-index: 3;
  cursor: pointer;
}
/* NB: do NOT override .info positioning — the template's original rule
   (position:absolute; bottom:20px; left:20px; right:20px;) places info
   at the bottom of the card over the image. Overriding to relative
   breaks that and pushes info to the top of the card. */
.ul-case-card .grad {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%);
  z-index: 1;
}

.ul-product-nav a {
  display: inline-flex;
  align-items: center;
  padding: 8px 18px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.1);
  color: #bbb;
  background: transparent;
  font-size: 13px;
  text-decoration: none;
  transition: all 0.2s;
}
.ul-product-nav a:hover { color: #ffb547; border-color: rgba(255,181,71,0.4); }
.ul-product-nav a.active {
  background: linear-gradient(180deg, #ffb547 0%, #f28a17 100%);
  color: #1a1a1a;
  border-color: #ffb547;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(255,181,71,0.25);
}
`;

  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    const cur = r.rows[0].cssText || "";
    if (cur.includes(marker)) {
      console.log(`  · ${table} CSS already contains img-bg rules — skipped`);
      continue;
    }
    const next = cur + "\n" + css.trim() + "\n";
    await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [next, id]);
    console.log(`  ✓ ${table} cssText: ${cur.length} → ${next.length}`);
  }

  console.log(`\n  Product cards filled : ${lineupPosts.filter((x) => x.post).length}/12`);
  console.log(`  Case cards filled    : ${casePosts.filter((x) => x.post).length}/5`);
  console.log(`  Notice rows (left)   : ${noticeLeft.length}/4`);
  console.log(`  Notice rows (right)  : ${noticeRight.length}/4`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
