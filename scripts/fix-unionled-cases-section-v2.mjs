#!/usr/bin/env node
/**
 * Proper repair of the 주요 설치 사례 section on unionled/ko/index.html.
 *
 * The v1 fix used a regex to preserve the section-head but stopped at the
 * FIRST `</div>\s*</div>` pair it found — which caught the inner title
 * block's closing divs but missed the outer `<div class="ul-section-head">`
 * closer. Result: section-head was never closed, `.ul-case-grid` ended up
 * nested inside it, and the whole grid was hidden/clipped by the
 * section-head's flex/gap CSS.
 *
 * v2 rebuilds the ENTIRE `<section class="ul-section ul-cases">` block
 * from scratch with a clean, correctly-nested structure:
 *
 *   <div class="dragable" id="obj_sec_...">
 *     <section class="ul-section ul-cases">
 *       <div class="ul-section-head">
 *         <div>
 *           <span class="ul-eyebrow-mono">Featured cases</span>
 *           <h2 class="ul-section-title">주요 <em>설치 사례</em></h2>
 *         </div>
 *         <a href="cases.html" class="ul-btn-ghost">전체 사례 보기 →</a>
 *       </div>
 *       <div class="ul-case-grid">
 *         <div class="dragable de-group">
 *           <div class="ul-case-card [large]">...</div>
 *         </div>
 *         ... (4 more)
 *       </div>
 *     </section>
 *   </div>
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const SHOP_ID = "unionled";

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

  /* Find posts */
  const usedIds = [];
  const cards = [];
  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const post = await findPost(client, SITE_ID, c.cat, usedIds);
    if (post) usedIds.push(post.legacyId);
    cards.push(renderCaseCard(c, post, i));
  }

  /* Build the complete, correctly-nested section */
  const newSectionBlock = `<div class="dragable" id="obj_sec_cases">
  <section class="ul-section ul-cases">
    <div class="ul-section-head">
      <div>
        <span class="ul-eyebrow-mono">Featured cases</span>
        <div class="dragable sol-replacible-text" id="obj_title_cases">
          <h2 class="ul-section-title">주요 <em>설치 사례</em></h2>
        </div>
      </div>
      <a href="cases.html" class="ul-btn-ghost" style="align-self:flex-end;">
        전체 사례 보기
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </a>
    </div>
    <div class="ul-case-grid">
      ${cards.join("\n      ")}
    </div>
  </section>
</div>`;

  /* Locate and replace the current broken section */
  const pageRow = await client.query(
    `SELECT id, content FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug='index' LIMIT 1`,
    [SITE_ID],
  );
  if (pageRow.rowCount === 0) throw new Error("index page not found");
  const pageId = pageRow.rows[0].id;
  let html = pageRow.rows[0].content?.html || "";

  /* Match the entire outer wrapper of the current (broken) cases section.
   * The previous state has `<div class="dragable" id="obj_sec_..."> ... <section class="ul-section ul-cases"> ... </section></div>`.
   * We match from the wrapper open right before `<section class="ul-section ul-cases">`
   * down through the final `</section></div>` that ends the wrapper.
   */
  const casesOpenIdx = html.indexOf('<section class="ul-section ul-cases">');
  if (casesOpenIdx < 0) throw new Error("could not locate cases section");

  // Walk backward to find the `<div class="dragable"` wrapper that opens this section
  const wrapperOpen = html.lastIndexOf('<div class="dragable"', casesOpenIdx);
  if (wrapperOpen < 0) throw new Error("wrapper <div class=dragable> open not found");

  // Walk forward from casesOpenIdx to find `</section>` then the matching `</div>`
  const sectionClose = html.indexOf("</section>", casesOpenIdx);
  if (sectionClose < 0) throw new Error("</section> not found");

  // The </div> that closes the wrapper is the first </div> after </section>
  const wrapperClose = html.indexOf("</div>", sectionClose);
  if (wrapperClose < 0) throw new Error("wrapper </div> not found");

  const sliceEnd = wrapperClose + "</div>".length;
  const before = html.slice(0, wrapperOpen);
  const after = html.slice(sliceEnd);
  const newHtml = before + newSectionBlock + after;

  await client.query(
    `UPDATE "Page" SET content=$1::jsonb, "updatedAt"=NOW() WHERE id=$2`,
    [JSON.stringify({ html: newHtml }), pageId],
  );
  console.log(`✓ cases section rebuilt cleanly`);
  console.log(`  old block size: ${sliceEnd - wrapperOpen} chars`);
  console.log(`  new block size: ${newSectionBlock.length} chars`);
  console.log(`  total page:     ${html.length} → ${newHtml.length} chars`);
  console.log(`  cards:          ${cards.length}`);

  await client.end();
  console.log(`\n✓ done. Verify: https://home.homenshop.com/unionled/ko/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
