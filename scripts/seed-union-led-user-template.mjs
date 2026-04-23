/**
 * Seed the "UNION LED (Premium Dark)" template as jgcheon69@gmail.com's
 * personal template (Template.userId = jgcheon69's id), NOT a system
 * template. Real brand info from the user's own xunion5 site
 * (unionled.asia) is baked in since the Claude Design prototype was
 * designed specifically for this brand.
 *
 * Ported from Claude Design handoff "unionled" (index.html).
 *
 * Brand data (from xunion5):
 *   유니온엘이디 UNION LED · SINCE 2001 · 경기도 오산시
 *   Tel 031-883-1017 / Fax 031-883-9939
 *   평일 09:00–19:00 / 토·공휴일 09:00–15:00
 *   실내/옥외/주유소/풀컬러/주문형 전광판 + LED 채널 + 양면돌출 간판
 *
 * Run:
 *   DATABASE_URL="$(grep DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '"')" \
 *     node /var/www/homenshop-next/scripts/seed-union-led-user-template.mjs
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

const OWNER_USER_ID = "04330fb9-1336-4d66-b635-27c73dd2f320";  // jgcheon69@gmail.com

const IMG = (q, w, h) =>
  `https://homenshop.com/api/img?q=${encodeURIComponent(q)}&w=${w}&h=${h}`;

/* ═══════════════════════════════════════════════════════════════════
 *  CSS — premium dark amber LED theme
 * ═══════════════════════════════════════════════════════════════════ */

const cssText = `
/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root {
  --bg-base: #050507;
  --bg-panel: #0b0b0f;
  --bg-elev: #111118;
  --bg-card: #141420;
  --border: rgba(255,255,255,0.06);
  --border-strong: rgba(255,255,255,0.12);
  --text-hi: #f5f5f7;
  --text-mid: #a8a8b3;
  --text-lo: #60606c;
  --amber: #ffb547;
  --amber-hot: #ffd27a;
  --amber-deep: #f2761d;
  --led-red: #ff3b3b;
  --led-green: #4ade80;
  --led-blue: #3b82f6;
  --led-violet: #a855f7;
  --led-yellow: #facc15;
  --brand-color: var(--amber);
  --brand-accent: var(--amber-hot);
  --brand-font: 'Pretendard Variable', Pretendard, 'SUIT', system-ui, sans-serif;
  --mono: 'JetBrains Mono', 'Space Grotesk', ui-monospace, monospace;
  --radius-sm: 6px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --radius-xl: 32px;
}
/* HNS-THEME-TOKENS:END */

body { margin: 0; background: var(--bg-base); color: var(--text-hi); font-family: var(--brand-font); font-feature-settings: 'ss01','ss02','cv01'; -webkit-font-smoothing: antialiased; letter-spacing: -0.01em; line-height: 1.5; }
a { color: inherit; text-decoration: none; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }

.ul-container { max-width: 100%; margin: 0; padding: 0 32px; }

/* ─── Ticker ─── */
.ul-ticker { background: #000; border-bottom: 1px solid var(--border); height: 32px; overflow: hidden; position: relative; z-index: 20; }
.ul-ticker-track { display: flex; gap: 48px; align-items: center; height: 100%; white-space: nowrap; animation: ul-ticker 60s linear infinite; font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; color: var(--amber); text-transform: uppercase; padding-left: 32px; }
.ul-ticker-track span { display: inline-flex; align-items: center; gap: 10px; }
.ul-ticker-dot { width: 6px; height: 6px; background: var(--amber); border-radius: 50%; box-shadow: 0 0 8px var(--amber); flex-shrink: 0; }
@keyframes ul-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* ─── Header ─── */
.ul-header { position: sticky; top: 0; z-index: 30; background: rgba(5,5,7,0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); }
.ul-header-inner { display: flex; align-items: center; justify-content: space-between; height: 72px; max-width: 100%; margin: 0; padding: 0 32px; gap: 16px; }
.ul-logo { display: flex; align-items: center; gap: 12px; }
.ul-logo-mark { width: 36px; height: 36px; display: grid; grid-template-columns: repeat(3,1fr); grid-template-rows: repeat(3,1fr); gap: 2px; flex-shrink: 0; }
.ul-logo-mark i { background: var(--amber); border-radius: 1px; box-shadow: 0 0 4px var(--amber); }
.ul-logo-mark i:nth-child(2), .ul-logo-mark i:nth-child(4), .ul-logo-mark i:nth-child(6), .ul-logo-mark i:nth-child(8) { background: rgba(255,181,71,0.25); box-shadow: none; }
.ul-logo-text { display: flex; flex-direction: column; line-height: 1; }
.ul-logo-text .ko { font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.ul-logo-text .en { font-family: var(--mono); font-size: 10px; color: var(--text-mid); letter-spacing: 0.2em; margin-top: 4px; }
.ul-nav { display: flex; gap: 2px; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
.ul-nav::-webkit-scrollbar { display: none; }
.ul-nav a { padding: 8px 12px; border-radius: 8px; font-size: 13px; font-weight: 500; color: var(--text-mid); transition: all 0.2s; position: relative; white-space: nowrap; }
.ul-nav a:hover { color: var(--text-hi); background: rgba(255,255,255,0.04); }
.ul-nav a.active { color: var(--amber); }
.ul-nav a.active::after { content: ''; position: absolute; inset: auto 16px 4px 16px; height: 2px; background: var(--amber); box-shadow: 0 0 8px var(--amber); }
.ul-phone-pill { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; background: linear-gradient(180deg, var(--amber), var(--amber-deep)); color: #1a0a00 !important; border-radius: 999px; font-weight: 700; font-size: 14px; letter-spacing: 0.02em; box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 8px 32px rgba(255,140,0,0.25); transition: transform 0.2s, box-shadow 0.2s; white-space: nowrap; flex-shrink: 0; }
.ul-phone-pill:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px rgba(255,181,71,0.6), 0 12px 40px rgba(255,140,0,0.4); }

/* ─── Hero ─── */
.ul-hero { position: relative; min-height: 720px; overflow: hidden; background: #000; isolation: isolate; }
.ul-hero-bg { position: absolute; inset: 0; background-size: cover; background-position: center; filter: saturate(1.15) brightness(0.7); z-index: -2; }
.ul-hero-bg::after { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 70% 30%, rgba(255,181,71,0.15) 0%, transparent 60%), linear-gradient(180deg, rgba(5,5,7,0.4) 0%, rgba(5,5,7,0.95) 100%), linear-gradient(90deg, rgba(5,5,7,0.8) 0%, transparent 60%); }
.ul-hero-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,181,71,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,181,71,0.04) 1px, transparent 1px); background-size: 80px 80px; mask-image: linear-gradient(180deg, transparent 0%, black 30%, black 70%, transparent 100%); z-index: -1; }
.ul-hero-inner { position: relative; z-index: 2; padding: 120px 32px 100px; display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 48px; align-items: center; max-width: 100%; margin: 0; }
.ul-eyebrow { display: inline-flex; align-items: center; gap: 10px; padding: 6px 14px 6px 6px; background: rgba(255,181,71,0.08); border: 1px solid rgba(255,181,71,0.25); border-radius: 999px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--amber-hot); }
.ul-eyebrow .dot { width: 20px; height: 20px; background: var(--amber); border-radius: 50%; box-shadow: 0 0 12px var(--amber), inset 0 0 4px rgba(255,255,255,0.5); animation: ul-pulse 2s ease-in-out infinite; }
@keyframes ul-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
.ul-hero h1 { margin-top: 24px; font-size: 84px; line-height: 0.95; letter-spacing: -0.04em; font-weight: 800; color: var(--text-hi); }
.ul-hero h1 .asia { color: var(--amber); text-shadow: 0 0 40px rgba(255,181,71,0.4); font-style: italic; font-weight: 900; }
.ul-hero h1 .small { display: block; font-size: 20px; font-weight: 500; color: var(--text-mid); letter-spacing: 0; margin-top: 20px; font-style: normal; }
.ul-hero p.sub { margin-top: 28px; max-width: 520px; font-size: 17px; line-height: 1.65; color: var(--text-mid); }
.ul-hero-cta { margin-top: 40px; display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.ul-btn-primary { display: inline-flex; align-items: center; gap: 12px; padding: 18px 28px; background: linear-gradient(180deg, var(--amber) 0%, var(--amber-deep) 100%); color: #1a0a00 !important; border-radius: 12px; font-size: 17px; font-weight: 700; box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 20px 40px -12px rgba(255,140,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3); transition: transform 0.2s, box-shadow 0.2s; }
.ul-btn-primary:hover { transform: translateY(-2px); }
.ul-btn-ghost { display: inline-flex; align-items: center; gap: 10px; padding: 16px 24px; border: 1px solid var(--border-strong); border-radius: 12px; font-size: 15px; color: var(--text-hi); transition: all 0.2s; }
.ul-btn-ghost:hover { background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.2); }
.ul-hero-stats { background: linear-gradient(180deg, rgba(20,20,32,0.9), rgba(20,20,32,0.6)); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; backdrop-filter: blur(12px); }
.ul-stat { padding: 8px; }
.ul-stat .num { font-family: var(--mono); font-size: 40px; font-weight: 600; color: var(--amber); text-shadow: 0 0 20px rgba(255,181,71,0.3); letter-spacing: -0.02em; line-height: 1; }
.ul-stat .num .unit { font-size: 16px; color: var(--text-mid); font-weight: 500; margin-left: 4px; }
.ul-stat .label { margin-top: 8px; font-size: 12px; color: var(--text-mid); letter-spacing: 0.02em; }
.ul-hero-stats-divider { grid-column: 1 / -1; height: 1px; background: var(--border); }
.ul-hero-phone-card { grid-column: 1 / -1; display: flex; align-items: center; gap: 14px; padding: 16px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,181,71,0.25); border-radius: var(--radius-md); }
.ul-hero-phone-card .icon { width: 40px; height: 40px; background: rgba(255,181,71,0.12); border: 1px solid rgba(255,181,71,0.3); border-radius: 10px; display: grid; place-items: center; color: var(--amber); flex-shrink: 0; }
.ul-hero-phone-card .label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; color: var(--text-mid); text-transform: uppercase; }
.ul-hero-phone-card .num { font-family: var(--mono); font-size: 22px; font-weight: 600; color: var(--amber); }

/* ─── Section heading ─── */
.ul-section { padding: 120px 32px; position: relative; max-width: 100%; margin: 0; }
.ul-section-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; margin-bottom: 64px; flex-wrap: wrap; }
.ul-eyebrow-mono { font-family: var(--mono); font-size: 11px; letter-spacing: 0.25em; color: var(--amber); text-transform: uppercase; margin-bottom: 14px; display: inline-block; }
.ul-section-title { font-size: 56px; line-height: 1.02; letter-spacing: -0.03em; font-weight: 800; color: var(--text-hi); margin: 0; }
.ul-section-title em { color: var(--amber); font-style: italic; font-weight: 900; text-shadow: 0 0 24px rgba(255,181,71,0.35); }
.ul-section-desc { max-width: 480px; color: var(--text-mid); font-size: 15px; line-height: 1.65; }

/* ─── Product category nav + grid ─── */
.ul-product-nav { display: flex; gap: 6px; margin-bottom: 40px; flex-wrap: wrap; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
.ul-product-nav button { padding: 10px 20px; border: 1px solid var(--border); border-radius: 999px; background: transparent; font-size: 13px; font-weight: 500; color: var(--text-mid); transition: all 0.2s; }
.ul-product-nav button:hover { border-color: var(--border-strong); color: var(--text-hi); }
.ul-product-nav button.active { background: var(--amber); color: #1a0a00; border-color: var(--amber); }
.ul-product-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
.ul-product-card { position: relative; overflow: hidden; border-radius: var(--radius-lg); aspect-ratio: 4/5; background: var(--bg-card); border: 1px solid var(--border); transition: all 0.3s; display: block; }
.ul-product-card:hover { transform: translateY(-4px); border-color: rgba(255,181,71,0.3); box-shadow: 0 20px 40px -12px rgba(255,181,71,0.2); }
.ul-product-card .img { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform 0.5s; }
.ul-product-card:hover .img { transform: scale(1.05); }
.ul-product-card .overlay { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,5,7,0) 40%, rgba(5,5,7,0.95) 100%); z-index: 1; }
.ul-product-card .badge { position: absolute; top: 16px; right: 16px; z-index: 3; padding: 6px 12px; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.15); border-radius: 999px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; color: var(--amber); text-transform: uppercase; }
.ul-product-card .meta { position: absolute; bottom: 20px; left: 20px; right: 20px; z-index: 3; display: flex; justify-content: space-between; align-items: flex-end; color: var(--text-hi); gap: 12px; }
.ul-product-card .meta .cat { font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em; color: var(--text-mid); text-transform: uppercase; margin-bottom: 6px; }
.ul-product-card .meta .name { font-size: 17px; font-weight: 700; letter-spacing: -0.01em; }
.ul-product-card .arrow { width: 36px; height: 36px; background: var(--amber); color: #1a0a00; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; box-shadow: 0 8px 16px -6px rgba(255,140,0,0.5); }

/* ─── Cases ─── */
.ul-cases { background: var(--bg-panel); }
.ul-case-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 16px; height: 640px; }
.ul-case-card { position: relative; overflow: hidden; border-radius: var(--radius-lg); cursor: pointer; border: 1px solid var(--border); transition: all 0.3s; }
.ul-case-card.large { grid-row: 1 / 3; }
.ul-case-card:hover { transform: translateY(-2px); border-color: rgba(255,181,71,0.3); }
.ul-case-card .img { position: absolute; inset: 0; background-size: cover; background-position: center; transition: transform 0.5s; }
.ul-case-card:hover .img { transform: scale(1.05); }
.ul-case-card .grad { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,5,7,0.2) 0%, rgba(5,5,7,0.95) 100%); z-index: 1; }
.ul-case-card .info { position: absolute; bottom: 20px; left: 20px; right: 20px; z-index: 2; color: var(--text-hi); }
.ul-case-card .loc { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; color: var(--amber); text-transform: uppercase; margin-bottom: 6px; display: inline-block; padding: 4px 10px; background: rgba(255,181,71,0.15); border: 1px solid rgba(255,181,71,0.3); border-radius: 999px; }
.ul-case-card.large .loc { padding: 6px 14px; font-size: 11px; }
.ul-case-card .title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; margin: 10px 0 0; }
.ul-case-card.large .title { font-size: 32px; font-weight: 800; line-height: 1.1; }
.ul-case-card .tags { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.ul-case-card .tags span { padding: 4px 10px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.1); border-radius: 999px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--text-hi); }

/* ─── LED showcase ─── */
.ul-led-showcase { padding: 60px 32px; background: #000; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.ul-led-strip { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; height: 120px; }
.ul-led-cell { position: relative; background: radial-gradient(circle at center, rgba(255,181,71,0.08) 0%, transparent 70%); border: 1px solid rgba(255,181,71,0.08); border-radius: 4px; overflow: hidden; display: grid; place-items: center; font-family: var(--mono); font-size: 14px; font-weight: 600; letter-spacing: 0.1em; color: var(--amber); text-shadow: 0 0 12px var(--amber); }
.ul-led-cell:nth-child(2n) { color: var(--led-green); text-shadow: 0 0 12px var(--led-green); border-color: rgba(74,222,128,0.12); }
.ul-led-cell:nth-child(3n) { color: var(--led-red); text-shadow: 0 0 12px var(--led-red); border-color: rgba(255,59,59,0.12); }
.ul-led-cell:nth-child(5n) { color: var(--led-blue); text-shadow: 0 0 12px var(--led-blue); border-color: rgba(59,130,246,0.12); }
.ul-led-caption { text-align: center; margin-top: 32px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.2em; color: var(--text-mid); text-transform: uppercase; }
.ul-led-caption em { color: var(--amber); font-style: normal; text-shadow: 0 0 12px var(--amber); }

/* ─── Notices ─── */
.ul-notices { background: var(--bg-panel); padding: 120px 32px; }
.ul-notice-cols { max-width: 100%; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.ul-notice-col { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; }
.ul-notice-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 20px; }
.ul-notice-head h3 { font-size: 18px; font-weight: 700; color: var(--text-hi); margin: 0; }
.ul-notice-head .more { font-family: var(--mono); font-size: 10px; letter-spacing: 0.15em; color: var(--amber); text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
.ul-notice-list { list-style: none; padding: 0; margin: 0; }
.ul-notice-item { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px dashed var(--border); gap: 16px; font-size: 13px; }
.ul-notice-item:last-child { border-bottom: 0; }
.ul-notice-item .t { flex: 1; color: var(--text-hi); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; }
.ul-notice-item .tag { font-family: var(--mono); font-size: 9px; padding: 2px 7px; background: rgba(255,181,71,0.1); border: 1px solid rgba(255,181,71,0.25); border-radius: 4px; color: var(--amber); letter-spacing: 0.1em; text-transform: uppercase; flex-shrink: 0; }
.ul-notice-item .d { font-family: var(--mono); font-size: 11px; color: var(--text-lo); flex-shrink: 0; }

/* ─── Footer ─── */
.ul-footer { background: #000; padding: 80px 32px 40px; border-top: 1px solid var(--border); }
.ul-footer-top { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; padding-bottom: 48px; border-bottom: 1px solid var(--border); }
.ul-footer-brand h4 { font-size: 24px; font-weight: 800; color: var(--text-hi); letter-spacing: -0.02em; margin: 0; }
.ul-footer-brand p { margin-top: 12px; color: var(--text-mid); font-size: 14px; line-height: 1.7; max-width: 380px; }
.ul-footer-col h5 { font-family: var(--mono); font-size: 11px; letter-spacing: 0.2em; color: var(--text-lo); text-transform: uppercase; margin: 0 0 20px; }
.ul-footer-col ul { list-style: none; padding: 0; margin: 0; }
.ul-footer-col ul li { margin-bottom: 12px; }
.ul-footer-col a { color: var(--text-mid); font-size: 14px; transition: color 0.2s; }
.ul-footer-col a:hover { color: var(--amber); }
.ul-footer-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 32px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.15em; color: var(--text-lo); text-transform: uppercase; }

/* ─── Page hero (non-home pages) ─── */
.ul-page-hero { padding: 140px 32px 80px; background: linear-gradient(180deg, var(--bg-panel), var(--bg-base)); border-bottom: 1px solid var(--border); text-align: center; }
.ul-page-hero h1 { font-size: 64px; letter-spacing: -0.03em; font-weight: 800; margin: 16px 0 20px; line-height: 1.05; }
.ul-page-hero h1 em { color: var(--amber); font-style: italic; text-shadow: 0 0 24px rgba(255,181,71,0.35); }
.ul-page-hero p { font-size: 16px; color: var(--text-mid); max-width: 600px; margin: 0 auto; line-height: 1.65; }

/* ─── Info card (about page) ─── */
.ul-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 100%; margin: 0; }
.ul-info-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 32px; transition: all 0.3s; }
.ul-info-card:hover { border-color: rgba(255,181,71,0.3); transform: translateY(-4px); }
.ul-info-card .ico { width: 48px; height: 48px; border-radius: 12px; background: rgba(255,181,71,0.12); color: var(--amber); display: grid; place-items: center; margin-bottom: 20px; font-size: 20px; }
.ul-info-card h3 { margin: 0 0 10px; font-size: 20px; font-weight: 700; color: var(--text-hi); }
.ul-info-card p { margin: 0; color: var(--text-mid); font-size: 14px; line-height: 1.65; }

/* ─── Contact form ─── */
.ul-contact-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 48px; max-width: 100%; margin: 0; }
.ul-contact-info { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 40px; }
.ul-contact-info h3 { margin: 0 0 20px; font-size: 22px; font-weight: 700; color: var(--text-hi); }
.ul-contact-info ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.ul-contact-info li { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
.ul-contact-info li span { color: var(--text-lo); font-family: var(--mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; }
.ul-contact-info li b { color: var(--text-hi); font-family: var(--mono); font-weight: 500; }
.ul-contact-info li.phone b { color: var(--amber); font-size: 16px; }
.ul-form { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 40px; display: grid; gap: 14px; }
.ul-form input, .ul-form textarea { width: 100%; padding: 14px 16px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius-sm); font-family: var(--brand-font); font-size: 14px; color: var(--text-hi); }
.ul-form input::placeholder, .ul-form textarea::placeholder { color: var(--text-lo); }
.ul-form input:focus, .ul-form textarea:focus { outline: 0; border-color: var(--amber); }
.ul-form textarea { resize: vertical; min-height: 140px; }
.ul-form button { padding: 16px 24px; background: linear-gradient(180deg, var(--amber), var(--amber-deep)); color: #1a0a00; border: 0; border-radius: var(--radius-md); font-weight: 700; font-size: 15px; cursor: pointer; box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 12px 32px -8px rgba(255,140,0,0.4); }

/* ─── Fixed call FAB ─── */
.ul-fab { position: fixed; right: 24px; bottom: 24px; z-index: 100; display: flex; align-items: center; gap: 12px; padding: 14px 20px 14px 14px; background: linear-gradient(180deg, var(--amber), var(--amber-deep)); color: #1a0a00; border-radius: 999px; font-weight: 700; font-size: 14px; box-shadow: 0 0 0 1px rgba(255,181,71,0.5), 0 20px 40px -8px rgba(255,140,0,0.6); animation: ul-pulse 3s ease-in-out infinite; }
.ul-fab:hover { transform: translateY(-2px); }
.ul-fab .icon { width: 32px; height: 32px; background: #1a0a00; color: var(--amber); border-radius: 50%; display: grid; place-items: center; }

/* ─── Responsive ─── */
@media (max-width: 1200px) {
  .ul-hero-inner { grid-template-columns: 1fr; padding: 80px 24px 60px; }
  .ul-hero h1 { font-size: 56px; }
  .ul-product-grid { grid-template-columns: repeat(3, 1fr); }
  .ul-case-grid { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; height: auto; }
  .ul-case-card.large { grid-row: 1 / 2; grid-column: 1 / -1; aspect-ratio: 16/9; }
  .ul-case-card:not(.large) { aspect-ratio: 1; }
  .ul-notice-cols, .ul-info-grid, .ul-contact-grid { grid-template-columns: 1fr; }
  .ul-footer-top { grid-template-columns: 1fr 1fr; gap: 32px; }
  .ul-section-title, .ul-page-hero h1 { font-size: 40px; }
  .ul-led-strip { grid-template-columns: repeat(4, 1fr); height: 80px; }
}
@media (max-width: 640px) {
  .ul-container, .ul-header-inner, .ul-hero-inner, .ul-section, .ul-notices, .ul-footer, .ul-page-hero { padding-left: 20px; padding-right: 20px; }
  .ul-nav { display: none; }
  .ul-phone-pill { padding: 8px 12px; font-size: 12px; }
  .ul-hero { min-height: auto; }
  .ul-hero h1 { font-size: 40px; }
  .ul-hero h1 .small { font-size: 15px; }
  .ul-hero-stats { grid-template-columns: 1fr 1fr; padding: 20px; }
  .ul-hero-phone-card { flex-wrap: wrap; }
  .ul-section { padding: 72px 20px; }
  .ul-section-title, .ul-page-hero h1 { font-size: 32px; }
  .ul-product-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
  .ul-case-grid { grid-template-columns: 1fr; }
  .ul-case-card:not(.large) { aspect-ratio: 4/3; }
  .ul-footer-top { grid-template-columns: 1fr; }
  .ul-footer-bottom { flex-direction: column; gap: 12px; text-align: center; }
  .ul-fab { right: 12px; bottom: 12px; font-size: 13px; padding: 10px 14px 10px 10px; }
}
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  HEADER (ticker + sticky nav)
 * ═══════════════════════════════════════════════════════════════════ */

const headerHtml = `
<div class="ul-ticker">
  <div class="ul-ticker-track">
    <span><i class="ul-ticker-dot"></i>전국 납품 · 시공 문의 031-883-1017</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-green);box-shadow:0 0 8px var(--led-green);"></i>SINCE 2001 · 25년 LED 전광판 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-red);box-shadow:0 0 8px var(--led-red);"></i>교회 · 학교 · 관공서 납품 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-blue);box-shadow:0 0 8px var(--led-blue);"></i>실내 / 옥외 / 주문형 전광판 설계 제작</span>
    <span><i class="ul-ticker-dot"></i>전국 납품 · 시공 문의 031-883-1017</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-green);box-shadow:0 0 8px var(--led-green);"></i>SINCE 2001 · 25년 LED 전광판 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-red);box-shadow:0 0 8px var(--led-red);"></i>교회 · 학교 · 관공서 납품 전문</span>
    <span><i class="ul-ticker-dot" style="background:var(--led-blue);box-shadow:0 0 8px var(--led-blue);"></i>실내 / 옥외 / 주문형 전광판 설계 제작</span>
  </div>
</div>

<header class="ul-header">
  <div class="ul-header-inner">
    <a href="index.html" class="ul-logo">
      <div class="ul-logo-mark"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <div class="ul-logo-text">
        <span class="ko">유니온엘이디</span>
        <span class="en">UNION LED</span>
      </div>
    </a>
    <nav class="ul-nav" aria-label="주 메뉴">
      <a href="index.html" class="active">회사소개</a>
      <a href="products.html">LED 전광판</a>
      <a href="cases.html">설치사례</a>
      <a href="about.html">납품실적</a>
      <a href="contact.html">견적문의</a>
    </nav>
    <a href="tel:031-883-1017" class="ul-phone-pill">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      031-883-1017
    </a>
  </div>
</header>
`.trim();

const menuHtml = `<div id="hns_menu"></div>`;

/* ═══════════════════════════════════════════════════════════════════
 *  FOOTER
 * ═══════════════════════════════════════════════════════════════════ */

const footerHtml = `
<footer class="ul-footer">
  <div class="ul-footer-top">
    <div class="ul-footer-brand">
      <h4>유니온엘이디 UNION LED</h4>
      <p>스마트한 빛으로 미래를 밝힙니다. 국내부터 해외까지. 일반업소·교회·대학교·관공서 납품 전문 기업. Since 2001.</p>
    </div>
    <div class="ul-footer-col">
      <h5>Products</h5>
      <ul>
        <li><a href="products.html">실내용 전광판</a></li>
        <li><a href="products.html">옥외용 전광판</a></li>
        <li><a href="products.html">주문형 전광판</a></li>
        <li><a href="products.html">주유소 전광판</a></li>
        <li><a href="products.html">풀컬러 전광판</a></li>
      </ul>
    </div>
    <div class="ul-footer-col">
      <h5>Company</h5>
      <ul>
        <li><a href="about.html">회사소개</a></li>
        <li><a href="cases.html">설치 사례</a></li>
        <li><a href="products.html">전광판 규격</a></li>
        <li><a href="#">가격표 (블로그)</a></li>
        <li><a href="contact.html">고객지원센터</a></li>
      </ul>
    </div>
    <div class="ul-footer-col">
      <h5>Contact</h5>
      <ul>
        <li><a href="tel:031-883-1017" style="font-family:var(--mono);color:var(--amber);">031-883-1017</a></li>
        <li><a href="tel:031-883-9939" style="font-family:var(--mono);">031-883-9939</a></li>
        <li>평일 AM 09:00 – PM 07:00</li>
        <li>토·공휴일 AM 09:00 – PM 03:00</li>
        <li>경기도 오산시 · 유니온엘이디</li>
      </ul>
    </div>
  </div>
  <div class="ul-footer-bottom">
    <span>© 2026 UNION LED CO. ALL RIGHTS RESERVED.</span>
    <span>UNION-LED.ASIA · SINCE 2001</span>
  </div>
</footer>
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  PAGES
 * ═══════════════════════════════════════════════════════════════════ */

let uidSeq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;

function pageHome() {
  const sHero = uid("obj_sec"),
    eye = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text"),
    ctas = uid("obj_btn"),
    stats = uid("obj_text");
  const sProd = uid("obj_sec"), prodHead = uid("obj_title"), prodDesc = uid("obj_text");
  const products = [
    ["Indoor", "Indoor LED", "실내용 전광판", "led indoor church display board"],
    ["Indoor", "Indoor LED", "교회·학교 실내 전광판", "church interior led sign board"],
    ["Outdoor", "Outdoor billboard", "관공서 옥외 전광판", "outdoor led billboard display korea"],
    ["Outdoor", "Outdoor billboard", "상가 옥외 사이니지", "outdoor led storefront signage"],
    ["On-Demand", "On-demand billboard", "주문형 현황판", "custom led status board"],
    ["Gas", "Gas Station signage", "주유소 가격 전광판", "gas station led price sign night"],
    ["Gas", "Gas Station signage", "LPG 주유소 전광판", "lpg gas price led sign"],
    ["Full color", "Full color signage", "풀컬러 LED 전광판", "full color led billboard night city"],
    ["Full color", "Full color signage", "대형 풀컬러 사이니지", "large full color led display"],
    ["Indoor", "Indoor LED", "관공서 실내 안내판", "government office led sign"],
    ["Outdoor", "Outdoor billboard", "학원·학교 옥외", "school outdoor led sign"],
    ["Special", "Special signage", "특수형 현황판", "special led status board"],
  ].map((p) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    badge: p[0], cat: p[1], name: p[2], q: p[3],
  }));
  const prodGrid = products.map((p) => `
      <div class="dragable de-group" id="${p.id}">
        <a class="ul-product-card" href="products.html">
          <div class="dragable" id="${p.imgId}"><div class="img" style="background-image:url('${IMG(p.q, 800, 1000)}');"></div></div>
          <div class="overlay"></div>
          <div class="badge">${p.badge}</div>
          <div class="meta">
            <div>
              <div class="cat">${p.cat}</div>
              <div class="name">${p.name}</div>
            </div>
            <div class="arrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M17 7H8M17 7V16"/></svg>
            </div>
          </div>
        </a>
      </div>`).join("");

  const sCases = uid("obj_sec"), casesHead = uid("obj_title");
  const cases = [
    ["Yeosu · 여수", "여수 돌산대교 · 브릿지 LED 경관조명", ["풀컬러","옥외","대형"], "yeosu bridge led light architecture night"],
    ["Seoul · 강남", "프랜차이즈 매장 사이니지", [], "seoul gangnam shop led sign night"],
    ["Gyeongbuk · 모산", "주유소 가격 전광판", [], "gas station led price display night"],
    ["Jinju · 진주", "주차 유도등", [], "parking lot led guide light"],
    ["Incheon · 인천", "관공서 안내 전광판", [], "government building led sign board"],
  ].map((c, i) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    loc: c[0], title: c[1], tags: c[2], q: c[3], large: i === 0,
  }));
  const caseGrid = cases.map((c) => `
      <div class="dragable de-group" id="${c.id}">
        <div class="ul-case-card${c.large ? " large" : ""}">
          <div class="dragable" id="${c.imgId}"><div class="img" style="background-image:url('${IMG(c.q, 1600, 900)}');"></div></div>
          <div class="grad"></div>
          <div class="info">
            <span class="loc">${c.loc}</span>
            <div class="title">${c.title}</div>
            ${c.tags.length ? `<div class="tags">${c.tags.map((t) => `<span>${t}</span>`).join("")}</div>` : ""}
          </div>
        </div>
      </div>`).join("");

  const sLed = uid("obj_sec"), ledStrip = uid("obj_text");
  const sNotices = uid("obj_sec"),
    notice1 = uid("obj_card"), notice2 = uid("obj_card");
  const sFab = uid("obj_sec"), fab = uid("obj_btn");

  return `
<div class="dragable" id="${sHero}">
  <section class="ul-hero">
    <div class="ul-hero-bg" style="background-image:url('${IMG("city night skyline led billboards cinematic", 2400, 1200)}');"></div>
    <div class="ul-hero-grid"></div>
    <div class="ul-hero-inner">
      <div>
        <div class="dragable sol-replacible-text" id="${eye}"><div class="ul-eyebrow"><span class="dot"></span>SINCE 2001 · UNION LED SIGNAGE</div></div>
        <div class="dragable sol-replacible-text" id="${h1}"><h1>유니온엘이디<span style="color:var(--text-mid);font-weight:500;">.</span><br><span class="asia">아시아</span><span class="small">TOTAL SIGN &amp; INTERIOR — 일반업소 · 교회 · 대학교 · 관공서 납품 전문 기업입니다.</span></h1></div>
        <div class="dragable sol-replacible-text" id="${lead}"><p class="sub">국내 제작에서부터 해외까지 수출하는 기업. 원스톱 현장에서부터 시공 후 사후관리까지 고객님의 믿음에 신뢰로 보답하기 위해 최선을 다하고 있습니다.</p></div>
        <div class="ul-hero-cta">
          <div class="dragable" id="${ctas}">
            <a href="tel:031-883-1017" class="ul-btn-primary"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>전화 상담 031-883-1017</a>
            <a href="cases.html" class="ul-btn-ghost">설치사례 보기 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>
          </div>
        </div>
      </div>
      <aside class="ul-hero-stats">
        <div class="dragable sol-replacible-text" id="${stats}" style="display:contents;">
          <div class="ul-stat"><div class="num">25<span class="unit">년</span></div><div class="label">LED 전광판 전문 경력</div></div>
          <div class="ul-stat"><div class="num">3,200<span class="unit">+</span></div><div class="label">누적 납품·시공 현장</div></div>
          <div class="ul-stat"><div class="num">17<span class="unit">개</span></div><div class="label">LED 제품 카테고리</div></div>
          <div class="ul-stat"><div class="num">A/S<span class="unit">·무상</span></div><div class="label">1년 무상 · 평생 점검</div></div>
          <div class="ul-hero-stats-divider"></div>
          <div class="ul-hero-phone-card">
            <div class="icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
            <div>
              <div class="label">CUSTOMER CENTER</div>
              <div class="num">031-883-1017</div>
            </div>
            <div style="margin-left:auto;text-align:right;font-family:var(--mono);font-size:10px;letter-spacing:0.1em;color:var(--text-mid);line-height:1.6;">평일 09:00–19:00<br>토·공휴일 09:00–15:00</div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</div>

<div class="dragable" id="${sProd}">
  <section class="ul-section">
    <div class="ul-section-head">
      <div>
        <span class="ul-eyebrow-mono">Product lineup</span>
        <div class="dragable sol-replacible-text" id="${prodHead}"><h2 class="ul-section-title">용도별로 완성된<br>LED 전광판 <em>라인업</em></h2></div>
      </div>
      <div class="dragable sol-replacible-text" id="${prodDesc}"><p class="ul-section-desc">홀스피탈부터 주유소 가격표시, 교통·방범·신호등, 풀컬러 대형 전광판까지. 현장 환경과 콘텐츠에 맞춰 최적 피치·밝기로 제작 납품합니다.</p></div>
    </div>
    <div class="ul-product-nav">
      <button class="active">전체</button>
      <button>실내용</button>
      <button>옥외용</button>
      <button>주문형</button>
      <button>주유소</button>
      <button>풀컬러</button>
    </div>
    <div class="ul-product-grid">${prodGrid}
    </div>
  </section>
</div>

<div class="dragable" id="${sCases}">
  <section class="ul-section ul-cases">
    <div class="ul-section-head">
      <div>
        <span class="ul-eyebrow-mono">Featured cases</span>
        <div class="dragable sol-replacible-text" id="${casesHead}"><h2 class="ul-section-title">주요 <em>설치 사례</em></h2></div>
      </div>
      <a href="cases.html" class="ul-btn-ghost" style="align-self:flex-end;">전체 사례 보기 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg></a>
    </div>
    <div class="ul-case-grid">${caseGrid}
    </div>
  </section>
</div>

<div class="dragable" id="${sLed}">
  <section class="ul-led-showcase">
    <div class="dragable sol-replacible-text" id="${ledStrip}">
      <div class="ul-led-strip">
        <div class="ul-led-cell">UNION</div>
        <div class="ul-led-cell">LED</div>
        <div class="ul-led-cell">ASIA</div>
        <div class="ul-led-cell">2001</div>
        <div class="ul-led-cell">P10</div>
        <div class="ul-led-cell">RGB</div>
        <div class="ul-led-cell">4K</div>
        <div class="ul-led-cell">IP65</div>
      </div>
      <div class="ul-led-caption"><em>UNION LED</em> · ASIA · 풀 컬러 피치 샘플</div>
    </div>
  </section>
</div>

<div class="dragable" id="${sNotices}">
  <section class="ul-notices">
    <div class="ul-notice-cols">
      <div class="dragable de-group" id="${notice1}">
        <div class="ul-notice-col">
          <div class="ul-notice-head">
            <h3>구매하신 고객님 명단입니다</h3>
            <a href="#" class="more">MORE <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></a>
          </div>
          <ul class="ul-notice-list">
            <li class="ul-notice-item"><div class="t"><span class="tag">Indoor</span>반월병원 교회, 입산건역시내 전시장, 지아에너지포…</div><div class="d">2025.03.24</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">Outdoor</span>과카산성, 전진1실, 한마음고, 물트크아이팅…</div><div class="d">2024.06.17</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">On-Demand</span>삼진시/유주건식/폴광푸드/훌런에너지사용품…</div><div class="d">2023.11.16</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">Gas</span>대동원품(용산), 건하주유소, 뚝고물운전사, 축식…</div><div class="d">2023.07.09</div></li>
          </ul>
        </div>
      </div>
      <div class="dragable de-group" id="${notice2}">
        <div class="ul-notice-col">
          <div class="ul-notice-head">
            <h3>묻고 답하기 QNA</h3>
            <a href="#" class="more">MORE <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg></a>
          </div>
          <ul class="ul-notice-list">
            <li class="ul-notice-item"><div class="t"><span class="tag">Notice</span>LED 전광판 참고 리스트 방법</div><div class="d">2016.12.31</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">Notice</span>LED 색상 종류 용량의 정보</div><div class="d">2016.12.02</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">Notice</span>LED 전광판이란</div><div class="d">2016.12.02</div></li>
            <li class="ul-notice-item"><div class="t"><span class="tag">FAQ</span>전광판 A/S 문의 및 처리 절차</div><div class="d">2016.11.18</div></li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sFab}">
  <div class="dragable" id="${fab}">
    <a href="tel:031-883-1017" class="ul-fab">
      <span class="icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span>
      전화 상담 031-883-1017
    </a>
  </div>
</div>
`.trim();
}

function pageProducts() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec");
  const items = [
    ["Indoor", "실내용 LED 전광판", "실내 공간용 · 고해상도 · 저소음", "led indoor display church school"],
    ["Indoor", "병원 병실 번호 전광판", "반월병원 · 설치 납품", "hospital ward led sign"],
    ["Indoor", "교회 예배당 LED", "대형 교회 · 화환 설치", "church sanctuary led display"],
    ["Outdoor", "옥외용 LED 전광판", "IP65 · 방수 · 내구성", "outdoor led sign weatherproof"],
    ["Outdoor", "상가 옥외 사이니지", "프랜차이즈 매장", "storefront outdoor led signage"],
    ["Outdoor", "관공서 옥외 안내판", "공공기관 · 대형", "government outdoor led board"],
    ["Gas", "주유소 가격 전광판", "숫자 전용 · 고휘도", "gas station price led sign"],
    ["Gas", "LPG 가격 전광판", "LPG/LNG 겸용", "lpg price led display"],
    ["On-Demand", "신호삼색등", "교통 · 방범 신호", "traffic signal led"],
    ["On-Demand", "주차 유도등", "주차장 만차/공차 표시", "parking guide led light"],
    ["Full color", "풀컬러 LED 대형 전광판", "RGB · 영상 · 4K", "full color led big display"],
    ["Full color", "교량/브릿지 경관조명", "야간 경관 · 지자체 발주", "bridge led decorative lighting"],
  ].map((p) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    textId: uid("obj_title"),
    badge: p[0], name: p[1], spec: p[2], q: p[3],
  }));
  const grid = items.map((p) => `
      <div class="dragable de-group" id="${p.id}">
        <div class="ul-product-card">
          <div class="dragable" id="${p.imgId}"><div class="img" style="background-image:url('${IMG(p.q, 800, 1000)}');"></div></div>
          <div class="overlay"></div>
          <div class="badge">${p.badge}</div>
          <div class="dragable sol-replacible-text" id="${p.textId}">
            <div class="meta">
              <div>
                <div class="cat">${p.spec}</div>
                <div class="name">${p.name}</div>
              </div>
              <div class="arrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 17L17 7M17 7H8M17 7V16"/></svg></div>
            </div>
          </div>
        </div>
      </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="ul-eyebrow-mono">Products · LED 전광판</span></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>현장에 맞게, <em>정확하게</em> 제작합니다.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p>실내용부터 옥외 대형, 주유소 가격표, 관공서 안내판, 교량 경관조명까지. 피치·밝기·방수등급을 현장 환경에 맞춰 설계하고 제작 납품합니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="ul-section">
    <div class="ul-product-grid">${grid}
    </div>
  </section>
</div>
`.trim();
}

function pageCases() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec");
  const cases = [
    ["Yeosu · 여수", "여수 돌산대교 · 브릿지 LED 경관조명", ["풀컬러","옥외","대형"], "yeosu bridge led light architecture night"],
    ["Seoul · 강남", "강남 프랜차이즈 매장 사이니지", ["실내","옥외"], "seoul gangnam shop led sign night"],
    ["Gyeongbuk · 모산", "모산 주유소 가격 전광판", ["주유소","숫자"], "gas station led price display night"],
    ["Jinju · 진주", "진주 주차 유도등", ["주문형","교통"], "parking lot led guide light"],
    ["Incheon · 인천", "인천시청 안내 전광판", ["관공서","실내"], "government building led sign board"],
    ["Busan · 부산", "부산 대학교 캠퍼스 LED", ["교육","옥외"], "university campus led sign"],
    ["Daegu · 대구", "대구 교회 예배당 LED", ["교회","실내"], "church led display screen"],
    ["Ulsan · 울산", "울산 산업단지 전광판", ["산업","옥외"], "industrial complex led sign"],
    ["Jeju · 제주", "제주 관광안내 LED", ["관광","옥외"], "jeju tourist led sign"],
  ].map((c, i) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    loc: c[0], title: c[1], tags: c[2], q: c[3], large: i === 0,
  }));
  const grid = cases.map((c) => `
      <div class="dragable de-group" id="${c.id}">
        <div class="ul-case-card${c.large ? " large" : ""}">
          <div class="dragable" id="${c.imgId}"><div class="img" style="background-image:url('${IMG(c.q, 1600, 900)}');"></div></div>
          <div class="grad"></div>
          <div class="info">
            <span class="loc">${c.loc}</span>
            <div class="title">${c.title}</div>
            <div class="tags">${c.tags.map((t) => `<span>${t}</span>`).join("")}</div>
          </div>
        </div>
      </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="ul-eyebrow-mono">Installed cases · 설치사례</span></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>전국 곳곳에 <em>설치 사례</em></h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p>25년간 3,200여 현장에 LED 전광판을 납품·시공했습니다. 지역별·카테고리별 대표 사례를 모았습니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="ul-section ul-cases">
    <div class="ul-case-grid" style="grid-template-columns: repeat(3, 1fr); grid-template-rows: auto; height: auto;">${grid}
    </div>
  </section>
</div>
`.trim();
}

function pageAbout() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), secH = uid("obj_title"), secLead = uid("obj_text");
  const cards = [
    ["🏆", "25년 전문 경력", "2001년 창립 이후 LED 전광판 한 분야만 집중. 축적된 현장 노하우가 차별입니다."],
    ["🌏", "전국 납품망", "수도권부터 제주까지. 긴급 대응 가능한 협력 시공팀이 지역별로 대기합니다."],
    ["🔧", "사후관리 평생", "1년 무상 A/S, 평생 유지보수 지원. 처음 보낸 LED도 여전히 책임집니다."],
    ["🎯", "주문형 제작", "규격 전광판으로는 불가능한 특수 형상·사이즈·컨트롤러 개발까지 자체 가능."],
    ["🏗", "관공서 납품 전문", "공공기관 조달 등록 업체. 설치·검수·납품 전 과정 조달 요건 충족."],
    ["💡", "저전력 · 고휘도", "최신 발광 소자 + 저발열 파워 · 옥외 일광 환경에서도 가독성 확보."],
  ].map((c) => ({ id: uid("obj_card"), textId: uid("obj_title"), ico: c[0], h: c[1], p: c[2] }));
  const grid = cards.map((c) => `
      <div class="dragable de-group" id="${c.id}">
        <div class="ul-info-card">
          <div class="ico">${c.ico}</div>
          <div class="dragable sol-replacible-text" id="${c.textId}">
            <h3>${c.h}</h3>
            <p>${c.p}</p>
          </div>
        </div>
      </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="ul-eyebrow-mono">About · 회사소개</span></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>25년, <em>LED 전광판</em>만.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p>유니온엘이디는 2001년 경기도 오산에서 시작했습니다. LED 한 분야만 집중해온 25년. 현장 가까이, 오래, 정직하게 일합니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="ul-section">
    <div class="ul-section-head" style="justify-content: center; text-align: center;">
      <div style="flex: 1; text-align: center;">
        <span class="ul-eyebrow-mono">Why UNION LED</span>
        <div class="dragable sol-replacible-text" id="${secH}"><h2 class="ul-section-title">오래 봐주셔서 <em>감사</em>합니다.</h2></div>
        <div class="dragable sol-replacible-text" id="${secLead}"><p class="ul-section-desc" style="margin: 16px auto 0;">2001년 창립 이후 한 분야만 집중한 6가지 강점.</p></div>
      </div>
    </div>
    <div class="ul-info-grid">${grid}
    </div>
  </section>
</div>
`.trim();
}

function pageContact() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), info = uid("obj_text");
  return `
<div class="dragable" id="${s1}">
  <section class="ul-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="ul-eyebrow-mono">Contact · 견적문의</span></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>설치 상담은 <em>전화가 가장 빠릅니다</em>.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p>현장 조건만 알려주시면 견적과 설계안을 1영업일 내 보내드립니다. 전화 · 이메일 · 방문 상담 모두 가능합니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="ul-section">
    <div class="ul-contact-grid">
      <div class="dragable sol-replacible-text" id="${info}">
        <div class="ul-contact-info">
          <h3>연락처 및 영업시간</h3>
          <ul>
            <li class="phone"><span>대표전화</span><b>031-883-1017</b></li>
            <li><span>Fax</span><b>031-883-9939</b></li>
            <li><span>이메일</span><b>help@union-led.asia</b></li>
            <li><span>평일</span><b>AM 09:00 – PM 07:00</b></li>
            <li><span>토·공휴일</span><b>AM 09:00 – PM 03:00</b></li>
            <li><span>주소</span><b>경기도 오산시</b></li>
            <li><span>SINCE</span><b>2001년</b></li>
          </ul>
        </div>
      </div>
      <form class="ul-form" onsubmit="return false;">
        <input type="text" placeholder="회사/업체명" />
        <input type="text" placeholder="담당자 성함" />
        <input type="tel" placeholder="연락처 (휴대폰 우선)" />
        <input type="email" placeholder="이메일" />
        <input type="text" placeholder="설치 현장 주소" />
        <textarea placeholder="전광판 크기·용도·피치·예산·설치일정 등 간단히 적어주세요"></textarea>
        <button type="button">견적 요청 →</button>
      </form>
    </div>
  </section>
</div>
`.trim();
}

const pagesSnapshot = [
  { slug: "index",    title: "홈",         isHome: true,  showInMenu: true, sortOrder: 0, lang: "ko", content: { html: pageHome() } },
  { slug: "products", title: "LED 전광판", isHome: false, showInMenu: true, sortOrder: 1, lang: "ko", content: { html: pageProducts() } },
  { slug: "cases",    title: "설치사례",   isHome: false, showInMenu: true, sortOrder: 2, lang: "ko", content: { html: pageCases() } },
  { slug: "about",    title: "회사소개",   isHome: false, showInMenu: true, sortOrder: 3, lang: "ko", content: { html: pageAbout() } },
  { slug: "contact",  title: "견적문의",   isHome: false, showInMenu: true, sortOrder: 4, lang: "ko", content: { html: pageContact() } },
];

/* ═══════════════════════════════════════════════════════════════════
 *  UPSERT as jgcheon69's user template
 * ═══════════════════════════════════════════════════════════════════ */

const pool = new pg.Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    const name = "UNION LED 프리미엄 다크";
    const category = "business";
    const description = "프리미엄 다크 LED 사이니지 템플릿 · 유니온엘이디 브랜드 데이터 주입 · 25년 LED 전광판 전문 기업 프로필 · 실내/옥외/주유소/풀컬러 라인업 · 전국 설치사례";
    const keywords = "led,signage,unionled,전광판,다크,프리미엄,유니온엘이디,설치사례,주유소,옥외,실내";
    const thumbnailUrl = IMG("city night skyline led billboards cinematic", 800, 600);
    const idBase = Date.now().toString(36);
    const id = `tpl_user_unionled_${idBase}`;
    const path = `user-templates/u_${OWNER_USER_ID}_${idBase}`;
    const sortOrder = 0;

    // Upsert by name within this user's templates.
    const existing = await client.query(
      'SELECT id FROM "Template" WHERE name = $1 AND "userId" = $2 LIMIT 1',
      [name, OWNER_USER_ID],
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
      console.log(`✓ Updated existing UNION LED user template: ${existingId}`);
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
            $9, $10, $11, $12, $13, false,
            $14::jsonb)`,
        [id, name, path, thumbnailUrl, category, keywords, description, sortOrder,
         headerHtml, menuHtml, footerHtml, cssText, OWNER_USER_ID,
         JSON.stringify(pagesSnapshot)],
      );
      console.log(`✓ Inserted new UNION LED user template: ${id}`);
    }
    console.log(`   · owner:      jgcheon69@gmail.com (${OWNER_USER_ID})`);
    console.log(`   · path:       ${path}`);
    console.log(`   · isPublic:   false (private — visible in '나의 템플릿' tab only)`);
    console.log(`   · headerHtml: ${headerHtml.length} chars`);
    console.log(`   · footerHtml: ${footerHtml.length} chars`);
    console.log(`   · cssText:    ${cssText.length} chars`);
    console.log(`   · pages:      ${pagesSnapshot.length} (${pagesSnapshot.map((p) => p.slug).join(", ")})`);
    console.log(`   · thumbnail:  ${thumbnailUrl}`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
