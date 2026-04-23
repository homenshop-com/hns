#!/usr/bin/env node
/**
 * Rebuild unionled top navigation to match legacy xunion5 menu structure,
 * and migrate the missing content pages the menu points to.
 *
 * Legacy xunion5 top menu (from user screenshot + Site.hmf):
 *   HOME
 *   회사소개  ▾ (회사소개 / 연혁 / 오시는길)
 *   납품실적
 *   LED 전광판  ▾ (실내/옥외/주유소/풀컬러/양면돌출/LED채널)
 *   특수형 현황판
 *   설치사례/주문형
 *   전광판 규격  ▾ (LED란 / 옥외 규격 / 실내 규격)
 *   가격표(블로그) ↗   external → blog.naver.com/jgcheon
 *   고객지원센터 ▾ (견적문의 / 공지사항 / 자료실)
 *
 * Pages migrated from xunion5 (content was already in xunion5 DB):
 *   · portfolio       (납품실적, 14KB — the main ask from the user)
 *   · about-history   (연혁)
 *   · map             (오시는길)
 *
 * Pages that already exist in unionled:
 *   · index, about, products, cases, contact   (from the template)
 *   · whatisled, outdoor_spec, indoor_spec     (migrated in previous step)
 *
 * LED sub-items link to the already-working gallery board lists
 * (board.html?action=list&category=N) — no need to migrate the individual
 * product pages since the galleries already show the same data.
 *
 * Run:
 *   DATABASE_URL="..." node scripts/rebuild-unionled-header-menu.mjs
 */

import pg from "pg";
const { Client } = pg;

const SRC_SITE_ID = "cmmq7zt11259f5d34630c1335"; // xunion5
const DST_SITE_ID = "cmoavtq8x001taa67vlpq1agk"; // unionled
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

/** Pages to migrate from xunion5 → unionled (content already exists there). */
const MIGRATE_PAGES = [
  {
    slug: "portfolio",
    title: "납품실적",
    menuTitle: "납품실적",
    sortOrder: 10,
    eyebrow: "Portfolio",
  },
  {
    slug: "about-history",
    title: "연혁",
    menuTitle: "연혁",
    sortOrder: 11,
    eyebrow: "History",
  },
  {
    slug: "map",
    title: "오시는길",
    menuTitle: "오시는길",
    sortOrder: 12,
    eyebrow: "Location",
  },
];

function cuid() {
  return "cm" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-6);
}

function rewriteImgUrls(html) {
  return html
    .replace(/home\.homenshop\.com\/xunion5\/uploaded/g, "home.homenshop.com/unionled/uploaded")
    .replace(/home\.homenshop\.com\/xunion5\/thumb/g, "home.homenshop.com/unionled/thumb");
}

function wrapLegacyContent(slug, title, eyebrow, legacyHtml) {
  const body = rewriteImgUrls(legacyHtml);
  const objId = `obj_sec_mig_${slug.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
  return `
<div class="dragable" id="${objId}">
  <section class="ul-legacy-page">
    <header class="ul-legacy-head">
      <span class="ul-legacy-eyebrow">${eyebrow}</span>
      <h1>${title}</h1>
    </header>
    <div class="ul-legacy-card">
      <div class="ul-legacy-body">
        ${body}
      </div>
    </div>
  </section>
</div>`;
}

/* ────────────────────────────────────────────────────────────────
 * Header HTML with dropdowns
 * ──────────────────────────────────────────────────────────────── */

const NEW_HEADER = `<div class="ul-ticker">
  <div class="ul-ticker-track">
    <span><i class="ul-ticker-dot"></i>전국 납품 · 시공 문의 031-883-1017</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-green);box-shadow:0 0 8px var(--led-green);"></i>SINCE 2001 · 25년 LED 전광판 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-red);box-shadow:0 0 8px var(--led-red);"></i>교회 · 학교 · 관공서 납품 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-blue);box-shadow:0 0 8px var(--led-blue);"></i>실내 / 옥외 / 주문형 전광판 설계 제작</span>
    <span><i class="ul-ticker-dot"></i>전국 납품 · 시공 문의 031-883-1017</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-green);box-shadow:0 0 8px var(--led-green);"></i>SINCE 2001 · 25년 LED 전광판 전문</span>
  </div>
</div>

<header class="ul-header">
  <div class="ul-header-inner">
    <a href="index.html" class="ul-logo">
      <div class="ul-logo-mark"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="ul-logo-text">
        <span class="ko">유니온엘이디</span>
        <span class="en">UNION LED</span>
      </div>
    </a>
    <nav class="ul-nav" aria-label="주 메뉴">
      <div class="ul-nav-item"><a href="index.html">HOME</a></div>

      <div class="ul-nav-item has-sub">
        <a href="about.html">회사소개</a>
        <div class="ul-subnav">
          <a href="about.html">회사소개</a>
          <a href="about-history.html">연혁</a>
          <a href="map.html">오시는길</a>
        </div>
      </div>

      <div class="ul-nav-item"><a href="portfolio.html">납품실적</a></div>

      <div class="ul-nav-item has-sub">
        <a href="products.html">LED 전광판</a>
        <div class="ul-subnav">
          <a href="board.html?action=list&amp;category=3">실내용 전광판</a>
          <a href="board.html?action=list&amp;category=4">옥외 전광판</a>
          <a href="board.html?action=list&amp;category=5">주유소 전광판</a>
          <a href="board.html?action=list&amp;category=6">풀컬러 전광판</a>
          <a href="board.html?action=list&amp;category=8">양면돌출 간판</a>
          <a href="board.html?action=list&amp;category=9">LED 채널</a>
        </div>
      </div>

      <div class="ul-nav-item"><a href="board.html?action=list&amp;category=10">특수형 현황판</a></div>

      <div class="ul-nav-item"><a href="board.html?action=list&amp;category=11">설치사례/주문형</a></div>

      <div class="ul-nav-item has-sub">
        <a href="whatisled.html">전광판 규격</a>
        <div class="ul-subnav">
          <a href="whatisled.html">LED란</a>
          <a href="outdoor_spec.html">옥외 규격</a>
          <a href="indoor_spec.html">실내 규격</a>
        </div>
      </div>

      <div class="ul-nav-item">
        <a href="https://blog.naver.com/jgcheon" target="_blank" rel="noopener">가격표(블로그)<span class="ul-nav-ext">↗</span></a>
      </div>

      <div class="ul-nav-item has-sub">
        <a href="contact.html">고객지원센터</a>
        <div class="ul-subnav">
          <a href="contact.html">견적문의</a>
          <a href="board.html?action=list&amp;category=1">공지사항</a>
          <a href="board.html?action=list&amp;category=13">자료실</a>
        </div>
      </div>
    </nav>
    <a href="tel:031-883-1017" class="ul-phone-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      031-883-1017
    </a>
  </div>
</header>`;

const EXTRA_CSS_MARKER = "/* HNS-UNIONLED-NAV-DROPDOWN */";
const EXTRA_CSS = `
${EXTRA_CSS_MARKER}
.ul-nav { display: flex; align-items: center; gap: 0; flex-wrap: wrap; }
.ul-nav-item { position: relative; }
.ul-nav-item > a {
  display: inline-flex;
  align-items: center;
  padding: 18px 14px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  letter-spacing: -0.01em;
  white-space: nowrap;
  transition: color 0.2s;
}
.ul-nav-item > a:hover,
.ul-nav-item.active > a,
.ul-nav-item > a.active { color: #ffb547; }
.ul-nav-item.has-sub > a::after {
  content: " ▾";
  font-size: 9px;
  opacity: 0.55;
  margin-left: 4px;
  transition: transform 0.2s, opacity 0.2s;
}
.ul-nav-item.has-sub:hover > a::after { opacity: 1; transform: rotate(180deg); }
.ul-nav-ext {
  font-size: 10px;
  opacity: 0.6;
  margin-left: 3px;
  transition: transform 0.2s, opacity 0.2s;
  display: inline-block;
}
.ul-nav-item > a:hover .ul-nav-ext {
  transform: translate(2px, -2px);
  opacity: 1;
}

/* Dropdown panel */
.ul-subnav {
  display: none;
  position: absolute;
  top: calc(100% - 4px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 180px;
  background: #141414;
  border: 1px solid rgba(255, 181, 71, 0.25);
  border-radius: 10px;
  padding: 8px 0;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 0, 0, 0.2);
  z-index: 100;
}
.ul-nav-item.has-sub:hover .ul-subnav,
.ul-nav-item.has-sub:focus-within .ul-subnav { display: block; }
.ul-subnav::before {
  content: "";
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: #141414;
  border-top: 1px solid rgba(255, 181, 71, 0.25);
  border-left: 1px solid rgba(255, 181, 71, 0.25);
}
.ul-subnav a {
  display: block;
  padding: 10px 18px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
  white-space: nowrap;
  letter-spacing: -0.01em;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}
.ul-subnav a:hover {
  color: #ffb547;
  background: rgba(255, 181, 71, 0.08);
  border-left-color: #ffb547;
  padding-left: 20px;
}

/* Responsive tighten — 9 items is a lot */
@media (max-width: 1300px) {
  .ul-nav-item > a { padding: 18px 10px; font-size: 13px; }
}
@media (max-width: 1100px) {
  .ul-header-inner { flex-wrap: wrap; }
  .ul-nav { order: 3; width: 100%; justify-content: center; border-top: 1px solid rgba(255,255,255,0.06); }
  .ul-nav-item > a { padding: 14px 10px; font-size: 13px; }
}
@media (max-width: 700px) {
  .ul-nav { overflow-x: auto; flex-wrap: nowrap; justify-content: flex-start; padding: 0 8px; }
  .ul-nav::-webkit-scrollbar { height: 0; }
  .ul-nav-item.has-sub .ul-subnav {
    position: static;
    transform: none;
    min-width: 0;
    display: none;
    border: none;
    background: transparent;
    box-shadow: none;
    padding: 0;
  }
  .ul-nav-item.has-sub:hover .ul-subnav { display: none; }
}

/* Legacy migrated pages — same light-card treatment as spec pages */
.ul-legacy-page {
  max-width: 1080px;
  margin: 40px auto;
  padding: 0 24px;
}
.ul-legacy-head {
  text-align: center;
  margin-bottom: 32px;
}
.ul-legacy-eyebrow {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #ffb547;
  letter-spacing: 0.14em;
  margin-bottom: 10px;
}
.ul-legacy-head h1 {
  font-family: 'Pretendard', sans-serif;
  font-size: 34px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  letter-spacing: -0.02em;
}
.ul-legacy-head h1::after {
  content: "";
  display: block;
  width: 48px;
  height: 3px;
  background: linear-gradient(90deg, #ffb547, #f28a17);
  margin: 16px auto 0;
  border-radius: 2px;
}
.ul-legacy-card {
  background: #fafafa;
  color: #222;
  padding: 40px 48px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}
.ul-legacy-body { color: #333; line-height: 1.8; font-size: 14px; }
.ul-legacy-body p,
.ul-legacy-body div,
.ul-legacy-body td,
.ul-legacy-body span { color: inherit; }
.ul-legacy-body img { max-width: 100%; height: auto !important; border-radius: 4px; }
.ul-legacy-body table { max-width: 100%; margin: 16px 0; }
.ul-legacy-body strong,
.ul-legacy-body b { color: #1a1a1a; }
.ul-legacy-body #subbg { display: none; /* hide legacy banner; we have our own hero */ }
.ul-legacy-body #newsidemenu,
.ul-legacy-body #cntheaderimg,
.ul-legacy-body #cntheader,
.ul-legacy-body #sub_img1 { display: none; /* hide legacy chrome; we have our own */ }
.ul-legacy-body #wowaspfoot_line,
.ul-legacy-body #wowaspfoot_logo { display: none; }
@media (max-width: 640px) {
  .ul-legacy-card { padding: 24px 20px; }
  .ul-legacy-head h1 { font-size: 24px; }
}
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* ── Migrate the 3 pages ── */
  console.log("=== Migrating pages ===");
  for (const cfg of MIGRATE_PAGES) {
    const src = await client.query(
      `SELECT content FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug=$2`,
      [SRC_SITE_ID, cfg.slug],
    );
    if (src.rowCount === 0) {
      console.log(`  ! source ${cfg.slug} not found, skipping`);
      continue;
    }
    const srcHtml = src.rows[0].content?.html || "";
    const wrapped = wrapLegacyContent(cfg.slug, cfg.title, cfg.eyebrow, srcHtml);
    const contentJson = JSON.stringify({ html: wrapped });

    const existing = await client.query(
      `SELECT id FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug=$2 LIMIT 1`,
      [DST_SITE_ID, cfg.slug],
    );
    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE "Page"
         SET content=$1::jsonb, title=$2, "menuTitle"=$3, "sortOrder"=$4,
             "showInMenu"=false, "updatedAt"=NOW()
         WHERE id=$5`,
        [contentJson, cfg.title, cfg.menuTitle, cfg.sortOrder, existing.rows[0].id],
      );
      console.log(`  ~ ${cfg.slug} (updated, ${wrapped.length} chars)`);
    } else {
      await client.query(
        `INSERT INTO "Page"
         (id, "siteId", title, slug, content, "sortOrder", "isHome",
          "createdAt", "updatedAt", lang, depth, "menuType", "showInMenu",
          "menuTitle")
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,false,NOW(),NOW(),'ko',0,'page',false,$7)`,
        [cuid(), DST_SITE_ID, cfg.title, cfg.slug, contentJson,
         cfg.sortOrder, cfg.menuTitle],
      );
      console.log(`  + ${cfg.slug} (inserted, ${wrapped.length} chars)`);
    }
  }

  /* ── Replace headerHtml on Site + SiteHmf + Template ── */
  console.log("\n=== Header update ===");
  for (const [table, id] of [["Site", DST_SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "headerHtml", "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    const oldH = r.rows[0].headerHtml || "";
    await client.query(`UPDATE "${table}" SET "headerHtml"=$1 WHERE id=$2`, [NEW_HEADER, id]);
    console.log(`  ✓ ${table}.headerHtml: ${oldH.length} → ${NEW_HEADER.length}`);
    const oldCss = r.rows[0].cssText || "";
    if (!oldCss.includes(EXTRA_CSS_MARKER)) {
      const nextCss = oldCss + "\n" + EXTRA_CSS.trim() + "\n";
      await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [nextCss, id]);
      console.log(`  ✓ ${table}.cssText : ${oldCss.length} → ${nextCss.length}`);
    } else {
      console.log(`  · ${table}.cssText already has dropdown rules`);
    }
  }
  const hmf = await client.query(`SELECT id, lang FROM "SiteHmf" WHERE "siteId"=$1`, [DST_SITE_ID]);
  for (const h of hmf.rows) {
    await client.query(`UPDATE "SiteHmf" SET "headerHtml"=$1 WHERE id=$2`, [NEW_HEADER, h.id]);
    console.log(`  ✓ SiteHmf(${h.lang}).headerHtml replaced`);
  }

  await client.end();
  console.log(`\n✓ done. Verify:`);
  console.log(`  https://home.homenshop.com/unionled/ko/  (check top menu dropdowns)`);
  console.log(`  https://home.homenshop.com/unionled/ko/portfolio.html`);
  console.log(`  https://home.homenshop.com/unionled/ko/about-history.html`);
  console.log(`  https://home.homenshop.com/unionled/ko/map.html`);
}

main().catch((e) => { console.error(e); process.exit(1); });
