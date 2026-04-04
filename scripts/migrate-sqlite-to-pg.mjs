#!/usr/bin/env node
/**
 * Migrate all SQLite data to PostgreSQL using direct pg queries.
 * Usage: cd /var/www/homenshop-next && node scripts/migrate-sqlite-to-pg.mjs
 */

import { execSync } from "child_process";
import pg from "pg";

const LEGACY_DATA_ROOT = "/var/www/legacy-data/userdata";
const SQLITE_HELPER = "/var/www/homenshop-next/scripts/sqlite-query.py";
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://homenshop:HnsApp2026Secure@127.0.0.1:5432/homenshop";

const pool = new pg.Pool({ connectionString: DATABASE_URL });

function sqliteQuery(dbPath, sql) {
  try {
    const result = execSync(`python3 ${SQLITE_HELPER} "${dbPath}"`, {
      timeout: 15000, encoding: "utf-8", input: sql, maxBuffer: 50 * 1024 * 1024,
    });
    if (!result.trim()) return [];
    return JSON.parse(result);
  } catch { return []; }
}

function int(v) { return parseInt(String(v)) || 0; }
function str(v) { return String(v ?? ""); }
function cuid() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

async function migrateSite(client, site) {
  const { shopId, id: siteId } = site;
  const dbPath = `${LEGACY_DATA_ROOT}/${shopId}/db/.sqlite3`;
  try { execSync(`test -f "${dbPath}"`, { timeout: 1000 }); } catch { return null; }

  const stats = { shopId, bc: 0, bp: 0, bpl: 0, p: 0, pc: 0, pp: 0, errs: [] };

  // --- BoardCategory ---
  const catMap = {}; // "legacyId_lang" -> pgId
  try {
    const cats = sqliteQuery(dbPath, "SELECT * FROM BoardCategory ORDER BY id");
    for (const c of cats) {
      const legacyId = int(c.id);
      const lang = str(c.lang) || "ko";
      const name = str(c.category) || `Category ${legacyId}`;
      const id = cuid();
      try {
        const res = await client.query(
          `INSERT INTO "BoardCategory" (id, "siteId", "legacyId", lang, name, "defaultKey", "replyMode", "writeMode", "rowsPerPage", "titleLen", "imgWidth", "imgHeight", "listStyle")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT ("siteId","legacyId",lang) DO UPDATE SET name=EXCLUDED.name
           RETURNING id`,
          [id, siteId, legacyId, lang, name, int(c.defaultkey), int(c.reply), int(c.write), int(c.rows)||20, int(c.title_len)||20, int(c.img_w)||100, int(c.img_h)||96, int(c.list_style)]
        );
        catMap[`${legacyId}_${lang}`] = res.rows[0].id;
        stats.bc++;
      } catch (e) { stats.errs.push(`BC ${legacyId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`BC: ${e.message.slice(0,80)}`); }

  // --- BoardPost ---
  const postMap = {}; // legacyId -> pgId
  try {
    const posts = sqliteQuery(dbPath, "SELECT id, lang, category, title, contents, username, regdate, click, photos, notice, public, parent FROM Board ORDER BY id");

    // Parent posts first
    for (const p of posts) {
      if (int(p.parent) > 0) continue;
      const legacyId = int(p.id);
      const lang = str(p.lang) || "ko";
      const categoryId = catMap[`${int(p.category)}_${lang}`] || catMap[`${int(p.category)}_ko`] || null;
      const id = cuid();
      try {
        const res = await client.query(
          `INSERT INTO "BoardPost" (id, "siteId", "legacyId", lang, "categoryId", title, content, author, photos, views, "isNotice", "isPublic", regdate, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
           ON CONFLICT ("siteId","legacyId") DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content
           RETURNING id`,
          [id, siteId, legacyId, lang, categoryId, str(p.title), str(p.contents), str(p.username), p.photos?str(p.photos):null, int(p.click), int(p.notice)===1, int(p.public)!==0, p.regdate?str(p.regdate).trim():null]
        );
        postMap[legacyId] = res.rows[0].id;
        stats.bp++;
      } catch (e) { stats.errs.push(`BP ${legacyId}: ${e.message.slice(0,80)}`); }
    }

    // Reply posts
    for (const p of posts) {
      const parentLegacyId = int(p.parent);
      if (parentLegacyId <= 0) continue;
      const legacyId = int(p.id);
      const lang = str(p.lang) || "ko";
      const categoryId = catMap[`${int(p.category)}_${lang}`] || catMap[`${int(p.category)}_ko`] || null;
      const parentId = postMap[parentLegacyId] || null;
      const id = cuid();
      try {
        const res = await client.query(
          `INSERT INTO "BoardPost" (id, "siteId", "legacyId", lang, "categoryId", "parentId", title, content, author, photos, views, "isNotice", "isPublic", regdate, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
           ON CONFLICT ("siteId","legacyId") DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, "parentId"=EXCLUDED."parentId"
           RETURNING id`,
          [id, siteId, legacyId, lang, categoryId, parentId, str(p.title), str(p.contents), str(p.username), p.photos?str(p.photos):null, int(p.click), int(p.notice)===1, int(p.public)!==0, p.regdate?str(p.regdate).trim():null]
        );
        postMap[legacyId] = res.rows[0].id;
        stats.bp++;
      } catch (e) { stats.errs.push(`BPr ${legacyId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`BP: ${e.message.slice(0,80)}`); }

  // --- BoardPlugin ---
  try {
    const bplugins = sqliteQuery(dbPath, "SELECT * FROM BoardPlugin");
    for (const bp of bplugins) {
      const page = str(bp.page);
      const divId = str(bp.divid);
      if (!page || !divId) continue;
      const id = cuid();
      try {
        await client.query(
          `INSERT INTO "BoardPlugin" (id, "siteId", page, "divId", "legacyCatId", nums, "titleLen", "dateStyle", "displayStyle", "imgWidth", "imgHeight", "skinFile")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT ("siteId",page,"divId") DO UPDATE SET "legacyCatId"=EXCLUDED."legacyCatId", nums=EXCLUDED.nums`,
          [id, siteId, page, divId, int(bp.category)||null, int(bp.nums)||5, int(bp.titlelen)||20, str(bp.datestyle||"0"), int(bp.displaystyle), int(bp.img_w)||150, int(bp.img_h)||100, bp.skin_file?str(bp.skin_file):null]
        );
        stats.bpl++;
      } catch (e) { stats.errs.push(`BPl ${page}/${divId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`BPl: ${e.message.slice(0,80)}`); }

  // --- ProductCategory ---
  try {
    const pcats = sqliteQuery(dbPath, "SELECT * FROM ProductCategory ORDER BY id");
    for (const c of pcats) {
      const legacyId = int(c.id);
      const lang = str(c.lang) || "ko";
      const name = str(c.category) || `Category ${legacyId}`;
      const id = cuid();
      try {
        await client.query(
          `INSERT INTO "ProductCategory" (id, "siteId", "legacyId", lang, name, "defaultKey", "parentLegacyId", depth, "listStyle", rows, "imgWidth", "imgHeight", "titleLen", "textLen")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT ("siteId","legacyId",lang) DO UPDATE SET name=EXCLUDED.name`,
          [id, siteId, legacyId, lang, name, int(c.defaultkey), int(c.parent)||null, int(c.depth), int(c.liststyle), int(c.rows)||9, int(c.img_w)||80, int(c.img_h)||80, int(c.titlelen)||30, int(c.textlen)]
        );
        stats.pc++;
      } catch (e) { stats.errs.push(`PC ${legacyId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`PC: ${e.message.slice(0,80)}`); }

  // --- Product (upsert by siteId + legacyId) ---
  try {
    const products = sqliteQuery(dbPath, "SELECT id, lang, pname, contents, price, category, photos, specification FROM Product ORDER BY id");
    for (const p of products) {
      const legacyId = int(p.id);
      if (!legacyId) continue;
      const lang = str(p.lang) || "ko";
      const name = str(p.pname) || `Product ${legacyId}`;
      const id = cuid();
      try {
        await client.query(
          `INSERT INTO "Product" (id, "siteId", "legacyId", lang, name, description, price, category, photos, specification, "createdAt", "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
           ON CONFLICT ("siteId","legacyId") DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, photos=EXCLUDED.photos, specification=EXCLUDED.specification, lang=EXCLUDED.lang`,
          [id, siteId, legacyId, lang, name, p.contents?str(p.contents):null, int(p.price), p.category?str(p.category):null, p.photos?str(p.photos):null, p.specification?str(p.specification):null]
        );
        stats.p++;
      } catch (e) { stats.errs.push(`P ${legacyId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`P: ${e.message.slice(0,80)}`); }

  // --- ProductPlugin ---
  try {
    const pplugs = sqliteQuery(dbPath, "SELECT * FROM ProductPlugin");
    for (const pp of pplugs) {
      const lang = str(pp.lang) || "ko";
      const page = str(pp.page);
      const divId = str(pp.divid);
      if (!page || !divId) continue;
      const id = cuid();
      try {
        await client.query(
          `INSERT INTO "ProductPlugin" (id, "siteId", lang, page, "divId", "legacyCatId", nums, "titleLen", "imgWidth", "imgHeight", "skinFile")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT ("siteId",lang,page,"divId") DO UPDATE SET "legacyCatId"=EXCLUDED."legacyCatId", nums=EXCLUDED.nums`,
          [id, siteId, lang, page, divId, int(pp.category)||null, int(pp.nums)||7, int(pp.titlelen)||38, int(pp.img_w)||128, int(pp.img_h)||125, pp.skin_file?str(pp.skin_file):null]
        );
        stats.pp++;
      } catch (e) { stats.errs.push(`PP ${page}/${divId}: ${e.message.slice(0,80)}`); }
    }
  } catch (e) { stats.errs.push(`PP: ${e.message.slice(0,80)}`); }

  return stats;
}

async function main() {
  console.log("=== SQLite → PostgreSQL Migration ===");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const client = await pool.connect();

  // Get all sites
  const { rows: sites } = await client.query('SELECT id, "shopId" FROM "Site"');
  console.log(`Found ${sites.length} sites\n`);

  const totals = { bc: 0, bp: 0, bpl: 0, p: 0, pc: 0, pp: 0, errs: 0, migrated: 0, skipped: 0 };

  for (const site of sites) {
    const result = await migrateSite(client, site);
    if (!result) { totals.skipped++; continue; }

    totals.migrated++;
    totals.bc += result.bc;
    totals.bp += result.bp;
    totals.bpl += result.bpl;
    totals.p += result.p;
    totals.pc += result.pc;
    totals.pp += result.pp;

    const hasData = result.bp + result.p + result.bpl + result.pp > 0;
    if (hasData) {
      console.log(`  ${result.shopId}: BC=${result.bc} BP=${result.bp} BPl=${result.bpl} P=${result.p} PC=${result.pc} PP=${result.pp}${result.errs.length ? ` (${result.errs.length} errs)` : ""}`);
    }
    if (result.errs.length > 0) {
      totals.errs += result.errs.length;
      for (const e of result.errs.slice(0, 2)) console.log(`    ERR: ${e}`);
      if (result.errs.length > 2) console.log(`    ... +${result.errs.length - 2} more`);
    }
  }

  client.release();
  await pool.end();

  console.log(`\n=== Migration Complete ===`);
  console.log(`Sites: ${totals.migrated} migrated, ${totals.skipped} skipped`);
  console.log(`BoardCategories: ${totals.bc}`);
  console.log(`BoardPosts: ${totals.bp}`);
  console.log(`BoardPlugins: ${totals.bpl}`);
  console.log(`Products: ${totals.p}`);
  console.log(`ProductCategories: ${totals.pc}`);
  console.log(`ProductPlugins: ${totals.pp}`);
  console.log(`Errors: ${totals.errs}`);
  console.log(`Done at: ${new Date().toISOString()}`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
