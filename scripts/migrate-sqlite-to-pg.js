#!/usr/bin/env node
/**
 * Migrate all SQLite data (Board, BoardCategory, BoardPlugin, Product,
 * ProductCategory, ProductPlugin) from per-site SQLite DBs to PostgreSQL.
 *
 * Usage: NODE_PATH=node_modules node scripts/migrate-sqlite-to-pg.js
 * Run on server: cd /var/www/homenshop-next && NODE_PATH=node_modules node scripts/migrate-sqlite-to-pg.js
 */

const { execSync } = require("child_process");
const { PrismaClient } = require("./src/generated/prisma");

const prisma = new PrismaClient();
const LEGACY_DATA_ROOT = "/var/www/legacy-data/userdata";
const SQLITE_HELPER = "/var/www/homenshop-next/scripts/sqlite-query.py";

function sqliteQuery(dbPath, sql) {
  try {
    const result = execSync(`python3 ${SQLITE_HELPER} "${dbPath}"`, {
      timeout: 10000,
      encoding: "utf-8",
      input: sql,
      maxBuffer: 50 * 1024 * 1024,
    });
    if (!result.trim()) return [];
    return JSON.parse(result);
  } catch (e) {
    return [];
  }
}

function int(v) {
  return parseInt(String(v)) || 0;
}

async function migrateSite(site) {
  const shopId = site.shopId;
  const siteId = site.id;
  const dbPath = `${LEGACY_DATA_ROOT}/${shopId}/db/.sqlite3`;

  try {
    execSync(`test -f "${dbPath}"`, { timeout: 1000 });
  } catch {
    return { shopId, skipped: true, reason: "no sqlite db" };
  }

  const stats = { shopId, boardCats: 0, boardPosts: 0, boardPlugins: 0, products: 0, productCats: 0, productPlugins: 0, errors: [] };

  // --- BoardCategory ---
  try {
    const cats = sqliteQuery(dbPath, "SELECT * FROM BoardCategory ORDER BY id");
    const catMap = {}; // legacyId -> pgId
    for (const c of cats) {
      const legacyId = int(c.id);
      const lang = String(c.lang || "ko");
      const name = String(c.category || `Category ${legacyId}`);
      try {
        const rec = await prisma.boardCategory.upsert({
          where: { siteId_legacyId_lang: { siteId, legacyId, lang } },
          update: { name, replyMode: int(c.reply), writeMode: int(c.write), rowsPerPage: int(c.rows) || 20, titleLen: int(c.title_len) || 20, imgWidth: int(c.img_w) || 100, imgHeight: int(c.img_h) || 96, listStyle: int(c.list_style), defaultKey: int(c.defaultkey) },
          create: { siteId, legacyId, lang, name, defaultKey: int(c.defaultkey), replyMode: int(c.reply), writeMode: int(c.write), rowsPerPage: int(c.rows) || 20, titleLen: int(c.title_len) || 20, imgWidth: int(c.img_w) || 100, imgHeight: int(c.img_h) || 96, listStyle: int(c.list_style) },
        });
        catMap[`${legacyId}_${lang}`] = rec.id;
        stats.boardCats++;
      } catch (e) {
        stats.errors.push(`BoardCategory ${legacyId}: ${e.message}`);
      }
    }

    // --- BoardPost (parent=0 first, then replies) ---
    // Select specific columns to avoid massive contents blowup
    const posts = sqliteQuery(dbPath, "SELECT id, lang, category, title, contents, username, regdate, click, photos, notice, public, parent FROM Board ORDER BY id");
    const postMap = {}; // legacyId -> pgId

    // First pass: parent posts (parent=0 or null)
    for (const p of posts) {
      if (int(p.parent) > 0) continue;
      const legacyId = int(p.id);
      const lang = String(p.lang || "ko");
      const catLegacyId = int(p.category);
      const categoryId = catMap[`${catLegacyId}_${lang}`] || catMap[`${catLegacyId}_ko`] || null;

      try {
        const rec = await prisma.boardPost.upsert({
          where: { siteId_legacyId: { siteId, legacyId } },
          update: {
            title: String(p.title || ""),
            content: String(p.contents || ""),
            author: String(p.username || ""),
            photos: p.photos ? String(p.photos) : null,
            views: int(p.click),
            isNotice: int(p.notice) === 1,
            isPublic: int(p.public) !== 0,
            regdate: p.regdate ? String(p.regdate).trim() : null,
            lang,
            categoryId,
          },
          create: {
            siteId, legacyId, lang, categoryId,
            title: String(p.title || ""),
            content: String(p.contents || ""),
            author: String(p.username || ""),
            photos: p.photos ? String(p.photos) : null,
            views: int(p.click),
            isNotice: int(p.notice) === 1,
            isPublic: int(p.public) !== 0,
            regdate: p.regdate ? String(p.regdate).trim() : null,
          },
        });
        postMap[legacyId] = rec.id;
        stats.boardPosts++;
      } catch (e) {
        stats.errors.push(`BoardPost ${legacyId}: ${e.message}`);
      }
    }

    // Second pass: reply posts (parent>0)
    for (const p of posts) {
      const parentLegacyId = int(p.parent);
      if (parentLegacyId <= 0) continue;
      const legacyId = int(p.id);
      const lang = String(p.lang || "ko");
      const catLegacyId = int(p.category);
      const categoryId = catMap[`${catLegacyId}_${lang}`] || catMap[`${catLegacyId}_ko`] || null;
      const parentId = postMap[parentLegacyId] || null;

      try {
        const rec = await prisma.boardPost.upsert({
          where: { siteId_legacyId: { siteId, legacyId } },
          update: {
            title: String(p.title || ""),
            content: String(p.contents || ""),
            author: String(p.username || ""),
            photos: p.photos ? String(p.photos) : null,
            views: int(p.click),
            isNotice: int(p.notice) === 1,
            isPublic: int(p.public) !== 0,
            regdate: p.regdate ? String(p.regdate).trim() : null,
            lang, categoryId, parentId,
          },
          create: {
            siteId, legacyId, lang, categoryId, parentId,
            title: String(p.title || ""),
            content: String(p.contents || ""),
            author: String(p.username || ""),
            photos: p.photos ? String(p.photos) : null,
            views: int(p.click),
            isNotice: int(p.notice) === 1,
            isPublic: int(p.public) !== 0,
            regdate: p.regdate ? String(p.regdate).trim() : null,
          },
        });
        postMap[legacyId] = rec.id;
        stats.boardPosts++;
      } catch (e) {
        stats.errors.push(`BoardPost reply ${legacyId}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.errors.push(`Board migration: ${e.message}`);
  }

  // --- BoardPlugin ---
  try {
    const plugins = sqliteQuery(dbPath, "SELECT * FROM BoardPlugin");
    for (const bp of plugins) {
      const page = String(bp.page || "");
      const divId = String(bp.divid || "");
      if (!page || !divId) continue;

      try {
        await prisma.boardPlugin.upsert({
          where: { siteId_page_divId: { siteId, page, divId } },
          update: {
            legacyCatId: int(bp.category) || null,
            nums: int(bp.nums) || 5,
            titleLen: int(bp.titlelen) || 20,
            dateStyle: String(bp.datestyle || "0"),
            displayStyle: int(bp.displaystyle),
            imgWidth: int(bp.img_w) || 150,
            imgHeight: int(bp.img_h) || 100,
            skinFile: bp.skin_file ? String(bp.skin_file) : null,
          },
          create: {
            siteId, page, divId,
            legacyCatId: int(bp.category) || null,
            nums: int(bp.nums) || 5,
            titleLen: int(bp.titlelen) || 20,
            dateStyle: String(bp.datestyle || "0"),
            displayStyle: int(bp.displaystyle),
            imgWidth: int(bp.img_w) || 150,
            imgHeight: int(bp.img_h) || 100,
            skinFile: bp.skin_file ? String(bp.skin_file) : null,
          },
        });
        stats.boardPlugins++;
      } catch (e) {
        stats.errors.push(`BoardPlugin ${page}/${divId}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.errors.push(`BoardPlugin migration: ${e.message}`);
  }

  // --- ProductCategory ---
  try {
    const pcats = sqliteQuery(dbPath, "SELECT * FROM ProductCategory ORDER BY id");
    const pcatMap = {};
    for (const c of pcats) {
      const legacyId = int(c.id);
      const lang = String(c.lang || "ko");
      const name = String(c.category || `Category ${legacyId}`);
      try {
        const rec = await prisma.productCategory.upsert({
          where: { siteId_legacyId_lang: { siteId, legacyId, lang } },
          update: { name, listStyle: int(c.liststyle), rows: int(c.rows) || 9, imgWidth: int(c.img_w) || 80, imgHeight: int(c.img_h) || 80, titleLen: int(c.titlelen) || 30, textLen: int(c.textlen), depth: int(c.depth), parentLegacyId: int(c.parent) || null, defaultKey: int(c.defaultkey) },
          create: { siteId, legacyId, lang, name, defaultKey: int(c.defaultkey), parentLegacyId: int(c.parent) || null, depth: int(c.depth), listStyle: int(c.liststyle), rows: int(c.rows) || 9, imgWidth: int(c.img_w) || 80, imgHeight: int(c.img_h) || 80, titleLen: int(c.titlelen) || 30, textLen: int(c.textlen) },
        });
        pcatMap[`${legacyId}_${lang}`] = rec.id;
        stats.productCats++;
      } catch (e) {
        stats.errors.push(`ProductCategory ${legacyId}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.errors.push(`ProductCategory migration: ${e.message}`);
  }

  // --- Product (upsert by siteId + legacyId) ---
  try {
    const products = sqliteQuery(dbPath, "SELECT id, lang, pname, contents, price, category, photos, specification FROM Product ORDER BY id");
    for (const p of products) {
      const legacyId = int(p.id);
      if (!legacyId) continue;
      const lang = String(p.lang || "ko");
      const name = String(p.pname || "");
      const price = int(p.price);
      const category = p.category ? String(p.category) : null;

      try {
        await prisma.product.upsert({
          where: { siteId_legacyId: { siteId, legacyId } },
          update: {
            name: name || undefined,
            description: p.contents ? String(p.contents) : undefined,
            price: price || undefined,
            category: category || undefined,
            photos: p.photos ? String(p.photos) : undefined,
            specification: p.specification ? String(p.specification) : undefined,
            lang,
          },
          create: {
            siteId, legacyId, lang,
            name: name || `Product ${legacyId}`,
            description: p.contents ? String(p.contents) : null,
            price: price || 0,
            category,
            photos: p.photos ? String(p.photos) : null,
            specification: p.specification ? String(p.specification) : null,
          },
        });
        stats.products++;
      } catch (e) {
        stats.errors.push(`Product ${legacyId}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.errors.push(`Product migration: ${e.message}`);
  }

  // --- ProductPlugin ---
  try {
    const pplugs = sqliteQuery(dbPath, "SELECT * FROM ProductPlugin");
    for (const pp of pplugs) {
      const lang = String(pp.lang || "ko");
      const page = String(pp.page || "");
      const divId = String(pp.divid || "");
      if (!page || !divId) continue;

      try {
        await prisma.productPlugin.upsert({
          where: { siteId_lang_page_divId: { siteId, lang, page, divId } },
          update: {
            legacyCatId: int(pp.category) || null,
            nums: int(pp.nums) || 7,
            titleLen: int(pp.titlelen) || 38,
            imgWidth: int(pp.img_w) || 128,
            imgHeight: int(pp.img_h) || 125,
            skinFile: pp.skin_file ? String(pp.skin_file) : null,
          },
          create: {
            siteId, lang, page, divId,
            legacyCatId: int(pp.category) || null,
            nums: int(pp.nums) || 7,
            titleLen: int(pp.titlelen) || 38,
            imgWidth: int(pp.img_w) || 128,
            imgHeight: int(pp.img_h) || 125,
            skinFile: pp.skin_file ? String(pp.skin_file) : null,
          },
        });
        stats.productPlugins++;
      } catch (e) {
        stats.errors.push(`ProductPlugin ${page}/${divId}: ${e.message}`);
      }
    }
  } catch (e) {
    stats.errors.push(`ProductPlugin migration: ${e.message}`);
  }

  return stats;
}

async function main() {
  console.log("=== SQLite → PostgreSQL Migration ===");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  const sites = await prisma.site.findMany({ select: { id: true, shopId: true } });
  console.log(`Found ${sites.length} sites in PostgreSQL\n`);

  let totalStats = { boardCats: 0, boardPosts: 0, boardPlugins: 0, products: 0, productCats: 0, productPlugins: 0, errors: 0, migrated: 0, skipped: 0 };

  for (const site of sites) {
    const result = await migrateSite(site);
    if (result.skipped) {
      totalStats.skipped++;
      continue;
    }

    totalStats.migrated++;
    totalStats.boardCats += result.boardCats;
    totalStats.boardPosts += result.boardPosts;
    totalStats.boardPlugins += result.boardPlugins;
    totalStats.products += result.products;
    totalStats.productCats += result.productCats;
    totalStats.productPlugins += result.productPlugins;

    const hasData = result.boardPosts + result.products + result.boardPlugins + result.productPlugins > 0;
    if (hasData) {
      console.log(`  ${result.shopId}: BC=${result.boardCats} BP=${result.boardPosts} BPl=${result.boardPlugins} P=${result.products} PC=${result.productCats} PP=${result.productPlugins}${result.errors.length ? ` (${result.errors.length} errors)` : ""}`);
    }
    if (result.errors.length > 0) {
      totalStats.errors += result.errors.length;
      for (const e of result.errors.slice(0, 3)) {
        console.log(`    ERR: ${e}`);
      }
      if (result.errors.length > 3) console.log(`    ... and ${result.errors.length - 3} more errors`);
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Sites migrated: ${totalStats.migrated} (skipped: ${totalStats.skipped})`);
  console.log(`BoardCategories: ${totalStats.boardCats}`);
  console.log(`BoardPosts: ${totalStats.boardPosts}`);
  console.log(`BoardPlugins: ${totalStats.boardPlugins}`);
  console.log(`Products: ${totalStats.products}`);
  console.log(`ProductCategories: ${totalStats.productCats}`);
  console.log(`ProductPlugins: ${totalStats.productPlugins}`);
  console.log(`Errors: ${totalStats.errors}`);
  console.log(`Finished at: ${new Date().toISOString()}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
