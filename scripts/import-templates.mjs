/**
 * Import templates from legacy MySQL DB into PostgreSQL
 * Run: DATABASE_URL=... node scripts/import-templates.mjs
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const legacyTemplates = [
  { uid: 788, name: "modern-biz-2025", path: "personal/newtemp/pt449441/wpt320754", price: 0, category: "personal/newtemp" },
  { uid: 781, name: "d-36", path: "personal/newtemp/pt449441/wpt721160", price: 0, category: null },
  { uid: 779, name: "d-014", path: "personal/newtemp/pt449441/wpt631362", price: 0, category: null },
  { uid: 778, name: "d-071", path: "personal/newtemp/pt449441/wpt898828", price: 0, category: null },
  { uid: 777, name: "d-011", path: "personal/newtemp/pt449441/wpt98720", price: 0, category: null },
  { uid: 776, name: "d_008", path: "personal/newtemp/pt449441/wpt641703", price: 0, category: null },
  { uid: 775, name: "d_004", path: "personal/newtemp/pt449441/wpt211643", price: 0, category: null },
  { uid: 291, name: "d-046", path: "personal/newtemp/pt326066/wpt423365", price: 0, category: null },
  { uid: 314, name: "dcong73", path: "personal/newtemp/pt326066/wpt286212", price: 0, category: null },
  { uid: 306, name: "biz01", path: "personal/newtemp/pt931515/wpt816118", price: 0, category: null },
  { uid: 305, name: "Black", path: "personal/newtemp/pt931515/wpt941099", price: 0, category: null },
  { uid: 304, name: "Gray", path: "personal/newtemp/pt931515/wpt966370", price: 0, category: null },
  { uid: 303, name: "Notebook_red", path: "personal/newtemp/pt931515/wpt472417", price: 0, category: null },
  { uid: 302, name: "Ann", path: "personal/newtemp/pt931515/wpt504701", price: 0, category: null },
  { uid: 301, name: "Jason", path: "personal/newtemp/pt931515/wpt817274", price: 0, category: null },
  { uid: 300, name: "Bily", path: "personal/newtemp/pt931515/wpt196030", price: 0, category: null },
  { uid: 299, name: "business-29", path: "personal/newtemp/pt931515/wpt523559", price: 0, category: null },
  { uid: 298, name: "business-28", path: "personal/newtemp/pt931515/wpt363642", price: 0, category: null },
  { uid: 297, name: "business-27", path: "personal/newtemp/pt931515/wpt115934", price: 0, category: null },
  { uid: 296, name: "business-26", path: "personal/newtemp/pt931515/wpt482651", price: 0, category: null },
  { uid: 295, name: "business-25", path: "personal/newtemp/pt931515/wpt973581", price: 0, category: null },
  { uid: 294, name: "Grass", path: "personal/newtemp/pt931515/wpt334846", price: 0, category: null },
  { uid: 292, name: "kevin", path: "personal/newtemp/pt931515/wpt600261", price: 0, category: null },
  { uid: 288, name: "Orange", path: "personal/newtemp/pt931515/wpt141859", price: 0, category: null },
  { uid: 260, name: "massage", path: "personal/newtemp/pt931515/wpt583541", price: 0, category: null },
  { uid: 257, name: "business_23", path: "personal/newtemp/pt931515/wpt158805", price: 0, category: null },
  { uid: 258, name: "Bridge2010", path: "personal/newtemp/pt931515/wpt983089", price: 0, category: null },
  { uid: 244, name: "Irene_shopping", path: "personal/newtemp/pt98002/wpt274074", price: 0, category: null },
  { uid: 243, name: "business_20", path: "personal/newtemp/pt931515/wpt238038", price: 0, category: null },
  { uid: 238, name: "peng_cf", path: "personal/newtemp/pt449441/wpt248659", price: 0, category: null },
  { uid: 234, name: "APT-001", path: "personal/newtemp/pt33466/wpt144203", price: 0, category: "temp" },
  { uid: 179, name: "Car_salesman", path: "personal/newtemp/pt58372/wpt969731", price: 0, category: "company" },
  { uid: 164, name: "green-shop", path: "personal/newtemp/pt33466/wpt280731", price: 0, category: "temp" },
  { uid: 140, name: "shnaghai-003", path: "personal/newtemp/pt33466/wpt321705", price: 0, category: "temp" },
  { uid: 131, name: "shine_7", path: "personal/newtemp/pt33466/wpt458546", price: 0, category: "temp" },
  { uid: 127, name: "Furniture-001", path: "personal/newtemp/pt33466/wpt576362", price: 0, category: "temp" },
  { uid: 126, name: "shine_interior", path: "personal/newtemp/pt33466/wpt15756", price: 0, category: "temp" },
  { uid: 118, name: "shopping2010", path: "personal/newtemp/pt931515/wpt823000", price: 0, category: null },
  { uid: 117, name: "screen01", path: "personal/newtemp/pt931515/wpt332336", price: 0, category: null },
  { uid: 114, name: "technology_006", path: "personal/newtemp/pt944646/wpt649528", price: 0, category: "technology" },
  { uid: 112, name: "technology_004", path: "personal/newtemp/pt944646/wpt714280", price: 0, category: "technology" },
  { uid: 111, name: "sky_005", path: "personal/newtemp/pt944646/wpt142411", price: 0, category: "technology" },
  { uid: 93, name: "shuma_001", path: "personal/newtemp/pt137073/wpt557088", price: 0, category: "shuma" },
  { uid: 61, name: "blue_simple", path: "personal/newtemp/pt931515/wpt622496", price: 0, category: null },
  { uid: 62, name: "business_003", path: "personal/newtemp/pt931515/wpt707558", price: 0, category: null },
  { uid: 50, name: "Accessories001", path: "personal/newtemp/pt529467/wpt366026", price: 0, category: "recipe" },
  { uid: 85, name: "Cuisine", path: "personal/newtemp/pt529467/wpt349617", price: 0, category: "recipe" },
  { uid: 89, name: "demo-blue-gobal", path: "personal/newtemp/pt931515/wpt351267", price: 0, category: null },
  { uid: 68, name: "Shanghai_004", path: "personal/newtemp/pt931515/wpt258599", price: 0, category: null },
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Importing ${legacyTemplates.length} templates...`);

    for (const tpl of legacyTemplates) {
      const thumbnailUrl = `https://www.homenshop.net/designer/templates/thumbnails/${tpl.path}.gif`;
      const id = `tpl_${tpl.uid}`;
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO "Template" (id, "legacyUid", name, path, "thumbnailUrl", category, price, "isActive", clicks, "sortOrder", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, 0, $8, $9, $9)
         ON CONFLICT ("legacyUid") DO UPDATE SET
           name = EXCLUDED.name,
           path = EXCLUDED.path,
           "thumbnailUrl" = EXCLUDED."thumbnailUrl",
           category = EXCLUDED.category,
           "isActive" = true,
           "updatedAt" = EXCLUDED."updatedAt"`,
        [id, tpl.uid, tpl.name, tpl.path, thumbnailUrl, tpl.category, tpl.price, 1000 - tpl.uid, now]
      );
      console.log(`  ✓ ${tpl.name} (uid: ${tpl.uid})`);
    }

    console.log(`\nDone! ${legacyTemplates.length} templates imported.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
