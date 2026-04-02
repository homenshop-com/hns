#!/usr/bin/env node
/**
 * Import/Update newkorea site in PostgreSQL (Prisma DB).
 *
 * What this script does:
 * 1. Updates Site record:
 *    - Converts wowasp_ → hns_, wowaspfoot_ → hnsfoot_ in headerHtml / footerHtml
 *    - Converts http://home.homenshop.net/newkorea/ → https://home.homenshop.com/newkorea/
 *    - Converts http://newkorea.homenshop.net/ → https://home.homenshop.com/newkorea/
 *    - Sets defaultLanguage = 'ko', templatePath = 'personal/newtemp/pt931515/wpt583541'
 *    - Sets name to the proper site name from TopMenu_ko
 * 2. Updates Page records:
 *    - Converts wowasp_ → hns_ in page content (JSON html field)
 *    - Updates page titles from TopMenu_ko menuname (Korean titles)
 *    - Sets correct sortOrder from TopMenu_ko
 *    - Sets isHome=true for index page
 *    - Sets seoTitle, seoKeywords, seoDescription from TopMenu_ko
 * 3. Creates Domain record for newkoreaip.com (if not exists)
 *
 * Usage: node /tmp/import-newkorea.js
 */

'use strict';

const {Pool} = require('pg');
const {execSync} = require('child_process');
const fs = require('fs');

const DB_URL = 'postgresql://homenshop:HnsApp2026Secure@127.0.0.1:5432/homenshop?schema=public';
const SQLITE_DB = '/var/www/legacy-data/userdata/newkorea/db/.sqlite3';
const SQLITE_HELPER = '/var/www/homenshop-next/scripts/sqlite-query.py';

const pool = new Pool({connectionString: DB_URL});

function sqliteQuery(sql) {
  try {
    const result = execSync(`echo ${JSON.stringify(sql)} | python3 ${SQLITE_HELPER} ${SQLITE_DB}`, {encoding: 'utf8'});
    return JSON.parse(result.trim());
  } catch (e) {
    console.error('SQLite query failed:', e.message);
    return [];
  }
}

function convertBranding(html) {
  if (!html) return html;
  // wowasp_ → hns_ (covers wowasp_header, wowasp_menu, wowasp_body, wowasp_footer, etc.)
  html = html.replace(/wowasp_/g, 'hns_');
  // wowaspfoot_ → hnsfoot_ (legacy footer sub-elements)
  html = html.replace(/wowaspfoot_/g, 'hnsfoot_');
  return html;
}

function convertUrls(html) {
  if (!html) return html;
  // http://home.homenshop.net/newkorea/ → https://home.homenshop.com/newkorea/
  html = html.replace(/http:\/\/home\.homenshop\.net\/newkorea\//g, 'https://home.homenshop.com/newkorea/');
  html = html.replace(/http:\/\/home\.homenshop\.net\/newkorea([^/])/g, 'https://home.homenshop.com/newkorea$1');
  // http://newkorea.homenshop.net/ → https://home.homenshop.com/newkorea/
  html = html.replace(/http:\/\/newkorea\.homenshop\.net\//g, 'https://home.homenshop.com/newkorea/');
  html = html.replace(/http:\/\/newkorea\.homenshop\.net([^/])/g, 'https://home.homenshop.com/newkorea$1');
  // Also handle https variants just in case
  html = html.replace(/https:\/\/home\.homenshop\.net\/newkorea\//g, 'https://home.homenshop.com/newkorea/');
  html = html.replace(/https:\/\/newkorea\.homenshop\.net\//g, 'https://home.homenshop.com/newkorea/');
  return html;
}

function convertContent(html) {
  return convertUrls(convertBranding(html));
}

async function main() {
  console.log('=== newkorea site import/update script ===\n');

  // 1. Get site record
  const siteResult = await pool.query('SELECT * FROM "Site" WHERE "shopId"=\'newkorea\'');
  if (siteResult.rows.length === 0) {
    console.error('ERROR: Site newkorea not found in database!');
    process.exit(1);
  }
  const site = siteResult.rows[0];
  console.log(`Found site: id=${site.id}, shopId=${site.shopId}`);

  // 2. Read TopMenu_ko for page titles and order
  const topMenuRows = sqliteQuery('SELECT * FROM TopMenu_ko ORDER BY menu_no');
  console.log(`TopMenu_ko: ${topMenuRows.length} rows`);

  // Build slug→menu map from TopMenu_ko
  const menuMap = {};
  for (const row of topMenuRows) {
    const slug = row.file_name ? row.file_name.replace('.html', '') : null;
    if (slug) menuMap[slug] = row;
  }

  // Get site name from TopMenu_ko (index page file_title or menuname)
  const indexMenu = menuMap['index'];
  const siteName = (indexMenu && indexMenu.file_title) ? indexMenu.file_title : 'newkorea';
  console.log(`Site name from TopMenu_ko: ${siteName}`);

  // 3. Update Site HMF + metadata
  const newHeader = convertContent(site.headerHtml);
  const newMenu = convertContent(site.menuHtml);
  const newFooter = convertContent(site.footerHtml);

  console.log('\n--- Updating Site record ---');
  console.log('header wowasp→hns:', (site.headerHtml || '').includes('wowasp') ? 'YES (converting)' : 'no change needed');
  console.log('footer wowasp→hns:', (site.footerHtml || '').includes('wowasp') ? 'YES (converting)' : 'no change needed');
  console.log('footer legacy URLs:', (site.footerHtml || '').includes('homenshop.net') ? 'YES (converting)' : 'no change needed');

  await pool.query(
    `UPDATE "Site" SET 
      name = $1,
      "defaultLanguage" = $2,
      "templatePath" = $3,
      "headerHtml" = $4,
      "menuHtml" = $5,
      "footerHtml" = $6,
      "updatedAt" = NOW()
    WHERE "shopId" = 'newkorea'`,
    [
      siteName,
      'ko',
      'personal/newtemp/pt931515/wpt583541',
      newHeader,
      newMenu,
      newFooter
    ]
  );
  console.log('Site record updated.');

  // 4. Update Page records
  console.log('\n--- Updating Page records ---');
  const pageResult = await pool.query(
    'SELECT id, slug, title, content, css, "isHome", "sortOrder" FROM "Page" WHERE "siteId"=$1',
    [site.id]
  );
  console.log(`Found ${pageResult.rows.length} pages to update.`);

  let updatedPages = 0;
  for (const page of pageResult.rows) {
    const menu = menuMap[page.slug];
    
    // Determine new title
    let newTitle = page.title;
    if (menu) {
      if (menu.menuname && menu.menuname.trim()) {
        newTitle = menu.menuname.trim();
      } else if (menu.file_title && menu.file_title.trim()) {
        newTitle = menu.file_title.trim();
      }
    }

    // Determine sort order: use menu_no from TopMenu_ko
    let newSortOrder = page.sortOrder;
    if (menu) {
      newSortOrder = menu.menu_no;
    }

    // isHome: true for index slug
    const newIsHome = page.slug === 'index';

    // SEO fields from TopMenu_ko
    const newSeoTitle = (menu && menu.file_title) ? menu.file_title : newTitle;
    const newSeoKeywords = (menu && menu.keyword) ? menu.keyword : null;
    const newSeoDescription = (menu && menu.discription) ? menu.discription : null;

    // Convert content (wowasp → hns, URLs)
    let newContent = page.content;
    if (newContent) {
      const contentStr = typeof newContent === 'string' ? newContent : JSON.stringify(newContent);
      const convertedStr = convertContent(contentStr);
      try {
        newContent = JSON.parse(convertedStr);
      } catch {
        newContent = convertedStr;
      }
    }

    // Convert CSS
    const newCss = convertContent(page.css);

    await pool.query(
      `UPDATE "Page" SET
        title = $1,
        "sortOrder" = $2,
        "isHome" = $3,
        "seoTitle" = $4,
        "seoKeywords" = $5,
        "seoDescription" = $6,
        content = $7,
        css = $8,
        "updatedAt" = NOW()
      WHERE id = $9`,
      [
        newTitle,
        newSortOrder,
        newIsHome,
        newSeoTitle,
        newSeoKeywords,
        newSeoDescription,
        newContent ? JSON.stringify(newContent) : null,
        newCss,
        page.id
      ]
    );
    updatedPages++;

    if (updatedPages <= 5 || page.slug === 'index') {
      console.log(`  Page ${page.slug}: title="${newTitle}", sortOrder=${newSortOrder}, isHome=${newIsHome}`);
    }
  }
  console.log(`Updated ${updatedPages} pages.`);

  // 5. Create Domain record for newkoreaip.com
  console.log('\n--- Domain record ---');
  const domainCheck = await pool.query(
    'SELECT id FROM "Domain" WHERE domain=\'newkoreaip.com\''
  );
  if (domainCheck.rows.length > 0) {
    console.log('Domain newkoreaip.com already exists, skipping.');
  } else {
    // Generate a cuid-like ID
    const domainId = 'c' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    await pool.query(
      `INSERT INTO "Domain" (id, domain, "siteId", "userId", status, "sslEnabled", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'ACTIVE', false, NOW(), NOW())`,
      [domainId, 'newkoreaip.com', site.id, site.userId]
    );
    console.log(`Created Domain record: newkoreaip.com (id=${domainId})`);
  }

  console.log('\n=== Done! ===');
  console.log('Summary:');
  console.log('  - Site HMF updated (wowasp→hns, legacy URLs converted)');
  console.log('  - Site name set to:', siteName);
  console.log(`  - ${updatedPages} pages updated (titles, SEO, content branding)`);
  console.log('  - Domain newkoreaip.com created');
}

main()
  .catch(e => {
    console.error('FATAL ERROR:', e);
    process.exit(1);
  })
  .finally(() => pool.end());
