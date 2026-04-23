#!/usr/bin/env node
/**
 * Sync unionled footer + header with real xunion5 (UNION LED) legacy data.
 *
 * Legacy source of truth (from xunion5/ko Site.footerHtml + Page.externalUrl):
 *   Tel 031-883-1017 · Fax 070-4042-1018 · HP 010-3126-9939
 *   Email jgcheon@hanmail.net · 사업자 594-25-00279
 *   기업은행 예금주 유니온엘이디 · 본사 서울 마포구 양화로 73,642
 *   전시장 경기도 오산시 양산로 364 · 가격표 블로그 https://blog.naver.com/jgcheon
 *
 * Changes to unionled/Site.footerHtml:
 *  · Fax was wrong (031-883-9939) — replaced with 070-4042-1018
 *  · Adds HP 010-3126-9939 line
 *  · "가격표 (블로그)" `href="#"` → https://blog.naver.com/jgcheon (new tab)
 *  · Products links → board.html?action=list&category=X (functional)
 *  · Address expanded to main + 전시장
 *  · Email + 사업자번호 + 기업은행 info added
 *
 * Also copies the same block to Template.footerHtml so new sites created
 * from this template get the correct defaults.
 *
 * Run:
 *   DATABASE_URL="..." node scripts/fix-unionled-footer.mjs
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";

const NEW_FOOTER = `<footer class="ul-footer">
  <div class="ul-footer-top">
    <div class="ul-footer-brand">
      <h4>유니온엘이디 UNION LED</h4>
      <p>스마트한 빛으로 미래를 밝힙니다. 일반업소 · 교회 · 학교 · 관공서 납품 전문 기업. <strong>SINCE 2001</strong>.</p>
      <p class="ul-footer-biz">사업자등록번호 <span>594-25-00279</span> · 기업은행 <span>010-3126-9939</span> <span class="muted">(예금주: 유니온엘이디)</span></p>
    </div>
    <div class="ul-footer-col">
      <h5>Products</h5>
      <ul>
        <li><a href="board.html?action=list&category=3">실내용 전광판</a></li>
        <li><a href="board.html?action=list&category=4">옥외용 전광판</a></li>
        <li><a href="board.html?action=list&category=11">주문형 전광판</a></li>
        <li><a href="board.html?action=list&category=5">주유소 전광판</a></li>
        <li><a href="board.html?action=list&category=6">풀컬러 전광판</a></li>
        <li><a href="board.html?action=list&category=8">양면돌출 간판</a></li>
      </ul>
    </div>
    <div class="ul-footer-col">
      <h5>Company</h5>
      <ul>
        <li><a href="about.html">회사소개</a></li>
        <li><a href="cases.html">설치 사례</a></li>
        <li><a href="products.html">전광판 규격</a></li>
        <li><a href="https://blog.naver.com/jgcheon" target="_blank" rel="noopener">가격표 (블로그)<span class="ext-icon">↗</span></a></li>
        <li><a href="contact.html">고객지원센터</a></li>
        <li><a href="board.html?action=list&category=1">공지사항</a></li>
      </ul>
    </div>
    <div class="ul-footer-col">
      <h5>Contact</h5>
      <ul>
        <li><a href="tel:031-883-1017" class="ul-footer-tel">TEL 031-883-1017</a></li>
        <li><span class="ul-footer-mono">FAX 070-4042-1018</span></li>
        <li><a href="tel:010-3126-9939" class="ul-footer-mono">HP &nbsp;010-3126-9939</a></li>
        <li><a href="mailto:jgcheon@hanmail.net" class="ul-footer-mail">jgcheon@hanmail.net</a></li>
        <li class="ul-footer-hours">평일 AM 09:00 – PM 07:00</li>
        <li class="ul-footer-hours">토요일 AM 09:00 – PM 03:00</li>
      </ul>
    </div>
    <div class="ul-footer-col">
      <h5>Address</h5>
      <ul>
        <li><strong>본사</strong></li>
        <li class="ul-footer-addr">서울 마포구 양화로 73, 642</li>
        <li><strong>오산 공장 / 전시장</strong></li>
        <li class="ul-footer-addr">경기도 오산시 양산로 364</li>
      </ul>
    </div>
  </div>
  <div class="ul-footer-bottom">
    <span>© 2001–2026 <a href="mailto:jgcheon@hanmail.net">유니온엘이디 UNION LED</a> · ALL RIGHTS RESERVED.</span>
    <span>UNION-LED.ASIA · SINCE 2001</span>
  </div>
</footer>`;

const EXTRA_CSS_MARKER = "/* HNS-UNIONLED-FOOTER-v2 */";
const EXTRA_CSS = `
${EXTRA_CSS_MARKER}
.ul-footer-top { grid-template-columns: 2fr 1fr 1fr 1.1fr 1.1fr !important; }
@media (max-width: 900px) {
  .ul-footer-top { grid-template-columns: 1fr 1fr !important; gap: 32px 24px; }
}
@media (max-width: 520px) {
  .ul-footer-top { grid-template-columns: 1fr !important; }
}
.ul-footer-biz {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  margin-top: 10px;
  letter-spacing: 0.02em;
  line-height: 1.6;
}
.ul-footer-biz span { color: rgba(255,181,71,0.85); }
.ul-footer-biz .muted { color: rgba(255,255,255,0.35); }
.ul-footer-tel {
  font-family: 'JetBrains Mono', monospace;
  color: #ffb547 !important;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.ul-footer-tel:hover { color: #fff !important; }
.ul-footer-mono {
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.7) !important;
  letter-spacing: 0.04em;
  font-size: 13px;
}
.ul-footer-mail {
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255,255,255,0.6) !important;
  font-size: 12px;
  letter-spacing: 0.02em;
  word-break: break-all;
}
.ul-footer-mail:hover,
.ul-footer-mono:hover { color: #ffb547 !important; }
.ul-footer-hours {
  font-size: 11px;
  color: rgba(255,255,255,0.4) !important;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 0.02em;
}
.ul-footer-addr {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  line-height: 1.5;
}
.ul-footer-col strong {
  color: rgba(255,181,71,0.9);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 600;
  display: block;
  margin-top: 6px;
  margin-bottom: 2px;
}
.ul-footer-col strong:first-child { margin-top: 0; }
.ul-footer-col .ext-icon {
  font-size: 10px;
  opacity: 0.5;
  margin-left: 4px;
  transition: transform 0.2s;
  display: inline-block;
}
.ul-footer-col a:hover .ext-icon { transform: translate(2px, -2px); opacity: 1; }
.ul-footer-bottom a {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}
.ul-footer-bottom a:hover { color: #ffb547; }
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    // Update footerHtml
    const r = await client.query(`SELECT "footerHtml", "cssText" FROM "${table}" WHERE id = $1`, [id]);
    if (r.rowCount === 0) {
      console.log(`  - ${table} ${id} not found`);
      continue;
    }
    const oldFooter = r.rows[0].footerHtml || "";
    const oldCss = r.rows[0].cssText || "";

    await client.query(`UPDATE "${table}" SET "footerHtml" = $1 WHERE id = $2`, [NEW_FOOTER, id]);
    console.log(`  ✓ ${table} footerHtml: ${oldFooter.length} → ${NEW_FOOTER.length}`);

    if (!oldCss.includes(EXTRA_CSS_MARKER)) {
      const nextCss = oldCss + "\n" + EXTRA_CSS.trim() + "\n";
      await client.query(`UPDATE "${table}" SET "cssText" = $1 WHERE id = $2`, [nextCss, id]);
      console.log(`  ✓ ${table} cssText : ${oldCss.length} → ${nextCss.length}`);
    } else {
      console.log(`  · ${table} cssText already has footer-v2 rules`);
    }
  }

  /* ─── ALSO update SiteHmf per-lang override. The renderer does
   *     hmf?.footerHtml ?? site.footerHtml — so if a SiteHmf row has its
   *     own footerHtml, it shadows the Site-level one. ─── */
  const hmf = await client.query(
    `SELECT id, lang FROM "SiteHmf" WHERE "siteId" = $1`,
    [SITE_ID],
  );
  for (const h of hmf.rows) {
    await client.query(
      `UPDATE "SiteHmf" SET "footerHtml" = $1 WHERE id = $2`,
      [NEW_FOOTER, h.id],
    );
    console.log(`  ✓ SiteHmf(${h.lang}) footerHtml replaced`);
  }

  await client.end();
  console.log(`\n✓ done.`);
  console.log(`  Verify: https://home.homenshop.com/unionled/ko/index.html (scroll to footer)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
