#!/usr/bin/env node
/**
 * Migrate 3 LED-spec pages from xunion5 → unionled:
 *   · whatisled     (LED란 무엇인가 — main spec hub)
 *   · outdoor_spec  (옥외 전광판 규격)
 *   · indoor_spec   (실내 전광판 규격)
 *
 * Each page contains rich HTML (images, tables, tech specs) served from
 * /xunion5/uploaded/files/*.jpg. Since unionled/uploaded is a symlink to
 * xunion5/uploaded, rewriting the URL prefix is optional — we do it anyway
 * to keep the new site self-referential.
 *
 * The dark UNION LED theme would make the legacy text invisible (the
 * content uses `color:#333`), so we wrap the migrated HTML in a
 * `.ul-spec-content` light-card wrapper + add a sidebar nav linking the
 * 3 spec pages to each other.
 *
 * Also updates the footer "전광판 규격" links to point to the new pages.
 *
 * Idempotent: re-running upserts (matched by siteId + slug + lang).
 */

import pg from "pg";
const { Client } = pg;

const SRC_SITE_ID = "cmmq7zt11259f5d34630c1335"; // xunion5
const DST_SITE_ID = "cmoavtq8x001taa67vlpq1agk"; // unionled
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

const PAGES = [
  { slug: "whatisled",    title: "LED란 무엇인가",    menuTitle: "LED란",        sortOrder: 20 },
  { slug: "outdoor_spec", title: "옥외 전광판 규격",  menuTitle: "옥외 규격",    sortOrder: 21 },
  { slug: "indoor_spec",  title: "실내 전광판 규격",  menuTitle: "실내 규격",    sortOrder: 22 },
];

function cuid() {
  return "cm" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-6);
}

function rewriteImgUrls(html) {
  // xunion5/uploaded → unionled/uploaded (symlink backs it either way, but
  // keep content self-referential)
  return html
    .replace(/home\.homenshop\.com\/xunion5\/uploaded/g, "home.homenshop.com/unionled/uploaded")
    .replace(/home\.homenshop\.com\/xunion5\/thumb/g, "home.homenshop.com/unionled/thumb");
}

function buildSidebarNav(currentSlug) {
  const items = PAGES.map((p) => {
    const active = p.slug === currentSlug;
    return `<li${active ? ' class="active"' : ""}><a href="${p.slug}.html">${p.title}</a></li>`;
  }).join("");
  return `
<aside class="ul-spec-sidebar">
  <div class="ul-spec-sidebar-head">
    <span class="ul-spec-eyebrow">SPECS</span>
    <h3>전광판 규격</h3>
  </div>
  <ul>${items}</ul>
</aside>`;
}

function wrapWithChrome(slug, title, legacyHtml) {
  const sidebar = buildSidebarNav(slug);
  const body = rewriteImgUrls(legacyHtml);
  // Atomic-layered dragable wrapper so the content is editable in the
  // design editor, following the template's conventions.
  const objId = `obj_sec_spec_${slug.replace(/[^a-z0-9]/gi, "").slice(0, 12)}`;
  return `
<div class="dragable" id="${objId}">
  <section class="ul-spec-page">
    <div class="ul-spec-layout">
      ${sidebar}
      <article class="ul-spec-content">
        <header class="ul-spec-content-head">
          <span class="ul-spec-eyebrow">${title === "LED란 무엇인가" ? "Intro" : title.includes("옥외") ? "Outdoor" : "Indoor"}</span>
          <h1>${title}</h1>
        </header>
        <div class="ul-spec-body">
          ${body}
        </div>
      </article>
    </div>
  </section>
</div>`;
}

const EXTRA_CSS_MARKER = "/* HNS-UNIONLED-SPEC-PAGES */";
const EXTRA_CSS = `
${EXTRA_CSS_MARKER}
.ul-spec-page {
  max-width: 1240px;
  margin: 40px auto;
  padding: 0 24px;
}
.ul-spec-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 32px;
  align-items: start;
}
.ul-spec-sidebar {
  position: sticky;
  top: 80px;
  background: rgba(255, 181, 71, 0.04);
  border: 1px solid rgba(255, 181, 71, 0.15);
  border-radius: 10px;
  padding: 20px 0;
}
.ul-spec-sidebar-head {
  padding: 0 20px 16px;
  border-bottom: 1px solid rgba(255, 181, 71, 0.15);
  margin-bottom: 12px;
}
.ul-spec-eyebrow {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #ffb547;
  letter-spacing: 0.12em;
  margin-bottom: 6px;
}
.ul-spec-sidebar-head h3 {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  letter-spacing: -0.01em;
}
.ul-spec-sidebar ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ul-spec-sidebar li { margin: 0; }
.ul-spec-sidebar li a {
  display: block;
  padding: 10px 20px;
  font-size: 13px;
  color: #bbb;
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}
.ul-spec-sidebar li a:hover {
  color: #ffb547;
  background: rgba(255, 181, 71, 0.06);
}
.ul-spec-sidebar li.active a {
  color: #ffb547;
  border-left-color: #ffb547;
  background: rgba(255, 181, 71, 0.1);
  font-weight: 600;
}
.ul-spec-content {
  background: #fafafa;
  color: #222;
  padding: 40px 48px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  line-height: 1.8;
  overflow-x: auto;
}
.ul-spec-content-head {
  padding-bottom: 20px;
  border-bottom: 2px solid rgba(255, 181, 71, 0.6);
  margin-bottom: 32px;
}
.ul-spec-content-head .ul-spec-eyebrow {
  color: #c88a0f;
}
.ul-spec-content-head h1 {
  font-family: 'Pretendard', sans-serif;
  font-size: 32px;
  font-weight: 800;
  color: #1a1a1a;
  margin: 0;
  letter-spacing: -0.02em;
}
.ul-spec-body { color: #333; }
.ul-spec-body p,
.ul-spec-body div,
.ul-spec-body td,
.ul-spec-body span { color: inherit; }
.ul-spec-body img {
  max-width: 100%;
  height: auto !important;
  border-radius: 4px;
}
.ul-spec-body table {
  max-width: 100%;
  margin: 16px 0;
}
.ul-spec-body strong,
.ul-spec-body b { color: #1a1a1a; }
.ul-spec-body #subbg { text-align: center; margin-bottom: 24px; }
.ul-spec-body #subbg img {
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
@media (max-width: 900px) {
  .ul-spec-layout { grid-template-columns: 1fr; }
  .ul-spec-sidebar { position: static; }
  .ul-spec-content { padding: 24px 20px; }
  .ul-spec-content-head h1 { font-size: 24px; }
}
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* ── Copy each page ── */
  for (const cfg of PAGES) {
    const src = await client.query(
      `SELECT content FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug=$2`,
      [SRC_SITE_ID, cfg.slug],
    );
    if (src.rowCount === 0) {
      console.log(`  ! source page ${cfg.slug} not found, skipping`);
      continue;
    }
    const srcHtml = src.rows[0].content?.html || "";
    const wrapped = wrapWithChrome(cfg.slug, cfg.title, srcHtml);
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
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, false, NOW(), NOW(),
                 'ko', 0, 'page', false, $7)`,
        [cuid(), DST_SITE_ID, cfg.title, cfg.slug, contentJson,
         cfg.sortOrder, cfg.menuTitle],
      );
      console.log(`  + ${cfg.slug} (inserted, ${wrapped.length} chars)`);
    }
  }

  /* ── Update footer: "전광판 규격" link + add sub-items ── */
  const siteRow = await client.query(
    `SELECT "footerHtml" FROM "Site" WHERE id = $1`,
    [DST_SITE_ID],
  );
  let footer = siteRow.rows[0].footerHtml;
  // Replace the "전광판 규격" placeholder line with functional spec links
  footer = footer.replace(
    /<li><a href="products\.html">전광판 규격<\/a><\/li>/,
    `<li><a href="whatisled.html">전광판 규격 · LED란</a></li>
        <li><a href="outdoor_spec.html">└ 옥외 규격</a></li>
        <li><a href="indoor_spec.html">└ 실내 규격</a></li>`,
  );
  // Persist to Site, SiteHmf (per-lang), and Template
  await client.query(`UPDATE "Site" SET "footerHtml"=$1 WHERE id=$2`, [footer, DST_SITE_ID]);
  await client.query(
    `UPDATE "SiteHmf" SET "footerHtml"=$1 WHERE "siteId"=$2`,
    [footer, DST_SITE_ID],
  );
  await client.query(`UPDATE "Template" SET "footerHtml"=$1 WHERE id=$2`, [footer, TEMPLATE_ID]);
  console.log(`\n  ✓ Footer updated on Site + SiteHmf + Template`);

  /* ── CSS additions (once, marker-guarded) ── */
  for (const [table, id] of [["Site", DST_SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    const cur = r.rows[0].cssText || "";
    if (cur.includes(EXTRA_CSS_MARKER)) {
      console.log(`  · ${table} CSS already has spec rules`);
      continue;
    }
    const next = cur + "\n" + EXTRA_CSS.trim() + "\n";
    await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [next, id]);
    console.log(`  ✓ ${table} cssText: ${cur.length} → ${next.length}`);
  }

  await client.end();
  console.log(`\n✓ done. Verify:`);
  PAGES.forEach((p) =>
    console.log(`  https://home.homenshop.com/unionled/ko/${p.slug}.html`),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
