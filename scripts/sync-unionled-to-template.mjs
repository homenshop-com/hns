#!/usr/bin/env node
/**
 * Manual sync: unionled Site → UNION LED 프리미엄 다크 Template.
 *
 * Why manual (not via lib/template-sync.ts):
 *   syncTemplateFromSite() requires Template.demoSiteId → a storage-site
 *   with isTemplateStorage=true. unionled is a regular published site
 *   (not a storage site), so the auto-sync hook never fires. This script
 *   does the same work but pulls from the unionled Site directly.
 *
 * What gets synced:
 *   Site.cssText                       → Template.cssText
 *   SiteHmf(ko).{header,menu,footer}   → Template.{header,menu,footer}Html
 *     (falls back to Site.* when SiteHmf lacks the lang row)
 *   Site.pages (all ko)                → Template.pagesSnapshot JSON
 *
 * Idempotent. After this runs, any new site created from the template
 * will include all 11 ko pages with current content:
 *   index · products · cases · about · contact
 *   portfolio · about-history · map
 *   whatisled · outdoor_spec · indoor_spec
 *
 * Run:
 *   DATABASE_URL="..." node scripts/sync-unionled-to-template.mjs
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* Fetch site-level HMF + CSS */
  const site = await client.query(
    `SELECT "defaultLanguage", "headerHtml", "menuHtml", "footerHtml", "cssText"
       FROM "Site" WHERE id = $1`,
    [SITE_ID],
  );
  if (site.rowCount === 0) throw new Error("unionled site not found");
  const s = site.rows[0];
  const lang = s.defaultLanguage || "ko";

  const hmf = await client.query(
    `SELECT "headerHtml", "menuHtml", "footerHtml" FROM "SiteHmf"
      WHERE "siteId" = $1 AND lang = $2 LIMIT 1`,
    [SITE_ID, lang],
  );
  const h = hmf.rows[0] || {};

  const headerHtml = h.headerHtml ?? s.headerHtml ?? null;
  const menuHtml   = h.menuHtml   ?? s.menuHtml   ?? null;
  const footerHtml = h.footerHtml ?? s.footerHtml ?? null;

  /* Fetch all ko pages (including SEO fields so new sites inherit
   * the SEO copy as starting defaults). */
  const pages = await client.query(
    `SELECT slug, title, lang, "isHome", "showInMenu", "sortOrder", content, css,
            "seoTitle", "seoDescription", "seoKeywords", "ogImage"
       FROM "Page"
      WHERE "siteId" = $1
      ORDER BY "sortOrder" ASC NULLS LAST, slug ASC`,
    [SITE_ID],
  );

  const pagesSnapshot = pages.rows.map((p) => ({
    slug: p.slug,
    title: p.title,
    lang: p.lang,
    isHome: p.isHome,
    showInMenu: p.showInMenu,
    sortOrder: p.sortOrder,
    content: p.content,
    css: p.css ?? null,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    seoKeywords: p.seoKeywords ?? null,
    ogImage: p.ogImage ?? null,
  }));

  console.log(`=== unionled Site snapshot ===`);
  console.log(`  header      : ${headerHtml?.length ?? 0} chars`);
  console.log(`  menu        : ${menuHtml?.length ?? 0} chars`);
  console.log(`  footer      : ${footerHtml?.length ?? 0} chars`);
  console.log(`  cssText     : ${s.cssText?.length ?? 0} chars`);
  console.log(`  pages (${pagesSnapshot.length}):`);
  pagesSnapshot.forEach((p) => {
    const clen = p.content ? JSON.stringify(p.content).length : 0;
    console.log(`    · [${p.lang}] ${p.slug.padEnd(20)} ${clen.toString().padStart(6)} chars${p.isHome ? " [home]" : ""}${p.showInMenu ? " [menu]" : ""}`);
  });

  /* Get template before */
  const before = await client.query(
    `SELECT LENGTH("headerHtml") hl, LENGTH("menuHtml") ml,
            LENGTH("footerHtml") fl, LENGTH("cssText") cl,
            jsonb_array_length("pagesSnapshot"::jsonb) pages
       FROM "Template" WHERE id = $1`,
    [TEMPLATE_ID],
  );
  console.log(`\n=== Template BEFORE ===`);
  console.log(`  `, before.rows[0]);

  /* Update */
  await client.query(
    `UPDATE "Template"
        SET "headerHtml" = $1,
            "menuHtml"   = $2,
            "footerHtml" = $3,
            "cssText"    = $4,
            "pagesSnapshot" = $5::jsonb,
            "updatedAt"  = NOW()
      WHERE id = $6`,
    [headerHtml, menuHtml, footerHtml, s.cssText, JSON.stringify(pagesSnapshot), TEMPLATE_ID],
  );

  const after = await client.query(
    `SELECT LENGTH("headerHtml") hl, LENGTH("menuHtml") ml,
            LENGTH("footerHtml") fl, LENGTH("cssText") cl,
            jsonb_array_length("pagesSnapshot"::jsonb) pages,
            "updatedAt"
       FROM "Template" WHERE id = $1`,
    [TEMPLATE_ID],
  );
  console.log(`\n=== Template AFTER ===`);
  console.log(`  `, after.rows[0]);
  console.log(`\n✓ Template synced. New sites created from "UNION LED 프리미엄 다크"`);
  console.log(`  will now include all ${pagesSnapshot.length} ko pages with current content.`);

  await client.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
