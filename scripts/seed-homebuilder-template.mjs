/**
 * Seed the "HomeBuilder" monochrome construction/development template.
 *
 * Ported from Claude Design handoff d-46 (HomeBuilder.html). Three-view
 * React-free prototype with a tech-forward mono aesthetic:
 *   - JetBrains Mono display + UI, Inter for body copy
 *   - #f4f3f0 paper, #0b0b0b ink, pure monochrome (no accent)
 *   - Index numbers (01/02…), coordinate labels, live ticker, diagnostic
 *     sidebars, duotone skyline imagery
 *   - Brand: HomeBuilder · EST. 1992 · ULSAN
 *
 * Compressed the prototype's 3 views (Index / Work / Project Detail)
 * into 5 homeNshop pages: index / work / practice / journal / contact.
 *
 * Every editable element is its own `.dragable` with obj_* IDs,
 * cssText starts with HNS-MODERN-TEMPLATE marker, menuHtml is the
 * empty wrapper (nav lives in headerHtml only).
 *
 * Run:
 *   DATABASE_URL="$(grep DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '"')" \
 *     node /var/www/homenshop-next/scripts/seed-homebuilder-template.mjs
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

const IMG = (q, w, h) =>
  `https://homenshop.com/api/img?q=${encodeURIComponent(q)}&w=${w}&h=${h}`;

/* ═══════════════════════════════════════════════════════════════════
 *  CSS — design system preserved from the Claude Design prototype
 * ═══════════════════════════════════════════════════════════════════ */

const cssText = `
/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root {
  --bg: #f4f3f0;
  --paper: #ebeae6;
  --ink: #0b0b0b;
  --ink-2: #1c1c1c;
  --mute: #6b6b68;
  --mute-2: #9a9a95;
  --rule: #000;
  --hair: rgba(0,0,0,.14);
  --hair-2: rgba(0,0,0,.08);
  --brand-color: var(--ink);
  --brand-accent: var(--ink);
  --brand-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
}
/* HNS-THEME-TOKENS:END */

body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--mono); font-feature-settings: "ss01", "cv11"; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }

/* ─── Utility bar (top thin mono line) ─── */
.hb-util { display: grid; grid-template-columns: 240px 1fr auto; align-items: center; border-bottom: 1px solid var(--hair); font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mute); height: 28px; padding: 0 24px; }
.hb-util .l { display: flex; gap: 18px; }
.hb-util .m { display: flex; justify-content: center; gap: 22px; }
.hb-util .r { display: flex; gap: 18px; }
.hb-util .live::before { content: ""; display: inline-block; width: 6px; height: 6px; background: var(--ink); border-radius: 50%; margin-right: 6px; transform: translateY(-1px); animation: hb-blink 1.6s infinite; }
@keyframes hb-blink { 50% { opacity: 0.2; } }

/* ─── Masthead ─── */
.hb-mast { display: grid; grid-template-columns: 240px 1fr auto; align-items: end; padding: 22px 24px 18px; border-bottom: 1px solid var(--rule); }
.hb-brand { display: flex; align-items: flex-end; gap: 10px; }
.hb-brand .mark { width: 26px; height: 26px; border: 1.5px solid var(--ink); display: grid; place-items: center; font-family: var(--mono); font-weight: 600; font-size: 13px; position: relative; }
.hb-brand .mark::after { content: ""; position: absolute; inset: 3px; border: 1px solid var(--ink); opacity: 0.25; }
.hb-brand .name { font-family: var(--mono); font-weight: 600; font-size: 18px; letter-spacing: -0.01em; line-height: 1; }
.hb-brand .name sub { display: block; font-size: 9px; font-weight: 400; letter-spacing: 0.16em; color: var(--mute); text-transform: uppercase; margin-top: 6px; }
.hb-nav { display: flex; gap: 34px; justify-content: center; align-items: baseline; }
.hb-nav a { font-family: var(--mono); font-size: 12px; font-weight: 500; letter-spacing: 0.02em; padding: 6px 2px; position: relative; color: var(--ink); transition: color 0.15s; }
.hb-nav a .idx { font-size: 9px; color: var(--mute); margin-right: 6px; letter-spacing: 0.1em; }
.hb-nav a:hover { color: #000; }
.hb-nav a.active { border-bottom: 1.5px solid var(--ink); }
.hb-cta { display: flex; align-items: center; gap: 14px; }
.hb-search { display: flex; align-items: center; gap: 8px; border: 1px solid var(--ink); padding: 6px 10px; font-family: var(--mono); font-size: 11px; color: var(--mute); min-width: 180px; }
.hb-search kbd { margin-left: auto; font-family: var(--mono); font-size: 9px; border: 1px solid var(--hair); padding: 1px 5px; color: var(--mute); }
.hb-btn-black { background: var(--ink); color: #fff !important; font-family: var(--mono); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; padding: 9px 14px; display: inline-flex; align-items: center; gap: 8px; transition: background 0.15s; }
.hb-btn-black::after { content: "→"; }
.hb-btn-black:hover { background: #333; }

/* ─── Sub rail ─── */
.hb-subrail { display: grid; grid-template-columns: 240px 1fr auto; align-items: center; padding: 10px 24px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mute); border-bottom: 1px solid var(--hair); }
.hb-subrail .crumbs { display: flex; gap: 10px; }
.hb-subrail .crumbs .sep { color: var(--mute-2); }
.hb-subrail .sections { display: flex; gap: 22px; justify-content: center; }
.hb-subrail .sections a.on { color: var(--ink); }
.hb-subrail .coords { display: flex; gap: 14px; }
.hb-subrail .coords span b { color: var(--ink); font-weight: 500; }

/* ─── Hero ─── */
.hb-hero { display: grid; grid-template-columns: 240px 1fr 260px; min-height: 620px; border-bottom: 1px solid var(--rule); position: relative; }
.hb-hero .col-l { border-right: 1px solid var(--hair); padding: 28px 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 28px; }
.hb-hero .eyebrow { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); }
.hb-hero .eyebrow .dot { width: 6px; height: 6px; background: var(--ink); border-radius: 50%; }
.hb-hero h1 { font-family: var(--mono); font-weight: 400; font-size: 68px; line-height: 0.95; letter-spacing: -0.035em; color: var(--ink); margin: 0 0 22px; text-wrap: balance; }
.hb-hero h1 em { font-style: normal; background: var(--ink); color: var(--bg); padding: 0 0.08em; font-weight: 500; }
.hb-hero h1 .ital { font-family: 'JetBrains Mono'; font-style: italic; font-weight: 300; color: var(--mute); }
.hb-hero .sub { font-family: var(--sans); font-size: 14px; line-height: 1.55; color: var(--ink-2); max-width: 440px; margin: 0 0 24px; }
.hb-hero .meta-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; border-top: 1px solid var(--hair); padding-top: 16px; max-width: 620px; }
.hb-hero .meta-strip dt { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); margin-bottom: 4px; }
.hb-hero .meta-strip dd { font-family: var(--mono); font-size: 22px; font-weight: 400; letter-spacing: -0.02em; margin: 0; }
.hb-hero .meta-strip dd small { font-size: 11px; color: var(--mute); margin-left: 3px; }
.hb-hero .col-c { position: relative; background: #d9d8d4; overflow: hidden; border-right: 1px solid var(--hair); }
.hb-hero .col-c img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); mix-blend-mode: multiply; }
.hb-hero .col-c .grid-overlay { position: absolute; inset: 0; background-image: repeating-linear-gradient(90deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 120px), repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 80px); pointer-events: none; }
.hb-hero .col-c .corner { position: absolute; font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: #fff; display: flex; align-items: center; gap: 6px; }
.hb-hero .col-c .corner .tick { width: 10px; height: 1px; background: currentColor; }
.hb-hero .col-c .corner.tl { top: 16px; left: 16px; color: var(--ink); }
.hb-hero .col-c .corner.tr { top: 16px; right: 16px; color: var(--ink); }
.hb-hero .col-c .corner.bl { bottom: 16px; left: 16px; color: #fff; }
.hb-hero .col-c .corner.br { bottom: 16px; right: 16px; color: #fff; }
.hb-hero .col-c .tag { position: absolute; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: #fff; background: rgba(11,11,11,0.85); padding: 6px 10px; display: flex; align-items: center; gap: 8px; backdrop-filter: blur(4px); }
.hb-hero .col-c .tag::before { content: ""; width: 6px; height: 6px; background: #fff; border-radius: 50%; }
.hb-hero .col-r { padding: 28px 22px; display: flex; flex-direction: column; gap: 22px; }
.hb-card-tile { border: 1px solid var(--hair); background: var(--paper); padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.hb-card-tile .head { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); }
.hb-card-tile .big { font-family: var(--mono); font-size: 30px; letter-spacing: -0.02em; font-weight: 400; line-height: 1; }
.hb-card-tile .big small { font-size: 12px; color: var(--mute); margin-left: 4px; }
.hb-card-tile .bar { height: 4px; background: var(--hair); position: relative; }
.hb-card-tile .bar span { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }
.hb-card-tile .note { font-family: var(--sans); font-size: 11px; color: var(--mute); line-height: 1.5; }
.hb-weather { border: 1px solid var(--ink); padding: 12px 14px; background: var(--ink); color: var(--bg); font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; display: flex; flex-direction: column; gap: 10px; }
.hb-weather .row { display: flex; justify-content: space-between; }
.hb-weather .big { font-size: 22px; letter-spacing: -0.01em; }

/* ─── Ticker ─── */
.hb-ticker { display: flex; align-items: center; border-bottom: 1px solid var(--rule); font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; height: 34px; overflow: hidden; }
.hb-ticker .label { background: var(--ink); color: var(--bg); padding: 0 14px; height: 100%; display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; white-space: nowrap; }
.hb-ticker .label::before { content: ""; width: 6px; height: 6px; background: #fff; border-radius: 50%; }
.hb-ticker .stream { flex: 1; overflow: hidden; white-space: nowrap; mask-image: linear-gradient(90deg, transparent, #000 5%, #000 95%, transparent); }
.hb-ticker .track { display: inline-flex; gap: 40px; padding-left: 24px; animation: hb-slide 60s linear infinite; }
@keyframes hb-slide { to { transform: translateX(-50%); } }
.hb-ticker .track span b { font-weight: 500; }
.hb-ticker .track span i { font-style: normal; color: var(--mute); }

/* ─── Section heading ─── */
.hb-sec-head { display: grid; grid-template-columns: 240px 1fr auto; align-items: end; padding: 52px 24px 22px; border-bottom: 1px solid var(--hair); }
.hb-sec-head .id { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); }
.hb-sec-head .id b { color: var(--ink); font-weight: 500; }
.hb-sec-head h2 { font-family: var(--mono); font-weight: 400; font-size: 44px; letter-spacing: -0.03em; line-height: 1; margin: 0; }
.hb-sec-head h2 .ital { font-style: italic; font-weight: 300; color: var(--mute); }
.hb-sec-head .right { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); }
.hb-sec-head .right a { border-bottom: 1px solid var(--ink); color: var(--ink); padding-bottom: 2px; }

/* ─── News + Preview + Contact row ─── */
.hb-row-news { display: grid; grid-template-columns: 240px 1fr 1fr 260px; border-bottom: 1px solid var(--rule); }
.hb-row-news > div { padding: 22px 24px 28px; border-right: 1px solid var(--hair); min-height: 360px; }
.hb-row-news > div:last-child { border-right: none; }
.hb-cell-head { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute); margin-bottom: 18px; padding-bottom: 10px; border-bottom: 1px solid var(--hair); }
.hb-cell-head h3 { font-family: var(--mono); font-size: 11px; font-weight: 500; color: var(--ink); letter-spacing: 0.14em; margin: 0; }
.hb-cell-head h3 .idx { color: var(--mute); margin-right: 8px; }
.hb-nav-local { display: flex; flex-direction: column; gap: 2px; }
.hb-nav-local a { display: flex; justify-content: space-between; align-items: center; font-family: var(--mono); font-size: 12px; padding: 10px 0; border-bottom: 1px dashed var(--hair); color: var(--ink); transition: padding 0.15s; }
.hb-nav-local a .idx { color: var(--mute); font-size: 10px; letter-spacing: 0.12em; width: 36px; }
.hb-nav-local a .lbl { flex: 1; }
.hb-nav-local a .arr { color: var(--mute); opacity: 0; transition: 0.15s; }
.hb-nav-local a:hover { padding-left: 4px; }
.hb-nav-local a:hover .arr { opacity: 1; }
.hb-news-list { display: flex; flex-direction: column; }
.hb-news-list a { display: grid; grid-template-columns: 28px 1fr 72px 80px; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--hair); font-family: var(--mono); font-size: 12px; transition: background 0.15s; }
.hb-news-list a .n { font-size: 10px; color: var(--mute); letter-spacing: 0.1em; }
.hb-news-list a .t { color: var(--ink); font-weight: 500; }
.hb-news-list a .cat { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute); border: 1px solid var(--hair); padding: 2px 6px; text-align: center; }
.hb-news-list a .d { font-size: 10px; color: var(--mute); letter-spacing: 0.08em; text-align: right; }
.hb-news-list a:hover { background: var(--paper); }
.hb-news-list a:hover .t { text-decoration: underline; }
.hb-preview { display: flex; flex-direction: column; gap: 14px; }
.hb-preview .frame { aspect-ratio: 4/3; background: #dcdbd7; border: 1px solid var(--hair); position: relative; overflow: hidden; }
.hb-preview .frame img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); }
.hb-preview .frame .tag { position: absolute; top: 10px; left: 10px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; background: var(--ink); color: var(--bg); padding: 3px 7px; z-index: 2; }
.hb-preview .frame .coord { position: absolute; bottom: 8px; left: 10px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.1em; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.6); z-index: 2; }
.hb-preview h4 { font-family: var(--mono); font-weight: 400; font-size: 18px; letter-spacing: -0.01em; line-height: 1.2; margin: 0; }
.hb-preview .meta-row { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--mute); }
.hb-preview p { font-family: var(--sans); font-size: 12px; line-height: 1.55; color: var(--ink-2); margin: 0; }
.hb-contact-card { display: flex; flex-direction: column; gap: 14px; }
.hb-contact-card .line { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--hair); font-family: var(--mono); font-size: 12px; }
.hb-contact-card .line span { color: var(--mute); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
.hb-contact-card .clock { border: 1px solid var(--ink); padding: 12px; display: flex; flex-direction: column; gap: 4px; background: var(--paper); }
.hb-contact-card .clock .t { font-family: var(--mono); font-size: 26px; letter-spacing: -0.02em; }
.hb-contact-card .clock .sub { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mute); }

/* ─── Project grid ─── */
.hb-projects { padding: 0 24px 40px; border-bottom: 1px solid var(--rule); }
.hb-proj-filters { display: flex; justify-content: space-between; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--hair); font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; flex-wrap: wrap; gap: 12px; }
.hb-proj-filters .chips { display: flex; gap: 8px; flex-wrap: wrap; }
.hb-proj-filters .chip { border: 1px solid var(--hair); padding: 6px 10px; color: var(--mute); cursor: pointer; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; }
.hb-proj-filters .chip.on { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.hb-proj-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--hair); border: 1px solid var(--hair); margin-top: 20px; }
.hb-proj { background: var(--bg); padding: 14px; display: flex; flex-direction: column; gap: 10px; cursor: pointer; position: relative; transition: background 0.15s; }
.hb-proj .frm { aspect-ratio: 4/5; background: #c9c8c4; position: relative; overflow: hidden; }
.hb-proj .frm img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.1); }
.hb-proj .frm .no { position: absolute; top: 10px; left: 10px; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.6); z-index: 2; }
.hb-proj .frm .stat { position: absolute; bottom: 10px; right: 10px; font-family: var(--mono); font-size: 9px; letter-spacing: 0.12em; color: #fff; background: rgba(0,0,0,0.6); padding: 2px 6px; z-index: 2; }
.hb-proj h5 { font-family: var(--mono); font-weight: 400; font-size: 16px; letter-spacing: -0.01em; margin: 0; }
.hb-proj .mm { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; color: var(--mute); }
.hb-proj:hover { background: var(--paper); }
.hb-proj:hover h5 { text-decoration: underline; }

/* ─── Process strip ─── */
.hb-process { display: grid; grid-template-columns: 240px repeat(4, 1fr); border-bottom: 1px solid var(--rule); }
.hb-process .label { padding: 24px; border-right: 1px solid var(--hair); display: flex; flex-direction: column; justify-content: space-between; }
.hb-process .label h3 { font-family: var(--mono); font-weight: 400; font-size: 20px; letter-spacing: -0.01em; margin: 0; }
.hb-process .step { padding: 24px; border-right: 1px solid var(--hair); display: flex; flex-direction: column; gap: 12px; min-height: 220px; }
.hb-process .step:last-child { border-right: none; }
.hb-process .step .n { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; color: var(--mute); }
.hb-process .step h4 { font-family: var(--mono); font-weight: 500; font-size: 16px; letter-spacing: -0.01em; margin: 0; }
.hb-process .step p { font-family: var(--sans); font-size: 12px; line-height: 1.55; color: var(--ink-2); margin: 0; }
.hb-process .step .mini { margin-top: auto; height: 40px; background: repeating-linear-gradient(90deg, rgba(0,0,0,0.15) 0 1px, transparent 1px 10px); border-top: 1px solid var(--hair); position: relative; }
.hb-process .step .mini::after { content: ""; position: absolute; bottom: 0; left: 0; height: 2px; background: var(--ink); }
.hb-process .step.s1 .mini::after { width: 25%; }
.hb-process .step.s2 .mini::after { width: 55%; }
.hb-process .step.s3 .mini::after { width: 80%; }
.hb-process .step.s4 .mini::after { width: 100%; }

/* ─── Page hero (about/journal/contact heads) ─── */
.hb-page-hero { border-bottom: 1px solid var(--rule); padding: 72px 24px 56px; }
.hb-page-hero .id { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--mute); margin-bottom: 18px; }
.hb-page-hero h1 { font-family: var(--mono); font-weight: 400; font-size: 56px; line-height: 1; letter-spacing: -0.03em; margin: 0 0 18px; max-width: 900px; }
.hb-page-hero h1 .ital { font-style: italic; font-weight: 300; color: var(--mute); }
.hb-page-hero .lead { font-family: var(--sans); font-size: 14px; line-height: 1.55; color: var(--ink-2); max-width: 600px; margin: 0; }

/* ─── Leadership grid (practice page) ─── */
.hb-team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--hair); border: 1px solid var(--hair); }
.hb-team { background: var(--bg); padding: 18px; display: flex; flex-direction: column; gap: 10px; }
.hb-team .frm { aspect-ratio: 1; background: #c9c8c4; position: relative; overflow: hidden; }
.hb-team .frm img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); }
.hb-team .no { font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; color: var(--mute); }
.hb-team h4 { font-family: var(--mono); font-weight: 400; font-size: 16px; margin: 0; }
.hb-team .role { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--mute); }

/* ─── Contact form ─── */
.hb-contact { padding: 72px 24px; display: grid; grid-template-columns: 360px 1fr; gap: 64px; max-width: 100%; }
.hb-contact .info ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
.hb-contact .info li { padding: 12px 0; border-bottom: 1px dashed var(--hair); font-family: var(--mono); font-size: 12px; display: flex; justify-content: space-between; }
.hb-contact .info li span { color: var(--mute); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
.hb-form { display: grid; gap: 14px; border: 1px solid var(--ink); padding: 32px; background: var(--paper); }
.hb-form input, .hb-form textarea { width: 100%; padding: 12px 14px; border: 1px solid var(--hair); border-radius: 0; background: var(--bg); font-family: var(--mono); font-size: 13px; color: var(--ink); }
.hb-form input:focus, .hb-form textarea:focus { outline: 0; border-color: var(--ink); }
.hb-form textarea { resize: vertical; min-height: 140px; }
.hb-form button { padding: 12px 20px; background: var(--ink); color: #fff; border: 0; font-family: var(--mono); font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 500; cursor: pointer; }

/* ─── Footer ─── */
.hb-footer { background: var(--ink); color: #eaeae7; padding: 48px 24px 24px; font-family: var(--mono); }
.hb-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 40px; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 32px; }
.hb-footer-grid h6 { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #8a8a85; margin: 0 0 14px; font-weight: 500; }
.hb-footer-grid ul { list-style: none; padding: 0; margin: 0; }
.hb-footer-grid ul li { padding: 5px 0; font-size: 12px; color: #d6d5d1; }
.hb-footer-grid ul li a { color: #d6d5d1; }
.hb-footer-grid ul li a:hover { color: #fff; }
.hb-footer .bigmark { font-size: 36px; letter-spacing: -0.03em; font-weight: 500; line-height: 1; margin-bottom: 12px; color: #fff; }
.hb-footer .brand-p { font-family: var(--sans); font-size: 12px; color: #a9a9a3; line-height: 1.6; max-width: 320px; margin: 0 0 18px; }
.hb-footer .addr { font-size: 11px; color: #d6d5d1; line-height: 1.7; }
.hb-footer .addr span { color: #8a8a85; width: 60px; display: inline-block; }
.hb-footer-bottom { display: flex; justify-content: space-between; align-items: center; padding-top: 20px; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #8a8a85; }
.hb-footer-bottom .dots { display: flex; gap: 14px; }

/* ─── Responsive ─── */
@media (max-width: 1100px) {
  .hb-util, .hb-mast, .hb-subrail, .hb-hero, .hb-row-news, .hb-process { grid-template-columns: 1fr; }
  .hb-mast { gap: 18px; }
  .hb-nav { gap: 18px; flex-wrap: wrap; justify-content: flex-start; }
  .hb-hero .col-l { border-right: 0; border-bottom: 1px solid var(--hair); }
  .hb-hero .col-c { min-height: 420px; border-right: 0; border-bottom: 1px solid var(--hair); }
  .hb-hero h1 { font-size: 48px; }
  .hb-proj-grid { grid-template-columns: repeat(2, 1fr); }
  .hb-team-grid { grid-template-columns: repeat(2, 1fr); }
  .hb-contact { grid-template-columns: 1fr; gap: 32px; }
  .hb-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  .hb-row-news > div { border-right: 0; border-bottom: 1px solid var(--hair); min-height: auto; }
  .hb-process .label { border-right: 0; border-bottom: 1px solid var(--hair); }
}
@media (max-width: 640px) {
  .hb-util, .hb-subrail { flex-direction: column; padding: 10px 16px; }
  .hb-util .l, .hb-util .m, .hb-util .r { justify-content: flex-start; gap: 10px; }
  .hb-mast { padding: 18px 16px; }
  .hb-hero { padding: 0; }
  .hb-hero .col-l, .hb-hero .col-r { padding: 20px 16px; }
  .hb-hero h1 { font-size: 36px; }
  .hb-sec-head { padding: 36px 16px 18px; }
  .hb-sec-head h2 { font-size: 28px; }
  .hb-row-news > div { padding: 18px 16px; }
  .hb-proj-grid { grid-template-columns: 1fr; }
  .hb-team-grid { grid-template-columns: 1fr; }
  .hb-contact { padding: 40px 16px; }
  .hb-page-hero { padding: 48px 16px 32px; }
  .hb-page-hero h1 { font-size: 32px; }
  .hb-footer-grid { grid-template-columns: 1fr; }
  .hb-footer-bottom { flex-direction: column; gap: 8px; }
}
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  HEADER (utility bar + masthead + subrail)
 * ═══════════════════════════════════════════════════════════════════ */

const headerHtml = `
<div class="hb-util">
  <div class="l"><span>HB ▲ 2026.04.22</span><span class="live">Live feed</span></div>
  <div class="m"><span>EN</span><span>·</span><span>KR</span><span>·</span><span>JP</span></div>
  <div class="r"><span>Careers (7)</span><span>IR</span><span>+82 52 268 6657</span></div>
</div>

<header class="hb-mast">
  <a class="hb-brand" href="index.html">
    <span class="mark">H</span>
    <span class="name">HomeBuilder<sub>EST. 1992 · ULSAN</sub></span>
  </a>
  <nav class="hb-nav" aria-label="주 메뉴">
    <a href="index.html" class="active"><span class="idx">01</span>Index</a>
    <a href="work.html"><span class="idx">02</span>Work</a>
    <a href="practice.html"><span class="idx">03</span>Practice</a>
    <a href="journal.html"><span class="idx">04</span>Journal</a>
    <a href="contact.html"><span class="idx">05</span>Contact</a>
  </nav>
  <div class="hb-cta">
    <div class="hb-search"><span>Search_</span><kbd>⌘K</kbd></div>
    <a href="contact.html" class="hb-btn-black">Request brief</a>
  </div>
</header>
`.trim();

const menuHtml = `<div id="hns_menu"></div>`;

/* ═══════════════════════════════════════════════════════════════════
 *  FOOTER
 * ═══════════════════════════════════════════════════════════════════ */

const footerHtml = `
<div class="hb-footer">
  <div class="hb-footer-grid">
    <div>
      <div class="bigmark">HomeBuilder</div>
      <p class="brand-p">Construction and development, Ulsan → nationwide. Powered by disciplined drawings, honest budgets and a crew that has been together, on average, eleven years.</p>
      <div class="addr">
        <div><span>Address</span> Sinjung-dong, Nam-gu, Ulsan 611-123, KR</div>
        <div><span>Tel</span> 82-52-268-6657</div>
        <div><span>Fax</span> 82-52-261-6628</div>
        <div><span>Hours</span> Mon–Fri · 09:00–18:00 KST</div>
      </div>
    </div>
    <div><h6>Work</h6><ul><li><a href="work.html">Residential</a></li><li><a href="work.html">Commercial</a></li><li><a href="work.html">Civic</a></li><li><a href="work.html">Industrial</a></li><li><a href="work.html">Heritage</a></li></ul></div>
    <div><h6>Practice</h6><ul><li><a href="practice.html">About</a></li><li><a href="practice.html">Leadership</a></li><li><a href="#">Careers (7)</a></li><li><a href="#">Press room</a></li><li><a href="#">Sustainability</a></li></ul></div>
    <div><h6>Resources</h6><ul><li><a href="journal.html">Journal</a></li><li><a href="#">Whitepapers</a></li><li><a href="#">Material passport</a></li><li><a href="#">Annual report ’25</a></li><li><a href="#">Investor relations</a></li></ul></div>
    <div><h6>Connect</h6><ul><li><a href="contact.html">Start a project</a></li><li><a href="#">help@homebuilder.co</a></li><li><a href="#">Newsletter</a></li><li><a href="#">LinkedIn</a></li><li><a href="#">Instagram</a></li></ul></div>
  </div>
  <div class="hb-footer-bottom">
    <div>© 1992–2026 HomeBuilder Co., Ltd · All rights reserved</div>
    <div class="dots"><span>Privacy</span><span>Terms</span><span>Cookies</span><span>AA</span><span>v2026.04.22</span></div>
  </div>
</div>
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  PAGES — 5 pages with atomic layering
 * ═══════════════════════════════════════════════════════════════════ */

let uidSeq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;

function pageHome() {
  const sSub = uid("obj_sec");
  const sHero = uid("obj_sec"), tag = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text"),
    cta = uid("obj_btn"), stats = uid("obj_text"),
    img1 = uid("obj_img"),
    card1 = uid("obj_card"), card2 = uid("obj_card"), weather = uid("obj_card");
  const sTicker = uid("obj_sec");
  const sNewsHead = uid("obj_sec"), newsHead = uid("obj_title");
  const sNewsRow = uid("obj_sec"),
    secsCard = uid("obj_card"), latestCard = uid("obj_card"), preview = uid("obj_card"), contactCard = uid("obj_card");
  const sProjHead = uid("obj_sec"), projHead = uid("obj_title");
  const sProj = uid("obj_sec");
  const p1 = uid("obj_card"), p1i = uid("obj_img");
  const p2 = uid("obj_card"), p2i = uid("obj_img");
  const p3 = uid("obj_card"), p3i = uid("obj_img");
  const p4 = uid("obj_card"), p4i = uid("obj_img");
  const sProcHead = uid("obj_sec"), procHead = uid("obj_title");
  const sProc = uid("obj_sec");

  return `
<div class="dragable" id="${sSub}">
  <div class="hb-subrail">
    <div class="crumbs"><span>/ index</span><span class="sep">—</span><span>spring dispatch</span></div>
    <div class="sections"><a class="on">Overview</a><a>News</a><a>Preview</a><a>Projects</a><a>Process</a><a>Contact</a></div>
    <div class="coords"><span>LAT <b>35.546</b></span><span>LON <b>129.316</b></span><span>ELV <b>14m</b></span></div>
  </div>
</div>

<div class="dragable" id="${sHero}">
  <section class="hb-hero">
    <div class="col-l">
      <div>
        <div class="dragable sol-replacible-text" id="${tag}"><div class="eyebrow"><span class="dot"></span><span>Dispatch № 046 — Q2 / 2026</span></div></div>
        <div class="dragable sol-replacible-text" id="${h1}"><h1>We build <em>enterprise</em><br>alongside the <span class="ital">customer.</span></h1></div>
        <div class="dragable sol-replacible-text" id="${lead}"><p class="sub">HomeBuilder is a construction and development company based in Ulsan, Korea. Since 1992 we have shaped 412 structures across residential, commercial and civic scales — from cold-formed steel systems to ninety-story towers.</p></div>
        <div class="dragable" id="${cta}"><a href="work.html" class="hb-btn-black">Current work, 2026</a></div>
      </div>
      <div class="dragable sol-replacible-text" id="${stats}">
        <dl class="meta-strip">
          <div><dt>Projects delivered</dt><dd>412<small>site</small></dd></div>
          <div><dt>In progress</dt><dd>18<small>active</small></dd></div>
          <div><dt>Team</dt><dd>240<small>staff</small></dd></div>
        </dl>
      </div>
    </div>
    <div class="col-c">
      <div class="dragable" id="${img1}"><img src="${IMG("modern skyscraper black and white urban architecture", 1200, 1200)}" alt="Skyline" /></div>
      <div class="grid-overlay"></div>
      <div class="corner tl"><span class="tick"></span><span>N 35°32'45"</span></div>
      <div class="corner tr"><span>E 129°18'57"</span><span class="tick"></span></div>
      <div class="corner bl"><span class="tick"></span><span>FRAME / 01 · 1920×1080</span></div>
      <div class="corner br"><span>EXPOSURE ƒ/8 · 1/250</span><span class="tick"></span></div>
      <div class="tag" style="top:36%;left:46%;">PHASE_03 · CORE POURED</div>
      <div class="tag" style="top:62%;left:28%;">TOWER B · 62 FL</div>
      <div class="tag" style="top:72%;left:68%;">OPENS 2027.Q4</div>
    </div>
    <div class="col-r">
      <div class="dragable de-group" id="${card1}">
        <div class="hb-card-tile">
          <div class="head"><span>Active site</span><span>A1</span></div>
          <div class="big">94<small>%</small></div>
          <div class="bar"><span style="width:94%"></span></div>
          <div class="note">Seongnam Civic Tower — structural phase nearing topping out, 3 weeks ahead of schedule.</div>
        </div>
      </div>
      <div class="dragable de-group" id="${card2}">
        <div class="hb-card-tile">
          <div class="head"><span>Order book</span><span>₩</span></div>
          <div class="big">4.82<small>T KRW</small></div>
          <div class="bar"><span style="width:66%"></span></div>
          <div class="note">FY2026 contracted pipeline as of April 22.</div>
        </div>
      </div>
      <div class="dragable de-group" id="${weather}">
        <div class="hb-weather">
          <div class="row"><span>ULSAN · 09:24</span><span>CLEAR</span></div>
          <div class="big">17°C / 62°F</div>
          <div class="row"><span>WIND 7kt NE</span><span>HUM 41%</span></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sTicker}">
  <div class="hb-ticker">
    <div class="label">Dispatch</div>
    <div class="stream">
      <div class="track">
        <span><b>046-A</b> <i>Topping-out —</i> Seongnam Civic Tower ▲</span>
        <span><b>046-B</b> <i>Awarded —</i> Busan North Port mixed-use, phase 2</span>
        <span><b>046-C</b> <i>Hired —</i> 18 new engineers, Q2 cohort</span>
        <span><b>046-D</b> <i>Published —</i> Material passport whitepaper v2</span>
        <span><b>046-E</b> <i>Completed —</i> Gangseo Residences, 312 units delivered</span>
        <span><b>046-F</b> <i>ESG —</i> Scope 1+2 emissions down 9.4% YoY</span>
        <span><b>046-A</b> <i>Topping-out —</i> Seongnam Civic Tower ▲</span>
        <span><b>046-B</b> <i>Awarded —</i> Busan North Port mixed-use, phase 2</span>
        <span><b>046-C</b> <i>Hired —</i> 18 new engineers, Q2 cohort</span>
        <span><b>046-D</b> <i>Published —</i> Material passport whitepaper v2</span>
        <span><b>046-E</b> <i>Completed —</i> Gangseo Residences, 312 units delivered</span>
        <span><b>046-F</b> <i>ESG —</i> Scope 1+2 emissions down 9.4% YoY</span>
      </div>
    </div>
  </div>
</div>

<div class="dragable" id="${sNewsHead}">
  <div class="hb-sec-head">
    <div class="id"><b>§02</b> / Dispatch</div>
    <div class="dragable sol-replacible-text" id="${newsHead}"><h2>News &amp; <span class="ital">Notice</span>.</h2></div>
    <div class="right"><span>18 entries</span><a href="journal.html">All dispatches →</a></div>
  </div>
</div>

<div class="dragable" id="${sNewsRow}">
  <div class="hb-row-news">
    <div>
      <div class="dragable de-group" id="${secsCard}">
        <div class="hb-cell-head"><h3><span class="idx">01</span>Sections</h3><span>6</span></div>
        <nav class="hb-nav-local">
          <a href="journal.html"><span class="idx">A.01</span><span class="lbl">Company notices</span><span class="arr">→</span></a>
          <a href="journal.html"><span class="idx">A.02</span><span class="lbl">Press releases</span><span class="arr">→</span></a>
          <a href="journal.html"><span class="idx">A.03</span><span class="lbl">Project milestones</span><span class="arr">→</span></a>
          <a href="#"><span class="idx">A.04</span><span class="lbl">Recruitment</span><span class="arr">→</span></a>
          <a href="#"><span class="idx">A.05</span><span class="lbl">Awards</span><span class="arr">→</span></a>
          <a href="#"><span class="idx">A.06</span><span class="lbl">Safety bulletins</span><span class="arr">→</span></a>
        </nav>
      </div>
    </div>
    <div>
      <div class="dragable de-group" id="${latestCard}">
        <div class="hb-cell-head"><h3><span class="idx">02</span>Latest</h3><span>04 / 18</span></div>
        <div class="hb-news-list">
          <a href="journal.html"><span class="n">01</span><span class="t">Seongnam Civic Tower tops out 3 weeks ahead of schedule</span><span class="cat">Milestone</span><span class="d">26.04.19</span></a>
          <a href="journal.html"><span class="n">02</span><span class="t">HomeBuilder awarded Busan North Port, Phase II</span><span class="cat">Press</span><span class="d">26.04.14</span></a>
          <a href="journal.html"><span class="n">03</span><span class="t">Spring hiring cohort — 18 engineering positions open</span><span class="cat">Hiring</span><span class="d">26.04.08</span></a>
          <a href="journal.html"><span class="n">04</span><span class="t">Material passport whitepaper, version 2 released</span><span class="cat">Paper</span><span class="d">26.03.28</span></a>
          <a href="journal.html"><span class="n">05</span><span class="t">Gangseo Residences — 312 units delivered on schedule</span><span class="cat">Milestone</span><span class="d">26.03.21</span></a>
          <a href="journal.html"><span class="n">06</span><span class="t">ESG report FY25: emissions down 9.4% YoY</span><span class="cat">Report</span><span class="d">26.03.14</span></a>
        </div>
      </div>
    </div>
    <div>
      <div class="dragable de-group" id="${preview}">
        <div class="hb-cell-head"><h3><span class="idx">03</span>Company Preview</h3><span>FEATURED</span></div>
        <div class="hb-preview">
          <div class="frame">
            <div class="tag">THIS QUARTER</div>
            <img src="${IMG("concrete tower construction black and white", 800, 600)}" alt="Tower" />
            <div class="coord">35.546 N / 129.316 E · 286 m AGL</div>
          </div>
          <h4>Always, integrity comes first — the quiet discipline behind every pour.</h4>
          <div class="meta-row"><span>Letter from the CEO</span><span>04 min read</span></div>
          <p>Since 1992, we've measured ourselves not by square meters poured but by the integrity of the joints, the honesty of the drawings, and the families that return to live in what we make.</p>
        </div>
      </div>
    </div>
    <div>
      <div class="dragable de-group" id="${contactCard}">
        <div class="hb-cell-head"><h3><span class="idx">04</span>Customer Center</h3><span>24/7</span></div>
        <div class="hb-contact-card">
          <div class="clock">
            <div class="sub">Seoul · KST</div>
            <div class="t">09:24:07</div>
            <div class="sub">Desk open · 09:00 → 18:00</div>
          </div>
          <div class="line"><span>Tel</span><span>02-1234-5678</span></div>
          <div class="line"><span>Fax</span><span>02-1234-5679</span></div>
          <div class="line"><span>Email</span><span>help@homebuilder.co</span></div>
          <div class="line"><span>Line</span><span>@homebuilder</span></div>
          <a href="contact.html" class="hb-btn-black" style="margin-top:4px;">Start a project</a>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="dragable" id="${sProjHead}">
  <div class="hb-sec-head">
    <div class="id"><b>§03</b> / Archive</div>
    <div class="dragable sol-replacible-text" id="${projHead}"><h2>Selected <span class="ital">work</span>, 1992–2026.</h2></div>
    <div class="right"><span>412 total</span><a href="work.html">Open archive →</a></div>
  </div>
</div>

<div class="dragable" id="${sProj}">
  <section class="hb-projects">
    <div class="hb-proj-filters">
      <div class="chips">
        <span class="chip on">All</span>
        <span class="chip">Residential</span>
        <span class="chip">Commercial</span>
        <span class="chip">Civic</span>
        <span class="chip">Industrial</span>
      </div>
    </div>
    <div class="hb-proj-grid">
      <div class="dragable de-group" id="${p1}">
        <div class="hb-proj">
          <div class="frm">
            <div class="dragable" id="${p1i}"><img src="${IMG("concrete tower building monochrome construction", 400, 500)}" alt="Seongnam" /></div>
            <div class="no">№ 412</div>
            <div class="stat">IN PROGRESS</div>
          </div>
          <h5>Seongnam Civic Tower</h5>
          <div class="mm"><span>62 FL · 286 m</span><span>2024–27</span></div>
        </div>
      </div>
      <div class="dragable de-group" id="${p2}">
        <div class="hb-proj">
          <div class="frm">
            <div class="dragable" id="${p2i}"><img src="${IMG("modern residential apartment building facade", 400, 500)}" alt="Gangseo" /></div>
            <div class="no">№ 408</div>
            <div class="stat">DELIVERED</div>
          </div>
          <h5>Gangseo Residences</h5>
          <div class="mm"><span>312 units · 28 FL</span><span>2022–26</span></div>
        </div>
      </div>
      <div class="dragable de-group" id="${p3}">
        <div class="hb-proj">
          <div class="frm">
            <div class="dragable" id="${p3i}"><img src="${IMG("industrial warehouse architecture minimal", 400, 500)}" alt="Busan" /></div>
            <div class="no">№ 407</div>
            <div class="stat">DESIGN PHASE</div>
          </div>
          <h5>Busan North Port II</h5>
          <div class="mm"><span>Mixed-use · 4 blocks</span><span>2026–29</span></div>
        </div>
      </div>
      <div class="dragable de-group" id="${p4}">
        <div class="hb-proj">
          <div class="frm">
            <div class="dragable" id="${p4i}"><img src="${IMG("heritage brick building restoration korea", 400, 500)}" alt="Heritage" /></div>
            <div class="no">№ 401</div>
            <div class="stat">COMPLETE</div>
          </div>
          <h5>Munhwa Heritage Annex</h5>
          <div class="mm"><span>Restoration · 3 FL</span><span>2023–25</span></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sProcHead}">
  <div class="hb-sec-head">
    <div class="id"><b>§04</b> / Method</div>
    <div class="dragable sol-replacible-text" id="${procHead}"><h2>How we <span class="ital">build</span>.</h2></div>
    <div class="right"><a href="#">Full process manual →</a></div>
  </div>
</div>

<div class="dragable" id="${sProc}">
  <section class="hb-process">
    <div class="label">
      <h3>Four phases,<br>measured in weeks,<br>not promises.</h3>
      <span style="font-family:var(--mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mute);">04 / 04</span>
    </div>
    <div class="step s1">
      <span class="n">01 — Brief</span>
      <h4>Brief &amp; survey</h4>
      <p>Site visit, land use review, local climate and seismic baselines. First cost envelope returns in week three.</p>
      <div class="mini"></div>
    </div>
    <div class="step s2">
      <span class="n">02 — Design</span>
      <h4>Schematic &amp; DD</h4>
      <p>Massing, structure and MEP co-developed. Every drawing signed off against the same material passport.</p>
      <div class="mini"></div>
    </div>
    <div class="step s3">
      <span class="n">03 — Build</span>
      <h4>Ground break</h4>
      <p>Daily site log, weekly owner walk-through, fortnightly cost reconciliation. No surprises on invoice day.</p>
      <div class="mini"></div>
    </div>
    <div class="step s4">
      <span class="n">04 — Hand over</span>
      <h4>Commission &amp; keys</h4>
      <p>Sensors calibrated, manuals in the local language, 24-month warranty starts the morning you move in.</p>
      <div class="mini"></div>
    </div>
  </section>
</div>
`.trim();
}

function pageWork() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec");
  const projects = [
    ["Seongnam Civic Tower", "62 FL · 286 m", "2024–27", "IN PROGRESS", "concrete tower civic building construction"],
    ["Gangseo Residences", "312 units · 28 FL", "2022–26", "DELIVERED", "modern residential tower apartment korea"],
    ["Busan North Port II", "Mixed-use · 4 blocks", "2026–29", "DESIGN", "industrial port development architecture"],
    ["Munhwa Heritage Annex", "Restoration · 3 FL", "2023–25", "COMPLETE", "heritage brick restoration building"],
    ["Ulsan Innovation Park", "Campus · 8 blocks", "2025–28", "IN PROGRESS", "modern corporate campus monochrome"],
    ["Dongdaemun Tower", "48 FL · 220 m", "2021–25", "DELIVERED", "glass office tower skyscraper minimal"],
    ["Incheon Logistics Hub", "Industrial · 240k m²", "2024–26", "IN PROGRESS", "large industrial warehouse korea"],
    ["Suncheon Civic Library", "Public · 4 FL", "2023–25", "COMPLETE", "modern library public building concrete"],
  ].map((p) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    [0]: p[0], [1]: p[1], [2]: p[2], [3]: p[3], [4]: p[4],
  }));
  const grid = projects
    .map((p, i) => `
      <div class="dragable de-group" id="${p.id}">
        <div class="hb-proj">
          <div class="frm">
            <div class="dragable" id="${p.imgId}"><img src="${IMG(p[4], 400, 500)}" alt="${p[0]}" /></div>
            <div class="no">№ ${412 - i}</div>
            <div class="stat">${p[3]}</div>
          </div>
          <h5>${p[0]}</h5>
          <div class="mm"><span>${p[1]}</span><span>${p[2]}</span></div>
        </div>
      </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="hb-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><div class="id">§02 / Archive</div></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>The <span class="ital">archive</span> — 412 structures, 1992→2026.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">Filter by typology, decade, or scale. Each entry links to a project dossier with drawings, contractors, and the day we handed over the keys.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="hb-projects">
    <div class="hb-proj-filters">
      <div class="chips">
        <span class="chip on">All</span>
        <span class="chip">Residential</span>
        <span class="chip">Commercial</span>
        <span class="chip">Civic</span>
        <span class="chip">Industrial</span>
        <span class="chip">Heritage</span>
      </div>
    </div>
    <div class="hb-proj-grid">${grid}
    </div>
  </section>
</div>
`.trim();
}

function pagePractice() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), eye2 = uid("obj_text"), h2 = uid("obj_title");
  const team = [
    ["01", "Kang Jiwoo", "Managing Director", "korean businessman architect portrait minimal"],
    ["02", "Park Minseo", "Head of Design", "korean female architect portrait black white"],
    ["03", "Lee Hyunwoo", "Chief Engineer", "asian male engineer portrait professional"],
    ["04", "Choi Dahyun", "Director of Operations", "korean female executive portrait minimal"],
    ["05", "Jung Sung-min", "Sustainability Lead", "asian environmental engineer portrait"],
    ["06", "Han Jaemin", "Materials Research", "asian male scientist portrait serious"],
    ["07", "Kim Yeon-ah", "Client Services", "korean female professional portrait minimal"],
    ["08", "Oh Ji-hoon", "Safety & Compliance", "korean male supervisor portrait"],
  ].map((t) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    n: t[0], name: t[1], role: t[2], q: t[3],
  }));
  const grid = team.map((t) => `
      <div class="dragable de-group" id="${t.id}">
        <div class="hb-team">
          <div class="no">№ ${t.n}</div>
          <div class="frm"><div class="dragable" id="${t.imgId}"><img src="${IMG(t.q, 400, 400)}" alt="${t.name}" /></div></div>
          <h4>${t.name}</h4>
          <div class="role">${t.role}</div>
        </div>
      </div>`).join("");
  return `
<div class="dragable" id="${s1}">
  <section class="hb-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><div class="id">§03 / Practice</div></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>A <span class="ital">disciplined</span> practice — 34 years of building in Ulsan.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">240 staff across design, structural engineering, MEP, sustainability, and site operations. Crew tenure averages eleven years — the same eyes on your drawings return to the site on pour day.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="hb-projects">
    <div class="hb-sec-head" style="padding:0 0 22px;grid-template-columns:auto 1fr auto;">
      <div class="id"><b>§A</b> / Leadership</div>
      <div class="dragable sol-replacible-text" id="${h2}"><h2>The <span class="ital">people</span>.</h2></div>
      <div class="right"><span>8 of 240</span></div>
    </div>
    <div class="hb-team-grid">${grid}
    </div>
  </section>
</div>
`.trim();
}

function pageJournal() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), list = uid("obj_text");
  return `
<div class="dragable" id="${s1}">
  <section class="hb-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><div class="id">§04 / Journal</div></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>Dispatches &amp; <span class="ital">notices</span>.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">Company notices, press releases, project milestones, hiring, awards, safety bulletins. Sorted by date, newest first.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="hb-projects" style="padding-top:24px;">
    <div class="dragable sol-replacible-text" id="${list}">
      <div class="hb-news-list">
        <a href="#"><span class="n">01</span><span class="t">Seongnam Civic Tower tops out 3 weeks ahead of schedule</span><span class="cat">Milestone</span><span class="d">26.04.19</span></a>
        <a href="#"><span class="n">02</span><span class="t">HomeBuilder awarded Busan North Port, Phase II</span><span class="cat">Press</span><span class="d">26.04.14</span></a>
        <a href="#"><span class="n">03</span><span class="t">Spring hiring cohort — 18 engineering positions open</span><span class="cat">Hiring</span><span class="d">26.04.08</span></a>
        <a href="#"><span class="n">04</span><span class="t">Material passport whitepaper, version 2 released</span><span class="cat">Paper</span><span class="d">26.03.28</span></a>
        <a href="#"><span class="n">05</span><span class="t">Gangseo Residences — 312 units delivered on schedule</span><span class="cat">Milestone</span><span class="d">26.03.21</span></a>
        <a href="#"><span class="n">06</span><span class="t">ESG report FY25: Scope 1+2 emissions down 9.4% YoY</span><span class="cat">Report</span><span class="d">26.03.14</span></a>
        <a href="#"><span class="n">07</span><span class="t">Safety bulletin — updated scaffolding protocols, April revision</span><span class="cat">Safety</span><span class="d">26.03.02</span></a>
        <a href="#"><span class="n">08</span><span class="t">Munhwa Heritage Annex receives 2026 Preservation Award</span><span class="cat">Award</span><span class="d">26.02.18</span></a>
        <a href="#"><span class="n">09</span><span class="t">New partnership with regional timber co-op announced</span><span class="cat">Press</span><span class="d">26.02.05</span></a>
        <a href="#"><span class="n">10</span><span class="t">Q4 2025 earnings: revenue up 12%, backlog at 4.8T KRW</span><span class="cat">IR</span><span class="d">26.01.28</span></a>
        <a href="#"><span class="n">11</span><span class="t">New Seoul satellite office opens in Gangnam-gu</span><span class="cat">Notice</span><span class="d">26.01.15</span></a>
        <a href="#"><span class="n">12</span><span class="t">Lunar New Year — offices closed Jan 28 – Feb 2</span><span class="cat">Notice</span><span class="d">26.01.08</span></a>
      </div>
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
  <section class="hb-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><div class="id">§05 / Contact</div></div>
    <div class="dragable sol-replacible-text" id="${h}"><h1>Start a <span class="ital">project</span> — or send a question.</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">Tell us where, what and roughly when. We answer within one business day, and propose a feasibility walk-through within one week.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="hb-contact">
    <div class="info">
      <div class="dragable sol-replacible-text" id="${info}">
        <ul>
          <li><span>Address</span>Sinjung-dong, Nam-gu, Ulsan 611-123, KR</li>
          <li><span>Tel</span>82-52-268-6657</li>
          <li><span>Fax</span>82-52-261-6628</li>
          <li><span>Email</span>help@homebuilder.co</li>
          <li><span>Hours</span>Mon–Fri · 09:00–18:00 KST</li>
          <li><span>Line</span>@homebuilder</li>
        </ul>
      </div>
    </div>
    <form class="hb-form" onsubmit="return false;">
      <input type="text" placeholder="Company / Owner" />
      <input type="text" placeholder="Contact name" />
      <input type="email" placeholder="Email" />
      <input type="tel" placeholder="Phone (optional)" />
      <input type="text" placeholder="Project site — city / district" />
      <textarea placeholder="Project brief — typology, scale, timeline, budget range"></textarea>
      <button type="button">Request brief →</button>
    </form>
  </section>
</div>
`.trim();
}

const pagesSnapshot = [
  { slug: "index",    title: "Index",    isHome: true,  showInMenu: true, sortOrder: 0, lang: "ko", content: { html: pageHome() } },
  { slug: "work",     title: "Work",     isHome: false, showInMenu: true, sortOrder: 1, lang: "ko", content: { html: pageWork() } },
  { slug: "practice", title: "Practice", isHome: false, showInMenu: true, sortOrder: 2, lang: "ko", content: { html: pagePractice() } },
  { slug: "journal",  title: "Journal",  isHome: false, showInMenu: true, sortOrder: 3, lang: "ko", content: { html: pageJournal() } },
  { slug: "contact",  title: "Contact",  isHome: false, showInMenu: true, sortOrder: 4, lang: "ko", content: { html: pageContact() } },
];

/* ═══════════════════════════════════════════════════════════════════
 *  UPSERT
 * ═══════════════════════════════════════════════════════════════════ */

const pool = new pg.Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    const name = "HomeBuilder";
    const category = "business";
    const description = "모노크롬 · 테크 포워드 건설/개발 템플릿. JetBrains Mono + Inter, 좌표·지표·티커 UI. 5페이지 완성본";
    const keywords = "construction,architecture,mono,monochrome,tech,business,건설,건축,개발,모노,프리미엄";
    const thumbnailUrl = IMG("concrete tower construction black white architecture", 800, 600);
    const id = `tpl_hb_${Date.now().toString(36)}`;
    const path = `system/homebuilder-${Date.now().toString(36)}`;
    const sortOrder = 0;

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
      console.log(`✓ Updated existing HomeBuilder template: ${existingId}`);
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
      console.log(`✓ Inserted new HomeBuilder template: ${id}`);
    }
    console.log(`   · path:       ${path}`);
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
