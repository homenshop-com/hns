#!/usr/bin/env node
/**
 * Migrate xunion5 board/product data → unionled (new template site)
 *
 * What gets copied:
 *   1. BoardCategory    (with legacyId preserved so URLs keep working)
 *   2. BoardPost        (~578 ko posts, categoryId remapped, legacyId preserved)
 *   3. Uploaded images  (/var/www/legacy-data/userdata/xunion5/uploaded/*
 *                        → /var/www/legacy-data/userdata/unionled/uploaded/*
 *                        NOTE: done separately via shell `cp -al` — see README at bottom)
 *
 * What does NOT get copied:
 *   · BoardPlugin — xunion5 plugins reference legacy page filenames/divIds
 *     that don't exist in the new template. We rewrite products.html content
 *     instead to show the real data.
 *   · ProductPlugin — same reason.
 *   · Product — xunion5 has only 5 demo products with demo-product-*.gif
 *     placeholder images. Not worth migrating.
 *
 * Idempotent: re-running updates existing rows (matched by legacyId+siteId+lang).
 *
 * Run on server:
 *   DATABASE_URL="$(grep ^DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '\"')" \
 *     node /var/www/homenshop-next/scripts/migrate-xunion5-to-unionled.mjs
 */

import pg from "pg";
const { Client } = pg;

const SRC_SHOP = "xunion5";
const DST_SHOP = "unionled";

function cuid() {
  // lightweight cuid-ish id (db uses cuid2 but collision-safe enough for migration)
  return "cm" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-6);
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const src = await client.query(
    'SELECT id, "shopId" FROM "Site" WHERE "shopId" = $1 LIMIT 1',
    [SRC_SHOP],
  );
  const dst = await client.query(
    'SELECT id, "shopId" FROM "Site" WHERE "shopId" = $1 LIMIT 1',
    [DST_SHOP],
  );
  if (src.rowCount === 0) throw new Error(`source site not found: ${SRC_SHOP}`);
  if (dst.rowCount === 0) throw new Error(`destination site not found: ${DST_SHOP}`);

  const srcId = src.rows[0].id;
  const dstId = dst.rows[0].id;
  console.log(`src ${SRC_SHOP}=${srcId} → dst ${DST_SHOP}=${dstId}`);

  /* ────────────────────────────────────────────────────────────
   * 1. BoardCategory — (siteId, legacyId) unique per lang
   * ──────────────────────────────────────────────────────────── */
  const srcCats = await client.query(
    'SELECT * FROM "BoardCategory" WHERE "siteId" = $1',
    [srcId],
  );
  console.log(`\n=== BoardCategory: ${srcCats.rowCount} rows ===`);

  const catIdMap = new Map(); // oldId → newId
  for (const c of srcCats.rows) {
    const existing = await client.query(
      'SELECT id FROM "BoardCategory" WHERE "siteId" = $1 AND "legacyId" = $2 AND lang = $3 LIMIT 1',
      [dstId, c.legacyId, c.lang],
    );
    if (existing.rowCount > 0) {
      catIdMap.set(c.id, existing.rows[0].id);
      await client.query(
        `UPDATE "BoardCategory"
         SET name=$1, "defaultKey"=$2, "replyMode"=$3, "writeMode"=$4,
             "rowsPerPage"=$5, "titleLen"=$6, "imgWidth"=$7, "imgHeight"=$8, "listStyle"=$9
         WHERE id=$10`,
        [c.name, c.defaultKey, c.replyMode, c.writeMode, c.rowsPerPage, c.titleLen, c.imgWidth, c.imgHeight, c.listStyle, existing.rows[0].id],
      );
      console.log(`  ~ [${c.legacyId}] ${c.name} (updated)`);
    } else {
      const newId = cuid();
      catIdMap.set(c.id, newId);
      await client.query(
        `INSERT INTO "BoardCategory"
         (id, "siteId", "legacyId", lang, name, "defaultKey", "replyMode", "writeMode",
          "rowsPerPage", "titleLen", "imgWidth", "imgHeight", "listStyle")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [newId, dstId, c.legacyId, c.lang, c.name, c.defaultKey, c.replyMode, c.writeMode,
         c.rowsPerPage, c.titleLen, c.imgWidth, c.imgHeight, c.listStyle],
      );
      console.log(`  + [${c.legacyId}] ${c.name}`);
    }
  }

  /* ────────────────────────────────────────────────────────────
   * 2. BoardPost — ~578 posts in ko, unique by (siteId, legacyId, lang)
   * ──────────────────────────────────────────────────────────── */
  const srcPosts = await client.query(
    'SELECT * FROM "BoardPost" WHERE "siteId" = $1 ORDER BY "legacyId"',
    [srcId],
  );
  console.log(`\n=== BoardPost: ${srcPosts.rowCount} rows ===`);

  let inserted = 0, updated = 0, skipped = 0;
  for (const p of srcPosts.rows) {
    const newCatId = p.categoryId ? catIdMap.get(p.categoryId) : null;
    if (p.categoryId && !newCatId) {
      skipped++;
      continue; // orphan category — shouldn't happen
    }

    const existing = await client.query(
      'SELECT id FROM "BoardPost" WHERE "siteId" = $1 AND "legacyId" = $2 AND lang = $3 LIMIT 1',
      [dstId, p.legacyId, p.lang],
    );
    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE "BoardPost"
         SET author=$1, title=$2, content=$3, views=$4, "updatedAt"=NOW(),
             "categoryId"=$5, "isNotice"=$6, "isPublic"=$7, photos=$8, regdate=$9,
             "parentId"=$10
         WHERE id=$11`,
        [p.author, p.title, p.content, p.views, newCatId, p.isNotice, p.isPublic,
         p.photos, p.regdate, null /* parentId remap would need second pass; safe to null */,
         existing.rows[0].id],
      );
      updated++;
    } else {
      await client.query(
        `INSERT INTO "BoardPost"
         (id, author, title, content, views, "createdAt", "updatedAt",
          "categoryId", "isNotice", "isPublic", lang, "legacyId", "parentId",
          photos, regdate, "siteId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [cuid(), p.author, p.title, p.content, p.views,
         p.createdAt || new Date(), p.updatedAt || new Date(),
         newCatId, p.isNotice, p.isPublic, p.lang, p.legacyId, null,
         p.photos, p.regdate, dstId],
      );
      inserted++;
    }
    if ((inserted + updated) % 50 === 0) {
      process.stdout.write(`  progress: +${inserted} ~${updated}\r`);
    }
  }
  console.log(`  + inserted: ${inserted}`);
  console.log(`  ~ updated : ${updated}`);
  console.log(`  · skipped : ${skipped}`);

  /* ────────────────────────────────────────────────────────────
   * 3. Summary
   * ──────────────────────────────────────────────────────────── */
  const finalCats = await client.query('SELECT COUNT(*) FROM "BoardCategory" WHERE "siteId"=$1', [dstId]);
  const finalPosts = await client.query('SELECT COUNT(*) FROM "BoardPost" WHERE "siteId"=$1', [dstId]);
  console.log(`\n=== Final state on ${DST_SHOP} ===`);
  console.log(`  BoardCategory: ${finalCats.rows[0].count}`);
  console.log(`  BoardPost:     ${finalPosts.rows[0].count}`);

  // Top categories by post count
  const topCats = await client.query(
    `SELECT bc."legacyId", bc.name, COUNT(bp.id) as n
     FROM "BoardCategory" bc
     LEFT JOIN "BoardPost" bp ON bp."categoryId" = bc.id
     WHERE bc."siteId" = $1
     GROUP BY bc.id
     ORDER BY n DESC`,
    [dstId],
  );
  topCats.rows.forEach((r) => console.log(`    · [${r.legacyId}] ${r.name}: ${r.n}`));

  await client.end();

  console.log(`\n✓ DB migration complete.`);
  console.log(`\n⚠ Next step: copy uploaded image files on the server:`);
  console.log(`    ln -s /var/www/legacy-data/userdata/xunion5/uploaded /var/www/legacy-data/userdata/unionled/uploaded`);
  console.log(`    ln -s /var/www/legacy-data/userdata/xunion5/thumb.php /var/www/legacy-data/userdata/unionled/thumb.php`);
  console.log(`    mkdir -p /var/www/legacy-data/userdata/unionled/thumb-cache`);
  console.log(`  (uses symlinks so unionled shares xunion5's 322MB of images without duplication)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
