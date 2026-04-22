/**
 * Seed the "Agency" modern template (2026-04-22).
 *
 * D-36 is used by 8 live sites (6 published) so in-place upgrade was
 * ruled out. Instead we add a brand-new template with its full content
 * (header / menu / footer / CSS / pages) stored in the DB — no legacy
 * disk files needed.
 *
 * Rules followed:
 *  - Atomic layering: every title/text/image/button is its own
 *    `.dragable` with an obj_* ID so the editor LayerPanel can select
 *    each element individually.
 *  - Text layers carry the `sol-replacible-text` marker.
 *  - Card groups use `de-group` so they serialize as a single wrapper.
 *  - Images use the Pexels proxy with absolute URLs
 *    (`https://homenshop.com/api/img?q=...`) per the 2026-04-21 rule.
 *  - headerHtml contains `<nav>` with page links; menuHtml is the empty
 *    `<div id="hns_menu"></div>` wrapper so the publisher's dedup rule
 *    doesn't render two nav bars.
 *
 * Run on the server:
 *   DATABASE_URL="$(grep DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '"')" \
 *     node /tmp/seed-agency-template.mjs
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const IMG = (q, w, h) =>
  `https://homenshop.com/api/img?q=${encodeURIComponent(q)}&w=${w}&h=${h}`;

/* ═══════════════════════════════════════════════════════════════════
 *  HEADER / MENU / FOOTER (site-wide, shared across pages)
 * ═══════════════════════════════════════════════════════════════════ */

const headerHtml = `
<div class="agency-header">
  <div class="agency-header-inner">
    <a href="index.html" class="agency-brand">
      <span class="agency-brand-mark">A</span>
      <span class="agency-brand-name">Agency</span>
    </a>
    <nav class="agency-nav">
      <a href="index.html">홈</a>
      <a href="about.html">소개</a>
      <a href="services.html">서비스</a>
      <a href="portfolio.html">포트폴리오</a>
      <a href="contact.html">문의</a>
    </nav>
    <a href="contact.html" class="agency-header-cta">
      <i class="fa-solid fa-arrow-right-long"></i>
      프로젝트 문의
    </a>
  </div>
</div>
`.trim();

// Publisher dedup rule: nav lives in headerHtml only.
const menuHtml = `<div id="hns_menu"></div>`;

const footerHtml = `
<div class="agency-footer">
  <div class="agency-footer-inner">
    <div class="agency-footer-grid">
      <div class="agency-footer-brand">
        <div class="agency-brand">
          <span class="agency-brand-mark agency-brand-mark--dark">A</span>
          <span class="agency-brand-name" style="color:#fff;">Agency</span>
        </div>
        <p class="agency-footer-about">
          브랜드·프로덕트·디지털 전방위를 설계하는 종합 크리에이티브 스튜디오.
        </p>
      </div>
      <div>
        <h4 class="agency-footer-heading">서비스</h4>
        <ul class="agency-footer-list">
          <li><a href="services.html">브랜딩</a></li>
          <li><a href="services.html">웹 디자인</a></li>
          <li><a href="services.html">모바일 앱</a></li>
          <li><a href="services.html">마케팅</a></li>
        </ul>
      </div>
      <div>
        <h4 class="agency-footer-heading">회사</h4>
        <ul class="agency-footer-list">
          <li><a href="about.html">소개</a></li>
          <li><a href="portfolio.html">포트폴리오</a></li>
          <li><a href="contact.html">문의하기</a></li>
          <li><a href="#">채용 정보</a></li>
        </ul>
      </div>
      <div>
        <h4 class="agency-footer-heading">연락처</h4>
        <ul class="agency-footer-list agency-footer-list--plain">
          <li><i class="fa-solid fa-envelope"></i> hello@agency.example</li>
          <li><i class="fa-solid fa-phone"></i> 02-0000-0000</li>
          <li><i class="fa-solid fa-location-dot"></i> 서울특별시 강남구</li>
        </ul>
      </div>
    </div>
    <div class="agency-footer-bottom">
      <span>&copy; 2026 Agency. All rights reserved.</span>
      <div class="agency-footer-social">
        <a href="#" aria-label="Instagram"><i class="fa-brands fa-instagram"></i></a>
        <a href="#" aria-label="LinkedIn"><i class="fa-brands fa-linkedin-in"></i></a>
        <a href="#" aria-label="Behance"><i class="fa-brands fa-behance"></i></a>
      </div>
    </div>
  </div>
</div>
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  SITE CSS — brand tokens + section / component styles
 * ═══════════════════════════════════════════════════════════════════ */

const cssText = `
/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root {
  --brand-color: #0f172a;
  --brand-accent: #f97316;
  --brand-ink: #0f172a;
  --brand-soft: #f8fafc;
  --brand-border: #e5e7eb;
  --brand-muted: #64748b;
  --brand-font: 'Pretendard Variable', Pretendard, 'Noto Sans KR', system-ui, sans-serif;
}
/* HNS-THEME-TOKENS:END */

body { margin: 0; font-family: var(--brand-font); color: var(--brand-ink); background: #fff; }
a { color: inherit; text-decoration: none; }
* { box-sizing: border-box; }

/* ─── Header ─── */
.agency-header { position: sticky; top: 0; z-index: 50; background: rgba(255,255,255,0.88); backdrop-filter: saturate(160%) blur(10px); border-bottom: 1px solid var(--brand-border); }
.agency-header-inner { max-width: 100%; margin: 0; padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; gap: 32px; }
.agency-brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.05rem; letter-spacing: -0.02em; color: var(--brand-ink); }
.agency-brand-mark { width: 32px; height: 32px; border-radius: 9px; background: var(--brand-ink); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 14px; letter-spacing: -0.02em; }
.agency-brand-mark--dark { background: var(--brand-accent); }
.agency-nav { display: flex; gap: 28px; font-size: 14px; font-weight: 500; color: var(--brand-muted); }
.agency-nav a { transition: color 0.15s; }
.agency-nav a:hover { color: var(--brand-ink); }
.agency-header-cta { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--brand-ink); color: #fff !important; border-radius: 999px; font-size: 13px; font-weight: 600; transition: background 0.15s, transform 0.15s; }
.agency-header-cta:hover { background: var(--brand-accent); transform: translateY(-1px); }
.agency-header-cta i { font-size: 11px; }

/* ─── Common wrappers ─── */
.agency-sec { padding: 96px 24px; }
.agency-sec--dark { background: var(--brand-ink); color: #fff; }
.agency-sec--soft { background: var(--brand-soft); }
.agency-wrap { max-width: 100%; margin: 0; }
.agency-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 5px 12px; background: rgba(249,115,22,0.12); color: var(--brand-accent); border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; }

/* ─── Buttons ─── */
.agency-btn { display: inline-flex; align-items: center; gap: 8px; padding: 13px 22px; border-radius: 10px; font-weight: 600; font-size: 14px; transition: all 0.2s; cursor: pointer; border: 0; }
.agency-btn--primary { background: var(--brand-ink); color: #fff; }
.agency-btn--primary:hover { background: var(--brand-accent); transform: translateY(-2px); box-shadow: 0 10px 22px -8px rgba(249,115,22,0.55); }
.agency-btn--outline { background: transparent; color: var(--brand-ink); border: 1.5px solid var(--brand-border); }
.agency-btn--outline:hover { border-color: var(--brand-ink); background: var(--brand-ink); color: #fff; }

/* ─── Hero ─── */
.agency-hero { padding: 120px 24px 80px; position: relative; overflow: hidden; background: radial-gradient(120% 80% at 10% -10%, rgba(249,115,22,0.08), transparent 55%), radial-gradient(100% 60% at 100% 0%, rgba(15,23,42,0.05), transparent 55%), #fff; }
.agency-hero-grid { max-width: 100%; margin: 0; display: grid; grid-template-columns: 1.1fr 1fr; gap: 64px; align-items: center; }
.agency-hero h1 { font-size: 3.6rem; line-height: 1.08; margin: 20px 0 22px; letter-spacing: -0.03em; font-weight: 800; }
.agency-hero h1 em { font-style: normal; color: var(--brand-accent); }
.agency-hero p.lead { font-size: 1.1rem; line-height: 1.7; color: var(--brand-muted); margin: 0 0 32px; max-width: 520px; }
.agency-hero-ctas { display: flex; gap: 10px; flex-wrap: wrap; }
.agency-hero-media { position: relative; border-radius: 22px; overflow: hidden; aspect-ratio: 4/5; background: #f1f5f9; }
.agency-hero-media img { width: 100%; height: 100%; object-fit: cover; }
.agency-hero-badge { position: absolute; bottom: 22px; left: 22px; right: 22px; padding: 16px 20px; border-radius: 14px; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); display: flex; align-items: center; gap: 14px; }
.agency-hero-badge-num { font-size: 1.7rem; font-weight: 800; letter-spacing: -0.02em; color: var(--brand-ink); }
.agency-hero-badge-txt { font-size: 12.5px; line-height: 1.4; color: var(--brand-muted); }

/* ─── Marquee (client logos) ─── */
.agency-marquee { padding: 36px 24px; border-top: 1px solid var(--brand-border); border-bottom: 1px solid var(--brand-border); background: #fff; }
.agency-marquee-inner { max-width: 100%; margin: 0; display: flex; align-items: center; justify-content: space-between; gap: 40px; flex-wrap: wrap; }
.agency-marquee span { font-weight: 700; font-size: 1.1rem; color: var(--brand-muted); letter-spacing: -0.01em; opacity: 0.6; transition: opacity 0.2s; }
.agency-marquee span:hover { opacity: 1; color: var(--brand-ink); }

/* ─── Services grid ─── */
.agency-svc-head { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: end; margin-bottom: 48px; }
.agency-h2 { font-size: 2.6rem; line-height: 1.12; letter-spacing: -0.025em; margin: 12px 0 0; font-weight: 800; }
.agency-muted { color: var(--brand-muted); line-height: 1.7; font-size: 0.98rem; }
.agency-svc-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.agency-svc-card { padding: 32px 28px; border-radius: 18px; background: #fff; border: 1px solid var(--brand-border); transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s; }
.agency-svc-card:hover { transform: translateY(-4px); border-color: var(--brand-ink); box-shadow: 0 20px 40px -20px rgba(15,23,42,0.18); }
.agency-svc-icon { width: 52px; height: 52px; border-radius: 14px; background: var(--brand-soft); display: grid; place-items: center; color: var(--brand-accent); font-size: 22px; margin-bottom: 22px; }
.agency-svc-card h3 { margin: 0 0 10px; font-size: 1.15rem; font-weight: 700; letter-spacing: -0.01em; }
.agency-svc-card p { margin: 0; color: var(--brand-muted); font-size: 14px; line-height: 1.65; }

/* ─── Work grid (portfolio/featured) ─── */
.agency-work-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 20px; }
.agency-work-card { grid-column: span 6; border-radius: 20px; overflow: hidden; position: relative; aspect-ratio: 5/4; background: #0f172a; }
.agency-work-card:nth-child(3n+1) { grid-column: span 8; }
.agency-work-card:nth-child(3n+2) { grid-column: span 4; }
.agency-work-card:nth-child(3n+3) { grid-column: span 12; aspect-ratio: 21/9; }
.agency-work-card img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s; }
.agency-work-card:hover img { transform: scale(1.05); }
.agency-work-meta { position: absolute; inset: auto 0 0 0; padding: 24px; color: #fff; background: linear-gradient(0deg, rgba(15,23,42,0.85), transparent); display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
.agency-work-tag { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.75; }
.agency-work-title { margin: 3px 0 0; font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em; }
.agency-work-arrow { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.14); display: grid; place-items: center; flex-shrink: 0; }

/* ─── Stats band (dark) ─── */
.agency-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.agency-stat { text-align: left; }
.agency-stat-num { font-size: 2.8rem; font-weight: 800; letter-spacing: -0.02em; color: var(--brand-accent); margin: 0; line-height: 1; }
.agency-stat-lbl { margin: 8px 0 0; color: rgba(255,255,255,0.66); font-size: 14px; }

/* ─── CTA band ─── */
.agency-cta { position: relative; overflow: hidden; border-radius: 28px; padding: 72px 48px; background: var(--brand-ink); color: #fff; text-align: center; }
.agency-cta::before { content: ""; position: absolute; inset: -40% -20% auto auto; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(circle, rgba(249,115,22,0.45), transparent 65%); pointer-events: none; }
.agency-cta h2 { font-size: 2.6rem; letter-spacing: -0.025em; margin: 0 0 14px; font-weight: 800; }
.agency-cta p { margin: 0 0 28px; color: rgba(255,255,255,0.75); font-size: 1.05rem; }
.agency-cta .agency-btn--primary { background: var(--brand-accent); }
.agency-cta .agency-btn--primary:hover { background: #fff; color: var(--brand-ink); }

/* ─── Team grid ─── */
.agency-team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.agency-team-card { }
.agency-team-photo { aspect-ratio: 4/5; border-radius: 18px; overflow: hidden; background: #f1f5f9; margin-bottom: 14px; }
.agency-team-photo img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.4s; }
.agency-team-card:hover .agency-team-photo img { transform: scale(1.04); }
.agency-team-card h4 { margin: 0; font-size: 1rem; font-weight: 700; }
.agency-team-card p { margin: 2px 0 0; color: var(--brand-muted); font-size: 13px; }

/* ─── Process ─── */
.agency-proc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.agency-proc-step { padding: 28px 24px; border-left: 2px solid var(--brand-accent); }
.agency-proc-num { color: var(--brand-accent); font-weight: 800; font-size: 14px; letter-spacing: 0.04em; }
.agency-proc-step h4 { margin: 6px 0 8px; font-size: 1.08rem; font-weight: 700; }
.agency-proc-step p { margin: 0; color: var(--brand-muted); font-size: 14px; line-height: 1.6; }

/* ─── Testimonials ─── */
.agency-quote-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.agency-quote-card { padding: 28px; border-radius: 18px; background: #fff; border: 1px solid var(--brand-border); }
.agency-quote-card .stars { color: var(--brand-accent); font-size: 13px; margin-bottom: 14px; letter-spacing: 2px; }
.agency-quote-card p { margin: 0 0 20px; font-size: 0.98rem; line-height: 1.7; color: #1f2937; }
.agency-quote-meta { display: flex; align-items: center; gap: 12px; }
.agency-quote-avatar { width: 42px; height: 42px; border-radius: 50%; overflow: hidden; background: #f1f5f9; }
.agency-quote-avatar img { width: 100%; height: 100%; object-fit: cover; }
.agency-quote-meta b { display: block; font-size: 13px; font-weight: 700; }
.agency-quote-meta span { font-size: 12px; color: var(--brand-muted); }

/* ─── Contact ─── */
.agency-contact-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: start; }
.agency-contact-info ul { list-style: none; padding: 0; margin: 24px 0 0; display: flex; flex-direction: column; gap: 14px; }
.agency-contact-info li { display: flex; gap: 12px; align-items: flex-start; font-size: 15px; color: #334155; }
.agency-contact-info i { color: var(--brand-accent); margin-top: 3px; width: 18px; }
.agency-contact-info b { display: block; margin-bottom: 2px; color: var(--brand-ink); }
.agency-contact-form { padding: 32px; border-radius: 18px; background: #fff; border: 1px solid var(--brand-border); display: flex; flex-direction: column; gap: 14px; }
.agency-contact-form input,
.agency-contact-form textarea { width: 100%; padding: 12px 14px; border: 1px solid var(--brand-border); border-radius: 8px; font-family: inherit; font-size: 14px; color: var(--brand-ink); }
.agency-contact-form input:focus,
.agency-contact-form textarea:focus { outline: 0; border-color: var(--brand-ink); }
.agency-contact-form textarea { resize: vertical; min-height: 120px; }
.agency-contact-form button { padding: 13px 22px; background: var(--brand-ink); color: #fff; border: 0; border-radius: 10px; font-weight: 600; cursor: pointer; font-family: inherit; font-size: 14px; transition: background 0.15s; }
.agency-contact-form button:hover { background: var(--brand-accent); }

/* ─── Footer ─── */
.agency-footer { background: #0a0f1c; color: #cbd5e1; }
.agency-footer-inner { max-width: 100%; margin: 0; padding: 64px 24px 24px; }
.agency-footer-grid { display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: 40px; padding-bottom: 40px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.agency-footer-about { margin: 16px 0 0; font-size: 13.5px; line-height: 1.7; color: rgba(255,255,255,0.55); }
.agency-footer-heading { margin: 0 0 14px; color: #fff; font-size: 14px; font-weight: 700; }
.agency-footer-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.agency-footer-list a { color: rgba(255,255,255,0.55); font-size: 13.5px; transition: color 0.15s; }
.agency-footer-list a:hover { color: #fff; }
.agency-footer-list--plain li { color: rgba(255,255,255,0.55); font-size: 13.5px; display: flex; align-items: center; gap: 8px; }
.agency-footer-list--plain i { color: var(--brand-accent); width: 14px; font-size: 12px; }
.agency-footer-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 24px; font-size: 12px; color: rgba(255,255,255,0.4); }
.agency-footer-social { display: flex; gap: 8px; }
.agency-footer-social a { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 50%; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.65); transition: all 0.15s; }
.agency-footer-social a:hover { background: var(--brand-accent); color: #fff; }

/* ─── Responsive (tablet + mobile) ─── */
@media (max-width: 1024px) {
  .agency-hero-grid, .agency-svc-head, .agency-contact-grid { grid-template-columns: 1fr; gap: 40px; }
  .agency-hero h1 { font-size: 2.6rem; }
  .agency-work-card,
  .agency-work-card:nth-child(3n+1),
  .agency-work-card:nth-child(3n+2),
  .agency-work-card:nth-child(3n+3) { grid-column: span 12; aspect-ratio: 4/3; }
  .agency-svc-grid, .agency-stats-grid, .agency-team-grid, .agency-quote-grid, .agency-proc-grid { grid-template-columns: repeat(2, 1fr); }
  .agency-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
}
@media (max-width: 640px) {
  .agency-sec { padding: 64px 20px; }
  .agency-hero { padding: 72px 20px 48px; }
  .agency-hero h1 { font-size: 2rem; }
  .agency-h2 { font-size: 1.9rem; }
  .agency-nav { display: none; }
  .agency-svc-grid, .agency-stats-grid, .agency-team-grid, .agency-quote-grid, .agency-proc-grid { grid-template-columns: 1fr; }
  .agency-cta { padding: 48px 24px; }
  .agency-cta h2 { font-size: 1.9rem; }
  .agency-footer-grid { grid-template-columns: 1fr; }
  .agency-footer-bottom { flex-direction: column; gap: 16px; }
}
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  PAGES — 5 pages (index / about / services / portfolio / contact)
 *  Every text / image / button is its own `.dragable` so the editor
 *  LayerPanel can target them individually.
 * ═══════════════════════════════════════════════════════════════════ */

let uidSeq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;

function pageHome() {
  const sec1 = uid("obj_sec"), t1 = uid("obj_title"), p1 = uid("obj_text"), b1 = uid("obj_btn"), b2 = uid("obj_btn"), img1 = uid("obj_img"), stat1 = uid("obj_text");
  const sec2 = uid("obj_sec");
  const sec3 = uid("obj_sec"), eye3 = uid("obj_text"), t3 = uid("obj_title"), lead3 = uid("obj_text");
  const sv1 = uid("obj_card"), sv1t = uid("obj_title"), sv1p = uid("obj_text");
  const sv2 = uid("obj_card"), sv2t = uid("obj_title"), sv2p = uid("obj_text");
  const sv3 = uid("obj_card"), sv3t = uid("obj_title"), sv3p = uid("obj_text");
  const sv4 = uid("obj_card"), sv4t = uid("obj_title"), sv4p = uid("obj_text");
  const sv5 = uid("obj_card"), sv5t = uid("obj_title"), sv5p = uid("obj_text");
  const sv6 = uid("obj_card"), sv6t = uid("obj_title"), sv6p = uid("obj_text");
  const sec4 = uid("obj_sec"), eye4 = uid("obj_text"), t4 = uid("obj_title");
  const w1 = uid("obj_card"), w1img = uid("obj_img");
  const w2 = uid("obj_card"), w2img = uid("obj_img");
  const w3 = uid("obj_card"), w3img = uid("obj_img");
  const sec5 = uid("obj_sec"), eye5 = uid("obj_text"), t5 = uid("obj_title");
  const st1 = uid("obj_text"), st2 = uid("obj_text"), st3 = uid("obj_text"), st4 = uid("obj_text");
  const sec6 = uid("obj_sec"), ctat = uid("obj_title"), ctap = uid("obj_text"), ctab = uid("obj_btn");

  return `
<div class="dragable" id="${sec1}">
  <section class="agency-hero">
    <div class="agency-hero-grid">
      <div>
        <span class="agency-eyebrow"><i class="fa-solid fa-sparkles"></i> 크리에이티브 스튜디오</span>
        <div class="dragable sol-replacible-text" id="${t1}"><h1>브랜드를 <em>다시 태어나게</em><br/>하는 디자인 파트너</h1></div>
        <div class="dragable sol-replacible-text" id="${p1}"><p class="lead">리브랜딩·웹·앱·영상까지, 고객의 비즈니스가 시장에서 한 단계 도약할 수 있도록 설계부터 실행까지 함께합니다.</p></div>
        <div class="agency-hero-ctas">
          <div class="dragable" id="${b1}"><a href="contact.html" class="agency-btn agency-btn--primary">프로젝트 시작하기 <i class="fa-solid fa-arrow-right-long"></i></a></div>
          <div class="dragable" id="${b2}"><a href="portfolio.html" class="agency-btn agency-btn--outline">작업 살펴보기</a></div>
        </div>
      </div>
      <div class="dragable" id="${img1}">
        <div class="agency-hero-media">
          <img src="${IMG("minimal modern design studio workspace", 900, 1100)}" alt="Hero" />
          <div class="agency-hero-badge">
            <div class="dragable sol-replacible-text" id="${stat1}"><div class="agency-hero-badge-num">12년+</div></div>
            <div class="agency-hero-badge-txt">320+ 프로젝트<br/>NPS 68</div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sec2}">
  <section class="agency-marquee">
    <div class="agency-marquee-inner">
      <span>NEON</span><span>PULSE</span><span>ATLAS</span><span>NORTH&amp;CO</span><span>OVERTIME</span><span>VERTEX</span><span>HALO</span>
    </div>
  </section>
</div>

<div class="dragable" id="${sec3}">
  <section class="agency-sec">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye3}"><span class="agency-eyebrow">SERVICES</span></div>
          <div class="dragable sol-replacible-text" id="${t3}"><h2 class="agency-h2">브랜드부터 디지털까지,<br/>6가지 서비스를 제공합니다</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${lead3}"><p class="agency-muted">작은 스타트업부터 글로벌 기업까지, 사업 단계에 맞는 솔루션을 제시합니다. 어떤 프로젝트든 전담 팀이 배정되어 End-to-End로 진행됩니다.</p></div>
      </div>
      <div class="agency-svc-grid">
        <div class="dragable de-group" id="${sv1}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-palette"></i></div>
            <div class="dragable sol-replacible-text" id="${sv1t}"><h3>브랜드 아이덴티티</h3></div>
            <div class="dragable sol-replacible-text" id="${sv1p}"><p>로고·컬러·타이포·보이스까지, 일관된 브랜드 시스템을 구축합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${sv2}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-display"></i></div>
            <div class="dragable sol-replacible-text" id="${sv2t}"><h3>웹사이트 · 커머스</h3></div>
            <div class="dragable sol-replacible-text" id="${sv2p}"><p>반응형 웹사이트부터 커머스 플랫폼까지, 전환을 끌어올리는 구조를 설계합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${sv3}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-mobile-screen"></i></div>
            <div class="dragable sol-replacible-text" id="${sv3t}"><h3>모바일 앱 UX</h3></div>
            <div class="dragable sol-replacible-text" id="${sv3p}"><p>리테이너, 플로우, 컴포넌트 라이브러리까지 프로덕트 디자인을 총괄합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${sv4}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-video"></i></div>
            <div class="dragable sol-replacible-text" id="${sv4t}"><h3>영상 · 모션</h3></div>
            <div class="dragable sol-replacible-text" id="${sv4p}"><p>브랜드 필름·프로덕트 영상·모션 그래픽으로 이야기를 전달합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${sv5}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-chart-line"></i></div>
            <div class="dragable sol-replacible-text" id="${sv5t}"><h3>퍼포먼스 마케팅</h3></div>
            <div class="dragable sol-replacible-text" id="${sv5p}"><p>광고 크리에이티브·CRM·검색까지 데이터 기반 그로스를 실행합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${sv6}">
          <div class="agency-svc-card">
            <div class="agency-svc-icon"><i class="fa-solid fa-lightbulb"></i></div>
            <div class="dragable sol-replacible-text" id="${sv6t}"><h3>전략 컨설팅</h3></div>
            <div class="dragable sol-replacible-text" id="${sv6p}"><p>포지셔닝, 네이밍, 시장 진입 전략을 공동 설계하고 함께 검증합니다.</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sec4}">
  <section class="agency-sec agency-sec--soft">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye4}"><span class="agency-eyebrow">SELECTED WORK</span></div>
          <div class="dragable sol-replacible-text" id="${t4}"><h2 class="agency-h2">최근 함께한 프로젝트</h2></div>
        </div>
      </div>
      <div class="agency-work-grid">
        <div class="dragable de-group" id="${w1}">
          <a href="portfolio.html" class="agency-work-card">
            <div class="dragable" id="${w1img}"><img src="${IMG("minimal product packaging design", 1200, 800)}" alt="Neon Rebrand" /></div>
            <div class="agency-work-meta">
              <div>
                <div class="agency-work-tag">Branding · 2025</div>
                <h3 class="agency-work-title">Neon — Full Rebrand</h3>
              </div>
              <div class="agency-work-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
            </div>
          </a>
        </div>
        <div class="dragable de-group" id="${w2}">
          <a href="portfolio.html" class="agency-work-card">
            <div class="dragable" id="${w2img}"><img src="${IMG("modern mobile app interface design", 900, 1200)}" alt="Pulse App" /></div>
            <div class="agency-work-meta">
              <div>
                <div class="agency-work-tag">Mobile App · 2025</div>
                <h3 class="agency-work-title">Pulse — iOS / Android</h3>
              </div>
              <div class="agency-work-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
            </div>
          </a>
        </div>
        <div class="dragable de-group" id="${w3}">
          <a href="portfolio.html" class="agency-work-card">
            <div class="dragable" id="${w3img}"><img src="${IMG("atlas travel magazine editorial layout", 1800, 900)}" alt="Atlas Editorial" /></div>
            <div class="agency-work-meta">
              <div>
                <div class="agency-work-tag">Editorial · Print · 2024</div>
                <h3 class="agency-work-title">Atlas — Quarterly Magazine</h3>
              </div>
              <div class="agency-work-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
            </div>
          </a>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sec5}">
  <section class="agency-sec agency-sec--dark">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye5}"><span class="agency-eyebrow" style="background:rgba(249,115,22,0.18);">BY THE NUMBERS</span></div>
          <div class="dragable sol-replacible-text" id="${t5}"><h2 class="agency-h2" style="color:#fff;">숫자로 보는 Agency</h2></div>
        </div>
      </div>
      <div class="agency-stats-grid">
        <div class="dragable sol-replacible-text" id="${st1}"><div class="agency-stat"><p class="agency-stat-num">320+</p><p class="agency-stat-lbl">완료 프로젝트</p></div></div>
        <div class="dragable sol-replacible-text" id="${st2}"><div class="agency-stat"><p class="agency-stat-num">84%</p><p class="agency-stat-lbl">리텐션 · 재계약률</p></div></div>
        <div class="dragable sol-replacible-text" id="${st3}"><div class="agency-stat"><p class="agency-stat-num">12년</p><p class="agency-stat-lbl">업계 경력</p></div></div>
        <div class="dragable sol-replacible-text" id="${st4}"><div class="agency-stat"><p class="agency-stat-num">24개국</p><p class="agency-stat-lbl">고객 분포</p></div></div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sec6}">
  <section class="agency-sec">
    <div class="agency-wrap">
      <div class="agency-cta">
        <div class="dragable sol-replacible-text" id="${ctat}"><h2>다음 프로젝트, 함께 시작할까요?</h2></div>
        <div class="dragable sol-replacible-text" id="${ctap}"><p>간단한 양식을 채워주시면 24시간 내에 제안 프로세스를 안내드립니다.</p></div>
        <div class="dragable" id="${ctab}"><a href="contact.html" class="agency-btn agency-btn--primary">지금 문의하기 <i class="fa-solid fa-arrow-right-long"></i></a></div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageAbout() {
  const s1 = uid("obj_sec"), t1 = uid("obj_title"), p1 = uid("obj_text");
  const s2 = uid("obj_sec"), eye2 = uid("obj_text"), t2 = uid("obj_title"), p2 = uid("obj_text"), img2 = uid("obj_img");
  const s3 = uid("obj_sec"), eye3 = uid("obj_text"), t3 = uid("obj_title");
  const m1 = uid("obj_card"), m1i = uid("obj_img"), m1h = uid("obj_title"), m1p = uid("obj_text");
  const m2 = uid("obj_card"), m2i = uid("obj_img"), m2h = uid("obj_title"), m2p = uid("obj_text");
  const m3 = uid("obj_card"), m3i = uid("obj_img"), m3h = uid("obj_title"), m3p = uid("obj_text");
  const m4 = uid("obj_card"), m4i = uid("obj_img"), m4h = uid("obj_title"), m4p = uid("obj_text");
  return `
<div class="dragable" id="${s1}">
  <section class="agency-hero" style="padding: 96px 24px 48px; text-align: center;">
    <div class="agency-wrap" style="max-width: 820px;">
      <span class="agency-eyebrow"><i class="fa-solid fa-flag"></i> ABOUT</span>
      <div class="dragable sol-replacible-text" id="${t1}"><h1 style="font-size: 3rem; margin: 18px 0;">디자인으로 비즈니스를<br/>한 단계 끌어올립니다</h1></div>
      <div class="dragable sol-replacible-text" id="${p1}"><p class="lead" style="margin: 0 auto;">Agency는 2013년에 설립되어 지난 12년 동안 스타트업·엔터프라이즈·공공기관까지 다양한 고객과 320개 이상의 프로젝트를 함께해왔습니다.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="agency-sec">
    <div class="agency-wrap">
      <div class="agency-hero-grid">
        <div>
          <div class="dragable sol-replacible-text" id="${eye2}"><span class="agency-eyebrow">OUR MISSION</span></div>
          <div class="dragable sol-replacible-text" id="${t2}"><h2 class="agency-h2" style="margin-top: 14px;">복잡함은 덜어내고,<br/>본질은 더 또렷하게</h2></div>
          <div class="dragable sol-replacible-text" id="${p2}"><p class="agency-muted" style="margin-top: 20px; font-size: 1.05rem;">디자인은 장식이 아니라 문제를 푸는 도구라고 믿습니다. 우리는 브랜드의 본질에 집중하고, 사용자에게 도움이 되는 경험을 만들기 위해 근본적인 질문부터 다시 던집니다.</p></div>
        </div>
        <div class="dragable" id="${img2}">
          <div style="border-radius: 22px; overflow: hidden; aspect-ratio: 4/5; background: #f1f5f9;">
            <img src="${IMG("creative design team meeting workspace", 900, 1100)}" alt="Mission" style="width:100%;height:100%;object-fit:cover;" />
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${s3}">
  <section class="agency-sec agency-sec--soft">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye3}"><span class="agency-eyebrow">TEAM</span></div>
          <div class="dragable sol-replacible-text" id="${t3}"><h2 class="agency-h2">함께하는 사람들</h2></div>
        </div>
      </div>
      <div class="agency-team-grid">
        <div class="dragable de-group" id="${m1}">
          <div class="agency-team-card">
            <div class="dragable" id="${m1i}"><div class="agency-team-photo"><img src="${IMG("professional woman designer portrait", 600, 750)}" alt="Team 1" /></div></div>
            <div class="dragable sol-replacible-text" id="${m1h}"><h4>이지우</h4></div>
            <div class="dragable sol-replacible-text" id="${m1p}"><p>Creative Director</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${m2}">
          <div class="agency-team-card">
            <div class="dragable" id="${m2i}"><div class="agency-team-photo"><img src="${IMG("professional man creative director portrait", 600, 750)}" alt="Team 2" /></div></div>
            <div class="dragable sol-replacible-text" id="${m2h}"><h4>박도윤</h4></div>
            <div class="dragable sol-replacible-text" id="${m2p}"><p>Head of Strategy</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${m3}">
          <div class="agency-team-card">
            <div class="dragable" id="${m3i}"><div class="agency-team-photo"><img src="${IMG("ux designer at laptop portrait", 600, 750)}" alt="Team 3" /></div></div>
            <div class="dragable sol-replacible-text" id="${m3h}"><h4>최서연</h4></div>
            <div class="dragable sol-replacible-text" id="${m3p}"><p>Lead Product Designer</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${m4}">
          <div class="agency-team-card">
            <div class="dragable" id="${m4i}"><div class="agency-team-photo"><img src="${IMG("developer working on laptop portrait", 600, 750)}" alt="Team 4" /></div></div>
            <div class="dragable sol-replacible-text" id="${m4h}"><h4>김한결</h4></div>
            <div class="dragable sol-replacible-text" id="${m4p}"><p>Engineering Lead</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageServices() {
  const s1 = uid("obj_sec"), t1 = uid("obj_title"), p1 = uid("obj_text");
  const s2 = uid("obj_sec"), eye2 = uid("obj_text"), t2 = uid("obj_title");
  const pc1 = uid("obj_card"), pc1t = uid("obj_title"), pc1p = uid("obj_text");
  const pc2 = uid("obj_card"), pc2t = uid("obj_title"), pc2p = uid("obj_text");
  const pc3 = uid("obj_card"), pc3t = uid("obj_title"), pc3p = uid("obj_text");
  const pc4 = uid("obj_card"), pc4t = uid("obj_title"), pc4p = uid("obj_text");
  const s3 = uid("obj_sec"), eye3 = uid("obj_text"), t3 = uid("obj_title");
  const q1 = uid("obj_card"), q1p = uid("obj_text"), q1m = uid("obj_text"), q1i = uid("obj_img");
  const q2 = uid("obj_card"), q2p = uid("obj_text"), q2m = uid("obj_text"), q2i = uid("obj_img");
  const q3 = uid("obj_card"), q3p = uid("obj_text"), q3m = uid("obj_text"), q3i = uid("obj_img");
  return `
<div class="dragable" id="${s1}">
  <section class="agency-hero" style="padding: 96px 24px 48px; text-align: center;">
    <div class="agency-wrap" style="max-width: 820px;">
      <span class="agency-eyebrow"><i class="fa-solid fa-cubes"></i> SERVICES</span>
      <div class="dragable sol-replacible-text" id="${t1}"><h1 style="font-size: 3rem; margin: 18px 0;">브랜드와 프로덕트를<br/>End-to-End로 설계합니다</h1></div>
      <div class="dragable sol-replacible-text" id="${p1}"><p class="lead" style="margin: 0 auto;">리서치부터 런칭까지, 한 팀이 책임지고 끝까지 갑니다. 사업 단계에 맞는 패키지를 조합해 제안드립니다.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="agency-sec">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye2}"><span class="agency-eyebrow">HOW WE WORK</span></div>
          <div class="dragable sol-replacible-text" id="${t2}"><h2 class="agency-h2">4단계 프로세스</h2></div>
        </div>
      </div>
      <div class="agency-proc-grid">
        <div class="dragable de-group" id="${pc1}">
          <div class="agency-proc-step">
            <div class="agency-proc-num">01 · DISCOVER</div>
            <div class="dragable sol-replacible-text" id="${pc1t}"><h4>리서치 · 진단</h4></div>
            <div class="dragable sol-replacible-text" id="${pc1p}"><p>인터뷰·데스크 리서치·경쟁 환경 분석으로 현재 상태와 기회를 진단합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${pc2}">
          <div class="agency-proc-step">
            <div class="agency-proc-num">02 · DEFINE</div>
            <div class="dragable sol-replacible-text" id="${pc2t}"><h4>전략 · 포지셔닝</h4></div>
            <div class="dragable sol-replacible-text" id="${pc2p}"><p>브랜드 포지셔닝과 핵심 메시지를 확정하고 실행 방향을 합의합니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${pc3}">
          <div class="agency-proc-step">
            <div class="agency-proc-num">03 · DESIGN</div>
            <div class="dragable sol-replacible-text" id="${pc3t}"><h4>디자인 · 구현</h4></div>
            <div class="dragable sol-replacible-text" id="${pc3p}"><p>비주얼·UX·UI·개발을 한 팀이 맞물려 진행합니다. 주 1회 리뷰로 방향을 맞춥니다.</p></div>
          </div>
        </div>
        <div class="dragable de-group" id="${pc4}">
          <div class="agency-proc-step">
            <div class="agency-proc-num">04 · DEPLOY</div>
            <div class="dragable sol-replacible-text" id="${pc4t}"><h4>런칭 · 성장</h4></div>
            <div class="dragable sol-replacible-text" id="${pc4p}"><p>런칭 이후 3개월 데이터 리포트와 개선 액션을 함께 제안합니다.</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${s3}">
  <section class="agency-sec agency-sec--soft">
    <div class="agency-wrap">
      <div class="agency-svc-head">
        <div>
          <div class="dragable sol-replacible-text" id="${eye3}"><span class="agency-eyebrow">TESTIMONIALS</span></div>
          <div class="dragable sol-replacible-text" id="${t3}"><h2 class="agency-h2">고객 후기</h2></div>
        </div>
      </div>
      <div class="agency-quote-grid">
        <div class="dragable de-group" id="${q1}">
          <div class="agency-quote-card">
            <div class="stars">★★★★★</div>
            <div class="dragable sol-replacible-text" id="${q1p}"><p>"리브랜딩 이후 전환율이 47% 뛰었습니다. 단순히 외형이 아니라 포지셔닝 자체를 다시 정의해준 덕분입니다."</p></div>
            <div class="agency-quote-meta">
              <div class="dragable" id="${q1i}"><div class="agency-quote-avatar"><img src="${IMG("professional woman founder portrait", 200, 200)}" alt="" /></div></div>
              <div class="dragable sol-replacible-text" id="${q1m}"><div><b>김민정</b><span>Neon · CEO</span></div></div>
            </div>
          </div>
        </div>
        <div class="dragable de-group" id="${q2}">
          <div class="agency-quote-card">
            <div class="stars">★★★★★</div>
            <div class="dragable sol-replacible-text" id="${q2p}"><p>"모호했던 프로덕트 방향이 1번의 워크샵으로 또렷해졌어요. 팀 모두가 공감할 수 있는 언어를 만들어줬습니다."</p></div>
            <div class="agency-quote-meta">
              <div class="dragable" id="${q2i}"><div class="agency-quote-avatar"><img src="${IMG("professional man startup founder portrait", 200, 200)}" alt="" /></div></div>
              <div class="dragable sol-replacible-text" id="${q2m}"><div><b>이준호</b><span>Pulse · CPO</span></div></div>
            </div>
          </div>
        </div>
        <div class="dragable de-group" id="${q3}">
          <div class="agency-quote-card">
            <div class="stars">★★★★★</div>
            <div class="dragable sol-replacible-text" id="${q3p}"><p>"납기·품질·커뮤니케이션 모두 예상 이상. 런칭 후에도 데이터 리포트로 계속 도와주시는 점이 최고입니다."</p></div>
            <div class="agency-quote-meta">
              <div class="dragable" id="${q3i}"><div class="agency-quote-avatar"><img src="${IMG("businesswoman marketing portrait", 200, 200)}" alt="" /></div></div>
              <div class="dragable sol-replacible-text" id="${q3m}"><div><b>박서영</b><span>Atlas · CMO</span></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pagePortfolio() {
  const s1 = uid("obj_sec"), t1 = uid("obj_title"), p1 = uid("obj_text");
  const s2 = uid("obj_sec");
  const cards = [
    { q: "neon skincare branding packaging", tag: "Branding", title: "Neon — Full Rebrand" },
    { q: "minimalist ecommerce website", tag: "Web · Commerce", title: "OverTime Store" },
    { q: "finance mobile app dashboard", tag: "Mobile App", title: "Pulse Finance" },
    { q: "editorial magazine layout", tag: "Editorial", title: "Atlas Quarterly" },
    { q: "architecture studio portfolio", tag: "Web · Studio", title: "North & Co." },
    { q: "fashion brand lookbook", tag: "Branding · Print", title: "Halo Lookbook" },
  ].map((c) => {
    const cid = uid("obj_card");
    const iid = uid("obj_img");
    return { ...c, cid, iid };
  });
  const grid = cards.map((c, i) => `
        <div class="dragable de-group" id="${c.cid}">
          <a href="#" class="agency-work-card">
            <div class="dragable" id="${c.iid}"><img src="${IMG(c.q, i % 2 ? 900 : 1200, i % 2 ? 1100 : 800)}" alt="${c.title}" /></div>
            <div class="agency-work-meta">
              <div>
                <div class="agency-work-tag">${c.tag} · 2025</div>
                <h3 class="agency-work-title">${c.title}</h3>
              </div>
              <div class="agency-work-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
            </div>
          </a>
        </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="agency-hero" style="padding: 96px 24px 48px; text-align: center;">
    <div class="agency-wrap" style="max-width: 820px;">
      <span class="agency-eyebrow"><i class="fa-solid fa-folder-open"></i> PORTFOLIO</span>
      <div class="dragable sol-replacible-text" id="${t1}"><h1 style="font-size: 3rem; margin: 18px 0;">최근 함께한 고객과<br/>런칭한 프로젝트들</h1></div>
      <div class="dragable sol-replacible-text" id="${p1}"><p class="lead" style="margin: 0 auto;">브랜딩·웹·앱·영상 카테고리별로 지난 3년 간 완료한 대표 프로젝트를 모았습니다.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="agency-sec agency-sec--soft">
    <div class="agency-wrap">
      <div class="agency-work-grid">${grid}
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageContact() {
  const s1 = uid("obj_sec"), t1 = uid("obj_title"), p1 = uid("obj_text");
  const s2 = uid("obj_sec"), eye2 = uid("obj_text"), h2 = uid("obj_title"), p2 = uid("obj_text"), info = uid("obj_text");
  return `
<div class="dragable" id="${s1}">
  <section class="agency-hero" style="padding: 96px 24px 48px; text-align: center;">
    <div class="agency-wrap" style="max-width: 820px;">
      <span class="agency-eyebrow"><i class="fa-solid fa-paper-plane"></i> CONTACT</span>
      <div class="dragable sol-replacible-text" id="${t1}"><h1 style="font-size: 3rem; margin: 18px 0;">프로젝트에 대해<br/>이야기해 볼까요?</h1></div>
      <div class="dragable sol-replacible-text" id="${p1}"><p class="lead" style="margin: 0 auto;">간단한 양식을 채워주시면 24시간 내에 담당자가 회신드립니다. 미팅·전화·이메일 중 편하신 방법을 선택해주세요.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="agency-sec">
    <div class="agency-wrap">
      <div class="agency-contact-grid">
        <div class="agency-contact-info">
          <div class="dragable sol-replacible-text" id="${eye2}"><span class="agency-eyebrow">GET IN TOUCH</span></div>
          <div class="dragable sol-replacible-text" id="${h2}"><h2 class="agency-h2" style="margin-top: 14px; font-size: 2rem;">여러 방법으로<br/>연락하실 수 있습니다</h2></div>
          <div class="dragable sol-replacible-text" id="${p2}"><p class="agency-muted" style="margin-top: 18px;">신규 프로젝트, 파트너십 제안, 채용 문의 모두 아래 연락처로 부탁드립니다.</p></div>
          <div class="dragable sol-replacible-text" id="${info}">
            <ul>
              <li><i class="fa-solid fa-envelope"></i><div><b>이메일</b>hello@agency.example</div></li>
              <li><i class="fa-solid fa-phone"></i><div><b>전화</b>02-0000-0000 (평일 10:00 – 19:00)</div></li>
              <li><i class="fa-solid fa-location-dot"></i><div><b>주소</b>서울특별시 강남구 테헤란로 123, 4층</div></li>
              <li><i class="fa-solid fa-calendar-check"></i><div><b>미팅 예약</b>하단 양식 작성 또는 이메일로 시간 제안</div></li>
            </ul>
          </div>
        </div>
        <form class="agency-contact-form" onsubmit="return false;">
          <input type="text" placeholder="회사·브랜드명" />
          <input type="text" placeholder="담당자 성함" />
          <input type="email" placeholder="이메일 주소" />
          <input type="tel" placeholder="연락처 (선택)" />
          <textarea placeholder="프로젝트 개요, 예산, 일정 등"></textarea>
          <button type="button">문의 보내기</button>
        </form>
      </div>
    </div>
  </section>
</div>
`.trim();
}

const pagesSnapshot = [
  { slug: "index",     title: "홈",        isHome: true,  showInMenu: true, sortOrder: 0, lang: "ko", content: { html: pageHome() } },
  { slug: "about",     title: "소개",      isHome: false, showInMenu: true, sortOrder: 1, lang: "ko", content: { html: pageAbout() } },
  { slug: "services",  title: "서비스",    isHome: false, showInMenu: true, sortOrder: 2, lang: "ko", content: { html: pageServices() } },
  { slug: "portfolio", title: "포트폴리오", isHome: false, showInMenu: true, sortOrder: 3, lang: "ko", content: { html: pagePortfolio() } },
  { slug: "contact",   title: "문의",      isHome: false, showInMenu: true, sortOrder: 4, lang: "ko", content: { html: pageContact() } },
];

/* ═══════════════════════════════════════════════════════════════════
 *  INSERT
 * ═══════════════════════════════════════════════════════════════════ */

const pool = new pg.Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    // System templates have userId = NULL. To be shown in the "공용
    // 템플릿" list, `userId IS NULL OR isPublic = true` must match — the
    // NULL userId alone is enough.
    const id = `tpl_agency_${Date.now().toString(36)}`;
    const path = `system/agency-redesign-${Date.now().toString(36)}`;
    const name = "Agency";
    const category = "business";
    const description = "모던 에이전시 · 스튜디오 · 크리에이티브 전문. 풀 리디자인된 5페이지 템플릿";
    const keywords = "agency,modern,studio,branding,business,minimal,portfolio,에이전시,스튜디오,브랜딩";
    const thumbnailUrl = IMG("minimal modern design studio workspace", 800, 600);

    // Sort = 1 so it lands at the top of the list (sortOrder asc = newest).
    const sortOrder = 1;

    // Exists check → upsert by name "Agency" to avoid dupes on re-run.
    const existing = await client.query(
      'SELECT id FROM "Template" WHERE name = $1 AND "userId" IS NULL LIMIT 1',
      [name],
    );
    if (existing.rows.length > 0) {
      const existingId = existing.rows[0].id;
      await client.query(
        `UPDATE "Template"
         SET path = $2, "headerHtml" = $3, "menuHtml" = $4, "footerHtml" = $5,
             "cssText" = $6, "pagesSnapshot" = $7::jsonb, category = $8,
             description = $9, keywords = $10, "thumbnailUrl" = $11,
             "sortOrder" = $12, "isActive" = true, "updatedAt" = NOW()
         WHERE id = $1`,
        [existingId, path, headerHtml, menuHtml, footerHtml, cssText,
         JSON.stringify(pagesSnapshot), category, description, keywords,
         thumbnailUrl, sortOrder],
      );
      console.log(`✓ Updated existing Agency template: ${existingId}`);
    } else {
      await client.query(
        `INSERT INTO "Template"
           (id, name, path, "thumbnailUrl", category, price, keywords, description,
            "isActive", clicks, "sortOrder", "createdAt", "updatedAt",
            "headerHtml", "menuHtml", "footerHtml", "cssText", "userId", "isPublic",
            "pagesSnapshot")
         VALUES
           ($1, $2, $3, $4, $5, 0, $6, $7,
            true, 0, $8, NOW(), NOW(),
            $9, $10, $11, $12, NULL, false,
            $13::jsonb)`,
        [id, name, path, thumbnailUrl, category, keywords, description, sortOrder,
         headerHtml, menuHtml, footerHtml, cssText, JSON.stringify(pagesSnapshot)],
      );
      console.log(`✓ Inserted new Agency template: ${id}`);
    }
    console.log(`   · path: ${path}`);
    console.log(`   · headerHtml: ${headerHtml.length} chars`);
    console.log(`   · menuHtml:   ${menuHtml.length} chars`);
    console.log(`   · footerHtml: ${footerHtml.length} chars`);
    console.log(`   · cssText:    ${cssText.length} chars`);
    console.log(`   · pages:      ${pagesSnapshot.length} (${pagesSnapshot.map((p) => p.slug).join(", ")})`);
    console.log(`   · thumbnail:  ${thumbnailUrl}`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
