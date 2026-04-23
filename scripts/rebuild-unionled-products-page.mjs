#!/usr/bin/env node
/**
 * Rebuild unionled/ko/products.html Page.content so it displays the real
 * xunion5-migrated board posts grouped by LED category.
 *
 * Layout mirrors the xunion5 legacy 'indoor.html / outdoor.html / ...' pattern:
 *
 *   [Hero]
 *   ─── 실내용 전광판 ─── (Indoor LED) ────  more ▸ board.html?category=3
 *     [card] [card] [card] [card]
 *   ─── 옥외 전광판 ───  (Outdoor)     ────  more ▸ board.html?category=4
 *     [card] [card] [card] [card]
 *   ...
 *
 * Each card = 1 real BoardPost with thumbnail + title + link to
 * /unionled/ko/board.html?action=read&id={legacyId}.
 *
 * Follows atomic-layering rules (every title/text/image/card as its own
 * .dragable with obj_* id, cards carry `de-group`, texts carry
 * `sol-replacible-text`).
 *
 * Run on server:
 *   DATABASE_URL="$(...)" node scripts/rebuild-unionled-products-page.mjs
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk"; // unionled
const SHOP_ID = "unionled";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v"; // sync back to Template too

const EXTRA_CSS_MARKER = "/* HNS-UNIONLED-PRODUCTS-GRID */";
const EXTRA_CSS = `
${EXTRA_CSS_MARKER}
.ul-cat-section {
  max-width: 1240px;
  margin: 56px auto 0;
  padding: 0 24px;
}
.ul-cat-header {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255, 181, 71, 0.22);
  margin-bottom: 24px;
}
.ul-cat-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: 'Pretendard', sans-serif;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: -0.01em;
}
.ul-cat-bar {
  display: inline-block;
  width: 6px;
  height: 18px;
  background: linear-gradient(180deg, #ffb547 0%, #f28a17 100%);
  border-radius: 2px;
  box-shadow: 0 0 12px rgba(255, 181, 71, 0.6);
}
.ul-cat-en {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(255, 181, 71, 0.75);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.ul-cat-more {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #ffb547;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.2s, transform 0.2s;
}
.ul-cat-more:hover {
  opacity: 1;
  transform: translateX(2px);
}
.ul-product-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
.ul-product-card {
  position: relative;
  background: #0e0e0e;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  overflow: hidden;
  transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
}
.ul-product-card:hover {
  border-color: rgba(255, 181, 71, 0.45);
  transform: translateY(-3px);
  box-shadow: 0 8px 24px rgba(255, 181, 71, 0.12);
}
.ul-product-media {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  background: #000;
}
.ul-product-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.4s;
}
.ul-product-card:hover .ul-product-media img {
  transform: scale(1.04);
}
.ul-product-title {
  font-family: 'Pretendard', sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: #d8d8d8;
  padding: 12px 14px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: -0.01em;
}
.ul-product-card:hover .ul-product-title {
  color: #ffb547;
}
.ul-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: #666;
  font-size: 13px;
  padding: 40px 20px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}
@media (max-width: 900px) {
  .ul-product-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .ul-cat-header { flex-wrap: wrap; }
  .ul-cat-more { width: 100%; margin-left: 0; text-align: right; }
}
@media (max-width: 520px) {
  .ul-cat-title { font-size: 18px; }
  .ul-product-title { font-size: 12px; padding: 10px 8px; }
}
`;

/** Categories to show, in display order, matching the screenshot. */
const CATS = [
  { legacyId: 3,  slugEn: "indoor",       ko: "실내용 전광판",  en: "Indoor LED",            take: 4 },
  { legacyId: 4,  slugEn: "outdoor",      ko: "옥외 전광판",    en: "Outdoor billboard",      take: 4 },
  { legacyId: 11, slugEn: "custom",       ko: "주문형 전광판",  en: "On-Demand billboard",    take: 4 },
  { legacyId: 5,  slugEn: "gas",          ko: "주유소 전광판",  en: "Gas Station signage",    take: 4 },
  { legacyId: 6,  slugEn: "fullcolor",    ko: "풀칼라 전광판",  en: "Full color signage",     take: 4 },
  { legacyId: 8,  slugEn: "overhang",     ko: "양면돌출 간판",  en: "Double-sided sign",      take: 4 },
  { legacyId: 9,  slugEn: "ledchannel",   ko: "LED 채널",       en: "LED channel",            take: 4 },
  { legacyId: 10, slugEn: "special",      ko: "특수형 전광판",  en: "Special signage",        take: 4 },
];

let _idCounter = 1000;
function nextId(prefix) {
  return `obj_${prefix}_ulprod_${(_idCounter++).toString(36)}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderCard(shopId, post) {
  const photos = post.photos ? post.photos.split("|").filter(Boolean) : [];
  const first = photos[0] || "";
  const imgUrl = first
    ? `https://home.homenshop.com/${shopId}/thumb/600x400/${encodeURIComponent(first)}`
    : `https://homenshop.com/api/img?q=led%20signage%20korean%20storefront&w=600&h=400`;
  const href = `/${shopId}/ko/board.html?action=read&id=${post.legacyId}`;
  const title = escapeHtml(post.title || "");
  const cardId = nextId("card");
  const imgId = nextId("img");
  const titleId = nextId("title");
  return `
  <div class="dragable de-group ul-product-card" id="${cardId}">
    <a href="${href}" style="text-decoration:none;color:inherit;display:block;">
      <div class="dragable" id="${imgId}">
        <div class="ul-product-media">
          <img src="${imgUrl}" alt="${title}" loading="lazy" />
        </div>
      </div>
      <div class="dragable sol-replacible-text" id="${titleId}">
        <div class="ul-product-title">${title}</div>
      </div>
    </a>
  </div>`;
}

function renderSection(shopId, cat, posts) {
  const secId = nextId("sec");
  const headId = nextId("title");
  const subId = nextId("text");
  const moreId = nextId("btn");
  const gridId = nextId("grid");
  const moreHref = `/${shopId}/ko/board.html?action=list&category=${cat.legacyId}`;
  const cards = posts.map((p) => renderCard(shopId, p)).join("");
  return `
<div class="dragable" id="${secId}">
  <section class="ul-cat-section">
    <div class="ul-cat-header">
      <div class="dragable sol-replacible-text" id="${headId}">
        <h2 class="ul-cat-title"><span class="ul-cat-bar"></span>${escapeHtml(cat.ko)}</h2>
      </div>
      <div class="dragable sol-replacible-text" id="${subId}">
        <span class="ul-cat-en">${escapeHtml(cat.en)}</span>
      </div>
      <div class="dragable" id="${moreId}">
        <a class="ul-cat-more" href="${moreHref}">전체보기 →</a>
      </div>
    </div>
    <div class="dragable" id="${gridId}">
      <div class="ul-product-grid">
        ${cards || `<div class="ul-empty">등록된 납품실적이 없습니다.</div>`}
      </div>
    </div>
  </section>
</div>`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Rebuilding products.html for site=${SITE_ID}`);

  // Keep existing hero from the template; fetch current content first
  const cur = await client.query(
    `SELECT id, content FROM "Page"
      WHERE "siteId" = $1 AND lang = 'ko' AND slug = 'products' LIMIT 1`,
    [SITE_ID],
  );
  if (cur.rowCount === 0) throw new Error("products page not found");
  const pageId = cur.rows[0].id;
  const curContent = cur.rows[0].content;
  const curHtml = typeof curContent === "string"
    ? JSON.parse(curContent).html
    : curContent?.html || "";

  // Extract the hero (first dragable section) from the existing content so
  // we preserve the template's nice typography.
  let hero = "";
  const heroMatch = curHtml.match(/<div class="dragable"[^>]*id="obj_sec_[^"]*"[^>]*>[\s\S]*?<section class="ul-page-hero">[\s\S]*?<\/section>\s*<\/div>/);
  if (heroMatch) {
    hero = heroMatch[0];
    console.log(`  ✓ preserved hero section (${hero.length} chars)`);
  } else {
    console.log(`  ! hero section not found — using fallback`);
    hero = `
<div class="dragable" id="obj_sec_ulprod_hero">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="obj_text_ulprod_eye"><span class="ul-eyebrow-mono">Products · LED 전광판</span></div>
    <div class="dragable sol-replacible-text" id="obj_title_ulprod_h1"><h1>현장에 맞게, <em>정확하게</em> 제작합니다.</h1></div>
    <div class="dragable sol-replacible-text" id="obj_text_ulprod_hp"><p>실내용부터 옥외 대형, 주유소 가격표, 관공서 안내판, 교량 경관조명까지. 피치·밝기·방수등급을 현장 환경에 맞춰 엔지니어링합니다.</p></div>
  </section>
</div>`;
  }

  // Fetch posts per category
  const sections = [];
  for (const cat of CATS) {
    const bc = await client.query(
      `SELECT id FROM "BoardCategory"
        WHERE "siteId"=$1 AND "legacyId"=$2 AND lang='ko' LIMIT 1`,
      [SITE_ID, cat.legacyId],
    );
    if (bc.rowCount === 0) {
      console.log(`  - cat ${cat.legacyId} ${cat.ko}: no category row, skipping`);
      continue;
    }
    const catId = bc.rows[0].id;
    // Prefer posts with photos (screenshot-friendly)
    const posts = await client.query(
      `SELECT "legacyId", title, photos, regdate
         FROM "BoardPost"
        WHERE "siteId"=$1 AND "categoryId"=$2 AND lang='ko'
          AND photos IS NOT NULL AND photos <> ''
        ORDER BY "legacyId" DESC
        LIMIT $3`,
      [SITE_ID, catId, cat.take],
    );
    console.log(`  · ${cat.ko} (cat ${cat.legacyId}): ${posts.rowCount} posts`);
    sections.push(renderSection(SHOP_ID, cat, posts.rows));
  }

  const fullHtml = `${hero}\n${sections.join("\n")}\n`;

  await client.query(
    `UPDATE "Page" SET content = $1::jsonb, "updatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify({ html: fullHtml }), pageId],
  );
  console.log(`\n✓ Updated products page (${fullHtml.length} chars)`);

  /* ─── Append extra CSS to Site.cssText (and Template.cssText) once ─── */
  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id = $1`, [id]);
    if (r.rowCount === 0) {
      console.log(`  - ${table} ${id} not found`);
      continue;
    }
    const cur = r.rows[0].cssText || "";
    if (cur.includes(EXTRA_CSS_MARKER)) {
      console.log(`  · ${table} CSS already contains grid rules — skipped`);
      continue;
    }
    const next = cur + "\n" + EXTRA_CSS.trim() + "\n";
    await client.query(`UPDATE "${table}" SET "cssText" = $1 WHERE id = $2`, [next, id]);
    console.log(`  ✓ ${table} cssText updated: ${cur.length} → ${next.length}`);
  }

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
