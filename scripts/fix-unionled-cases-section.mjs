#!/usr/bin/env node
/**
 * Repair the 주요 설치 사례 (Featured cases) section on unionled/ko/index.html.
 *
 * Previous bug: the earlier index-rebuild regex added extra `</div>` closers
 * after each case card, which prematurely closed `.ul-case-grid`. Only the
 * first card stayed inside the grid; the other 4 rendered as full-width
 * broken blocks outside the grid.
 *
 * This script:
 *   1. Strips out the entire current <div class="ul-case-grid">…… down to
 *      the end of the cases section wrapper.
 *   2. Rebuilds the grid from scratch using the 5 chosen case posts with
 *      correct nesting (5 cards inside ONE ul-case-grid).
 *   3. Removes the duplicate `/* HNS-UNIONLED-INDEX-IMG *\/` legacy CSS
 *      block that got appended twice (v1 + v2).
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const SHOP_ID = "unionled";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

/** Cases: 1 large hero + 4 small, each linked to a real BoardPost. */
const CASES = [
  { loc: "Full color · 대형",  cat: 6,  tags: ["풀컬러", "옥외", "대형"],  large: true  },
  { loc: "Indoor · 실내",      cat: 3,  tags: ["풀컬러", "실내"],           large: false },
  { loc: "Gas · 주유소",       cat: 5,  tags: ["가격표시"],                 large: false },
  { loc: "Outdoor · 옥외",     cat: 4,  tags: ["관공서"],                   large: false },
  { loc: "Custom · 주문형",    cat: 11, tags: ["주문형"],                   large: false },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function findPost(client, siteId, legacyCatId, excludeIds) {
  const bc = await client.query(
    `SELECT id FROM "BoardCategory" WHERE "siteId"=$1 AND "legacyId"=$2 AND lang='ko' LIMIT 1`,
    [siteId, legacyCatId],
  );
  if (bc.rowCount === 0) return null;
  const params = [siteId, bc.rows[0].id];
  let where = `SELECT "legacyId", title, photos FROM "BoardPost"
                WHERE "siteId"=$1 AND "categoryId"=$2 AND lang='ko'
                  AND photos IS NOT NULL AND photos <> ''`;
  if (excludeIds.length) {
    params.push(excludeIds);
    where += ` AND "legacyId" <> ALL($3::int[])`;
  }
  const r = await client.query(where + ` ORDER BY "legacyId" DESC LIMIT 1`, params);
  return r.rowCount ? r.rows[0] : null;
}

function firstPhoto(post) {
  return post?.photos ? post.photos.split("|").filter(Boolean)[0] : null;
}

function renderCaseCard(c, post, idx) {
  const photo = firstPhoto(post);
  const imgUrl = photo
    ? `https://home.homenshop.com/${SHOP_ID}/thumb/900x600/${encodeURIComponent(photo)}`
    : "";
  const title = escapeHtml(post?.title || c.loc);
  const href = post ? `board.html?action=read&id=${post.legacyId}` : "cases.html";
  const wrapId = `obj_card_case_${idx}`;
  const tags = c.tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("");
  return `<div class="dragable de-group" id="${wrapId}">
        <div class="ul-case-card${c.large ? " large" : ""}">
          ${imgUrl ? `<img src="${imgUrl}" alt="${title}" class="ul-card-bg" loading="lazy" />` : ""}
          <a class="ul-case-link" href="${href}" aria-label="${title}"></a>
          <div class="grad"></div>
          <div class="info">
            <span class="loc">${escapeHtml(c.loc)}</span>
            <div class="title">${title}</div>
            <div class="tags">${tags}</div>
          </div>
        </div>
      </div>`;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* ── Build the replacement grid ── */
  const usedIds = [];
  const cards = [];
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const post = await findPost(client, SITE_ID, c.cat, usedIds);
    if (post) usedIds.push(post.legacyId);
    cards.push(renderCaseCard(c, post, i));
  }
  const newGridBlock = `<div class="ul-case-grid">
      ${cards.join("\n      ")}
    </div>`;

  /* ── Load current content ── */
  const pageRow = await client.query(
    `SELECT id, content FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug='index' LIMIT 1`,
    [SITE_ID],
  );
  if (pageRow.rowCount === 0) throw new Error("index page not found");
  const pageId = pageRow.rows[0].id;
  let html = pageRow.rows[0].content?.html || "";

  /* ── Locate the start of the cases section and the end of the
   *    parent wrapper div ── */
  const startMarker = '<section class="ul-section ul-cases">';
  const start = html.indexOf(startMarker);
  if (start < 0) throw new Error("cases section not found in index page");

  // Find matching </section> + closing wrapper </div>
  const secEnd = html.indexOf("</section>", start);
  if (secEnd < 0) throw new Error("cases </section> not found");

  // The original structure is:
  //   <div class="dragable" id="obj_sec_moavph0h_x">
  //     <section class="ul-section ul-cases">
  //       <div class="ul-section-head">...</div>
  //       <div class="ul-case-grid">...CARDS...</div>
  //     </section>
  //   </div>
  //
  // We slice from startMarker up to </section> and rebuild the inner
  // contents. Preserve the section-head block (title + "전체 사례 보기" link)
  // because it's still correct.
  const sectionBlock = html.slice(start, secEnd);
  const headEndMatch = sectionBlock.match(/<div class="ul-section-head">[\s\S]*?<\/div>\s*<\/div>/);
  if (!headEndMatch) {
    // Try a more permissive head extraction
    const altHead = sectionBlock.match(/<div class="ul-section-head">[\s\S]*?<\/a>\s*<\/div>/);
    if (!altHead) throw new Error("ul-section-head not found");
    console.log("  (using permissive section-head match)");
    var headHtml = altHead[0];
  } else {
    var headHtml = headEndMatch[0];
  }

  const newSection = `${startMarker}
    ${headHtml}
    ${newGridBlock}
  `;
  const newHtml = html.slice(0, start) + newSection + html.slice(secEnd);

  await client.query(
    `UPDATE "Page" SET content=$1::jsonb, "updatedAt"=NOW() WHERE id=$2`,
    [JSON.stringify({ html: newHtml }), pageId],
  );
  console.log(`✓ index.html cases section rebuilt (page content: ${html.length} → ${newHtml.length} chars)`);
  console.log(`  · ${cards.length} case cards nested properly in ul-case-grid`);

  /* ── Clean up duplicate CSS block (v1 legacy) ── */
  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    let css = r.rows[0].cssText || "";

    // Remove the v1 block if v2 exists. v1 marker: /* HNS-UNIONLED-INDEX-IMG */
    // v2 marker: /* HNS-UNIONLED-INDEX-IMG-v2 */
    const v1Marker = "/* HNS-UNIONLED-INDEX-IMG */";
    const v2Marker = "/* HNS-UNIONLED-INDEX-IMG-v2 */";
    if (css.includes(v1Marker) && css.includes(v2Marker)) {
      // Strip the v1 block: from v1 marker to the next marker (or end)
      const v1Start = css.indexOf(v1Marker);
      const afterV1 = css.indexOf("/* HNS-", v1Start + v1Marker.length);
      const v1End = afterV1 > 0 ? afterV1 : css.length;
      const nextCss = css.slice(0, v1Start) + css.slice(v1End);
      if (nextCss.length < css.length) {
        await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [nextCss, id]);
        console.log(`  ✓ ${table} cssText: removed v1 duplicate block (${css.length} → ${nextCss.length})`);
      }
    }
  }

  await client.end();
  console.log(`\n✓ done. Verify: https://home.homenshop.com/unionled/ko/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
