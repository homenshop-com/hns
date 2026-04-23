#!/usr/bin/env node
/**
 * Configure unionled's contact form:
 *   1. Set Site.contactEmail = jgcheon@hanmail.net so the API knows where
 *      to deliver form submissions.
 *   2. Rewrite contact.html Page.content with:
 *      · Correct legacy info block (tel / fax / HP / email / biz / address)
 *      · Working <form> wired to POST /api/contact/submit
 *      · Honeypot field + inline success/error feedback
 *
 * Run:
 *   DATABASE_URL="..." node scripts/setup-unionled-contact-form.mjs
 */

import pg from "pg";
const { Client } = pg;

const SITE_ID = "cmoavtq8x001taa67vlpq1agk";
const SHOP_ID = "unionled";
const TEMPLATE_ID = "tpl_user_unionled_moavph1v";
const CONTACT_EMAIL = "jgcheon@hanmail.net";

const NEW_CONTACT_HTML = `
<div class="dragable" id="obj_sec_ctct_1">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="obj_text_ctct_eye"><span class="ul-eyebrow-mono">Contact · 견적문의</span></div>
    <div class="dragable sol-replacible-text" id="obj_title_ctct_h1"><h1>설치 상담은 <em>전화가 가장 빠릅니다</em>.</h1></div>
    <div class="dragable sol-replacible-text" id="obj_text_ctct_sub"><p>현장 조건만 알려주시면 견적과 설계안을 1영업일 내 보내드립니다.<br>전화·이메일·방문 상담 모두 가능합니다.</p></div>
  </section>
</div>

<div class="dragable" id="obj_sec_ctct_2">
  <section class="ul-section ul-contact-section">
    <div class="ul-contact-grid">
      <div class="dragable sol-replacible-text" id="obj_text_ctct_info">
        <div class="ul-contact-info">
          <h3>연락처 및 영업시간</h3>
          <ul>
            <li class="phone"><span>대표전화</span><b><a href="tel:031-883-1017">031-883-1017</a></b></li>
            <li><span>Fax</span><b>070-4042-1018</b></li>
            <li><span>HP</span><b><a href="tel:010-3126-9939">010-3126-9939</a></b></li>
            <li><span>이메일</span><b><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></b></li>
            <li><span>평일</span><b>AM 09:00 – PM 07:00</b></li>
            <li><span>토요일</span><b>AM 09:00 – PM 03:00</b></li>
            <li><span>본사</span><b>서울 마포구 양화로 73, 642</b></li>
            <li><span>오산 전시장</span><b>경기도 오산시 양산로 364</b></li>
            <li><span>사업자</span><b>594-25-00279</b></li>
            <li><span>SINCE</span><b>2001년</b></li>
          </ul>
        </div>
      </div>
      <div class="dragable" id="obj_card_ctct_form">
        <form class="ul-form ul-contact-form" id="ul-contact-form" novalidate>
          <div class="ul-form-head">
            <div class="ul-form-head-eye">REQUEST A QUOTE</div>
            <h3>무료 견적 요청</h3>
            <p>아래 내용만 알려주시면 1영업일 내 전화·이메일로 답변드립니다.</p>
          </div>
          <div class="ul-form-row">
            <input type="text" name="company" placeholder="회사 / 업체명" autocomplete="organization" />
            <input type="text" name="name" placeholder="담당자 성함 *" required autocomplete="name" />
          </div>
          <div class="ul-form-row">
            <input type="tel" name="phone" placeholder="연락처 (휴대폰 우선) *" required autocomplete="tel" />
            <input type="email" name="email" placeholder="이메일 (선택)" autocomplete="email" />
          </div>
          <input type="text" name="address" placeholder="설치 현장 주소 (선택)" autocomplete="street-address" />
          <textarea name="message" rows="5" placeholder="전광판 크기 · 용도 · 피치 · 예산 · 설치 일정 등을 자유롭게 적어주세요 *" required></textarea>
          <!-- Honeypot — must stay empty; hidden from humans, filled by bots -->
          <input type="text" name="hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0;" aria-hidden="true" />
          <div class="ul-form-meta">* 표시는 필수 입력 항목입니다. 접수된 내용은 <b>${CONTACT_EMAIL}</b>로 발송됩니다.</div>
          <div class="ul-form-status" id="ul-form-status" role="status" aria-live="polite"></div>
          <button type="submit" id="ul-form-submit">견적 요청 →</button>
        </form>
      </div>
    </div>
  </section>
</div>

<script>
(function(){
  var form = document.getElementById('ul-contact-form');
  if (!form) return;
  var statusEl = document.getElementById('ul-form-status');
  var btn = document.getElementById('ul-form-submit');
  var SHOP_ID = '${SHOP_ID}';

  function setStatus(kind, msg) {
    if (!statusEl) return;
    statusEl.className = 'ul-form-status ' + (kind || '');
    statusEl.textContent = msg || '';
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    var fd = new FormData(form);
    var payload = {
      shopId: SHOP_ID,
      company: (fd.get('company') || '').toString().trim(),
      name: (fd.get('name') || '').toString().trim(),
      phone: (fd.get('phone') || '').toString().trim(),
      email: (fd.get('email') || '').toString().trim(),
      address: (fd.get('address') || '').toString().trim(),
      message: (fd.get('message') || '').toString().trim(),
      hp: (fd.get('hp') || '').toString()
    };
    if (!payload.name || !payload.phone || !payload.message) {
      setStatus('err', '담당자 성함, 연락처, 문의 내용은 필수입니다.');
      return;
    }
    btn.disabled = true;
    btn.textContent = '전송 중...';
    setStatus('pending', '전송 중입니다…');
    try {
      var res = await fetch('/api/contact/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = null;
      try { data = await res.json(); } catch(_){}
      if (res.ok) {
        setStatus('ok', '접수되었습니다! 1영업일 내 연락드리겠습니다. 급하시면 031-883-1017로 전화 주세요.');
        form.reset();
      } else if (res.status === 503 && data && data.error === 'mail_not_configured') {
        setStatus('err', '메일 서비스가 아직 설정되지 않았습니다. 급한 문의는 031-883-1017 전화로 부탁드립니다.');
      } else if (res.status === 429) {
        setStatus('err', '요청이 너무 많습니다. 10분 후 다시 시도해주세요.');
      } else {
        setStatus('err', (data && data.error) || '전송에 실패했습니다. 031-883-1017로 전화 주세요.');
      }
    } catch (err) {
      setStatus('err', '네트워크 오류입니다. 잠시 후 다시 시도해주세요.');
    } finally {
      btn.disabled = false;
      btn.textContent = '견적 요청 →';
    }
  });
})();
</script>
`;

const EXTRA_CSS_MARKER = "/* HNS-UNIONLED-CONTACT-FORM */";
const EXTRA_CSS = `
${EXTRA_CSS_MARKER}
.ul-contact-section {
  max-width: 1240px;
  margin: 40px auto 80px;
  padding: 0 24px;
}
.ul-contact-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 40px;
  align-items: start;
}
.ul-contact-info {
  background: linear-gradient(180deg, rgba(255,181,71,0.05), transparent);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
}
.ul-contact-info h3 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-hi);
  margin: 0 0 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(255,181,71,0.3);
  letter-spacing: -0.01em;
}
.ul-contact-info ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ul-contact-info li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px dashed rgba(255,255,255,0.05);
}
.ul-contact-info li span {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-lo);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
  min-width: 90px;
}
.ul-contact-info li b {
  color: var(--text-hi);
  font-size: 14px;
  font-weight: 500;
  text-align: right;
  letter-spacing: -0.01em;
}
.ul-contact-info li b a {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}
.ul-contact-info li b a:hover { color: var(--amber); }
.ul-contact-info li.phone b,
.ul-contact-info li.phone b a {
  color: var(--amber);
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.ul-contact-form {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 36px 32px;
}
.ul-form-head {
  padding-bottom: 24px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.ul-form-head-eye {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--amber);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.ul-form-head h3 {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-hi);
  margin: 0 0 10px;
  letter-spacing: -0.02em;
}
.ul-form-head p {
  font-size: 13px;
  color: var(--text-mid);
  margin: 0;
  line-height: 1.6;
}
.ul-contact-form .ul-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 10px;
}
.ul-contact-form input[type="text"],
.ul-contact-form input[type="tel"],
.ul-contact-form input[type="email"],
.ul-contact-form textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  background: var(--bg-base);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-hi);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}
.ul-contact-form input::placeholder,
.ul-contact-form textarea::placeholder {
  color: var(--text-lo);
}
.ul-contact-form input:focus,
.ul-contact-form textarea:focus {
  border-color: var(--amber);
  background: rgba(255,181,71,0.03);
  box-shadow: 0 0 0 3px rgba(255,181,71,0.1);
}
.ul-contact-form textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
  margin-bottom: 10px;
}
.ul-contact-form > input[name="address"] { margin-bottom: 10px; }
.ul-form-meta {
  font-size: 11px;
  color: var(--text-lo);
  margin: 14px 0 12px;
  font-family: var(--mono);
  letter-spacing: 0.01em;
}
.ul-form-meta b { color: var(--amber); font-weight: 600; }
.ul-form-status {
  min-height: 20px;
  font-size: 13px;
  margin-bottom: 12px;
  padding: 0;
  transition: all 0.25s;
  line-height: 1.5;
}
.ul-form-status.pending {
  color: var(--text-mid);
  padding: 10px 14px;
  background: rgba(255,255,255,0.04);
  border-radius: var(--radius-sm);
}
.ul-form-status.ok {
  color: #4ade80;
  padding: 12px 14px;
  background: rgba(74,222,128,0.08);
  border: 1px solid rgba(74,222,128,0.25);
  border-radius: var(--radius-sm);
}
.ul-form-status.err {
  color: #ff6b6b;
  padding: 12px 14px;
  background: rgba(255,107,107,0.08);
  border: 1px solid rgba(255,107,107,0.25);
  border-radius: var(--radius-sm);
}
.ul-contact-form button[type="submit"] {
  width: 100%;
  padding: 16px;
  background: linear-gradient(180deg, var(--amber), var(--amber-deep));
  color: #1a0a00;
  border: 0;
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 16px rgba(255,181,71,0.25);
}
.ul-contact-form button[type="submit"]:hover:not(:disabled) {
  box-shadow: 0 8px 24px rgba(255,181,71,0.4);
  transform: translateY(-1px);
}
.ul-contact-form button[type="submit"]:disabled {
  opacity: 0.55;
  cursor: wait;
  box-shadow: none;
  transform: none;
}
@media (max-width: 900px) {
  .ul-contact-grid { grid-template-columns: 1fr; gap: 20px; }
  .ul-contact-form { padding: 28px 20px; }
  .ul-contact-form .ul-form-row { grid-template-columns: 1fr; }
  .ul-contact-info { padding: 24px 20px; }
}
`;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  /* 1. Set Site.contactEmail */
  const up = await client.query(
    `UPDATE "Site" SET "contactEmail" = $1, "updatedAt" = NOW()
      WHERE id = $2 RETURNING "contactEmail"`,
    [CONTACT_EMAIL, SITE_ID],
  );
  console.log(`✓ Site.contactEmail = ${up.rows[0]?.contactEmail}`);

  /* 2. Replace contact.html Page.content */
  const page = await client.query(
    `SELECT id FROM "Page" WHERE "siteId"=$1 AND lang='ko' AND slug='contact' LIMIT 1`,
    [SITE_ID],
  );
  if (page.rowCount === 0) throw new Error("contact page not found");
  await client.query(
    `UPDATE "Page" SET content = $1::jsonb, "updatedAt"=NOW() WHERE id = $2`,
    [JSON.stringify({ html: NEW_CONTACT_HTML }), page.rows[0].id],
  );
  console.log(`✓ Page(contact).content updated (${NEW_CONTACT_HTML.length} chars)`);

  /* 3. CSS additions */
  for (const [table, id] of [["Site", SITE_ID], ["Template", TEMPLATE_ID]]) {
    const r = await client.query(`SELECT "cssText" FROM "${table}" WHERE id=$1`, [id]);
    if (r.rowCount === 0) continue;
    const cur = r.rows[0].cssText || "";
    if (cur.includes(EXTRA_CSS_MARKER)) {
      console.log(`  · ${table} CSS already has contact-form rules`);
      continue;
    }
    const next = cur + "\n" + EXTRA_CSS.trim() + "\n";
    await client.query(`UPDATE "${table}" SET "cssText"=$1 WHERE id=$2`, [next, id]);
    console.log(`  ✓ ${table} cssText: ${cur.length} → ${next.length}`);
  }

  await client.end();
  console.log(`\n✓ done. Verify: https://home.homenshop.com/unionled/ko/contact.html`);
  console.log(`\n⚠ NOTE: Set RESEND_API_KEY in /var/www/homenshop-next/.env first,`);
  console.log(`  then: pm2 restart homenshop-next`);
  console.log(`  Free Resend account: https://resend.com/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
