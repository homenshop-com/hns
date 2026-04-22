/**
 * Seed the "Plus Academy" modern education template (2026-04-22).
 *
 * Ported from a Claude Design handoff bundle. The original was a
 * single-page React + Babel prototype; this script converts it into
 * a 5-page static template that runs in the homeNshop editor.
 *
 * Design system preserved:
 *   - Palette: bg #fafaf7, ink #0f1511, accent oklch(0.62 0.14 148) (green)
 *   - Type:    Pretendard Variable (sans) + JetBrains Mono (labels/nums)
 *   - Rhythm:  1360px max, 40px gutters, 1px lines, 10px / pill radii
 *   - Details: mono uppercase labels, tabular nums, oklch accents
 *
 * Conversions applied for the editor (atomic layering):
 *   - Every title/text/image/button is its own `.dragable` + obj_* ID
 *   - Text layers carry `sol-replacible-text`
 *   - Card groups get `de-group`
 *   - Internal links use relative paths (`about.html`, not `/about.html`)
 *   - Images via Pexels proxy absolute URL
 *   - menuHtml is the empty `<div id="hns_menu"></div>` wrapper;
 *     nav lives in headerHtml only (publisher dedup rule)
 *
 * Run on the server:
 *   DATABASE_URL="$(grep DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '"')" \
 *     node /var/www/homenshop-next/scripts/seed-plus-academy-template.mjs
 */

import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

const IMG = (q, w, h) =>
  `https://homenshop.com/api/img?q=${encodeURIComponent(q)}&w=${w}&h=${h}`;

/* ═══════════════════════════════════════════════════════════════════
 *  CSS — design tokens + all component styles in one sheet
 * ═══════════════════════════════════════════════════════════════════ */

const cssText = `
/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root {
  --bg: #fafaf7;
  --panel: #ffffff;
  --ink: #0f1511;
  --ink-2: #3a423d;
  --ink-3: #6b7269;
  --ink-4: #9ba199;
  --line: #e6e7e2;
  --line-2: #eeefe9;
  --accent: oklch(0.62 0.14 148);
  --accent-soft: oklch(0.94 0.04 148);
  --accent-ink: oklch(0.32 0.08 148);
  --warn: oklch(0.72 0.14 70);
  --brand-color: var(--accent-ink);
  --brand-accent: var(--accent);
  --brand-font: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  --radius: 10px;
  --radius-sm: 6px;
}
/* HNS-THEME-TOKENS:END */

body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--brand-font); font-feature-settings: "ss01", "ss02", "tnum"; }
a { color: inherit; text-decoration: none; }
* { box-sizing: border-box; }
.pa-mono { font-family: var(--mono); font-weight: 400; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }

/* ─── Top Bar (dark) ─── */
.pa-topbar { background: #0f1511; color: #cfd3cb; font-size: 12px; }
.pa-topbar-inner { max-width: 100%; margin: 0; padding: 0 40px; display: flex; justify-content: space-between; align-items: center; height: 36px; }
.pa-topbar-left { display: flex; gap: 18px; align-items: center; }
.pa-topbar-left .loc { color: #6f7770; letter-spacing: 0.08em; font-size: 10px; font-family: var(--mono); }
.pa-topbar-left .sep { width: 1px; height: 12px; background: #2a2f2c; }
.pa-topbar-left .hours { display: inline-flex; gap: 6px; align-items: center; color: #cfd3cb; }
.pa-topbar-right { display: flex; gap: 18px; align-items: center; }
.pa-topbar-right a { color: #cfd3cb; }
.pa-topbar-right .lang { display: inline-flex; gap: 4px; align-items: center; }

/* ─── GNB Header ─── */
.pa-gnb { border-bottom: 1px solid var(--line); background: #fff; position: sticky; top: 0; z-index: 50; }
.pa-gnb-inner { max-width: 100%; margin: 0; padding: 0 40px; display: flex; align-items: center; height: 84px; }
.pa-brand { display: flex; align-items: center; gap: 12px; color: var(--ink); }
.pa-brand-mark { width: 32px; height: 32px; border-radius: 7px; border: 1.6px solid var(--accent-ink); display: grid; place-items: center; color: var(--accent-ink); font-family: var(--mono); font-weight: 700; font-size: 14px; }
.pa-brand-tag { font-size: 10px; letter-spacing: 0.22em; color: var(--ink-3); font-family: var(--mono); }
.pa-brand-name { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; }
.pa-nav { display: flex; gap: 2px; margin-left: 72px; }
.pa-nav a { padding: 8px 16px; font-size: 14px; font-weight: 500; color: var(--ink-2); border-bottom: 2px solid transparent; letter-spacing: -0.01em; transition: color 0.12s, border-color 0.12s; }
.pa-nav a:hover, .pa-nav a.is-active { color: var(--ink); border-bottom-color: var(--accent); }
.pa-gnb-tools { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.pa-icon-btn { width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--line); display: grid; place-items: center; color: var(--ink-2); background: #fff; }
.pa-cta-btn { padding: 10px 18px; border-radius: 999px; background: var(--ink); color: #fff !important; font-size: 13px; font-weight: 500; display: inline-flex; gap: 6px; align-items: center; }

/* ─── Common section wrap ─── */
.pa-wrap { max-width: 100%; margin: 0; padding: 0 40px; }
.pa-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 5px 10px 5px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); font-size: 12px; font-weight: 500; }
.pa-eyebrow .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
.pa-muted { color: var(--ink-3); }
.pa-mono-lbl { font-family: var(--mono); font-size: 10px; color: var(--ink-4); letter-spacing: 0.14em; }

/* ─── Hero ─── */
.pa-hero { background: linear-gradient(180deg, #fafaf7 0%, #f4f5ef 100%); border-bottom: 1px solid var(--line); position: relative; overflow: hidden; }
.pa-hero-meta-top { position: absolute; top: 0; left: 0; right: 0; padding: 14px 40px; display: flex; justify-content: space-between; font-family: var(--mono); font-size: 10px; color: var(--ink-4); letter-spacing: 0.14em; }
.pa-hero-grid { max-width: 100%; margin: 0; padding: 60px 40px 0; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; min-height: 560px; }
.pa-hero-copy { padding-top: 56px; position: relative; }
.pa-hero h1 { font-size: 88px; line-height: 0.98; letter-spacing: -0.035em; font-weight: 600; margin: 28px 0 0; color: var(--ink); }
.pa-hero h1 .em { color: var(--accent-ink); display: block; }
.pa-hero .lead { margin-top: 28px; font-size: 17px; line-height: 1.55; color: var(--ink-2); max-width: 480px; }
.pa-hero-ctas { display: flex; gap: 10px; margin-top: 36px; }
.pa-btn-primary { padding: 14px 22px; border-radius: 999px; background: var(--ink); color: #fff !important; font-size: 14px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center; border: 0; cursor: pointer; }
.pa-btn-outline { padding: 14px 22px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 500; display: inline-flex; gap: 8px; align-items: center; color: var(--ink); cursor: pointer; }
.pa-hero-stats { margin-top: 56px; display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); padding-top: 24px; max-width: 520px; }
.pa-hero-stats .v { font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
.pa-hero-stats .l { font-size: 11px; color: var(--ink-3); margin-top: 4px; font-family: var(--mono); letter-spacing: 0.06em; text-transform: uppercase; }
.pa-hero-media { padding-top: 56px; padding-bottom: 56px; position: relative; }
.pa-hero-stage { position: relative; height: 480px; }
.pa-hero-img-1 { position: absolute; left: 8%; top: 4%; width: 52%; height: 92%; border-radius: 6px; overflow: hidden; background: #e8eae3; }
.pa-hero-img-1 img { width: 100%; height: 100%; object-fit: cover; }
.pa-hero-img-2 { position: absolute; right: 0%; top: 22%; width: 46%; height: 72%; border-radius: 6px; overflow: hidden; background: #dde5d1; }
.pa-hero-img-2 img { width: 100%; height: 100%; object-fit: cover; }
.pa-chip { position: absolute; padding: 10px 14px; background: #fff; border: 1px solid var(--line); border-radius: 8px; display: flex; gap: 10px; align-items: center; box-shadow: 0 6px 18px rgba(0,0,0,.04); }
.pa-chip-class { left: 2%; top: 68%; }
.pa-chip-class .ico { width: 32px; height: 32px; border-radius: 6px; background: var(--accent-soft); color: var(--accent-ink); display: grid; place-items: center; font-size: 16px; }
.pa-chip-class .t1 { font-size: 12px; color: var(--ink-3); }
.pa-chip-class .t2 { font-size: 14px; font-weight: 600; }
.pa-chip-live { right: 4%; top: 8%; padding: 14px 18px; background: var(--ink); color: #fff; border-radius: 8px; min-width: 140px; box-shadow: 0 6px 18px rgba(0,0,0,.08); }
.pa-chip-live .lbl { font-family: var(--mono); font-size: 10px; color: #9ba199; letter-spacing: 0.12em; }
.pa-chip-live .num { font-size: 22px; font-weight: 600; margin-top: 4px; letter-spacing: -0.02em; }
.pa-chip-live .num .sub { font-size: 12px; color: #c3c8bf; font-weight: 400; }
.pa-hero-strip { max-width: 100%; margin: 0; padding: 0 40px; }
.pa-hero-strip-inner { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; border-top: 1px solid var(--line); background: var(--line); }
.pa-hero-strip-cell { background: #fafaf7; padding: 22px 28px; display: flex; gap: 16px; align-items: center; }
.pa-hero-strip-ico { width: 44px; height: 44px; border-radius: 8px; background: #fff; border: 1px solid var(--line); display: grid; place-items: center; color: var(--accent-ink); font-size: 18px; flex-shrink: 0; }
.pa-hero-strip-cell .k { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.pa-hero-strip-cell .v { font-size: 13px; color: var(--ink-3); margin-top: 2px; }
.pa-hero-strip-cell a { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; color: var(--ink-2); }

/* ─── Main grid ─── */
.pa-main { padding: 72px 0 0; }
.pa-main-grid { max-width: 100%; margin: 0; padding: 0 40px; display: grid; grid-template-columns: 260px 1fr 1fr 280px; gap: 20px; align-items: start; }

/* QuickLinks */
.pa-quick { display: grid; gap: 10px; }
.pa-quick a { display: flex; justify-content: space-between; align-items: center; padding: 18px 20px; background: #fff; border: 1px solid var(--line); border-radius: 10px; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.pa-quick a:hover { border-color: var(--accent); transform: translateY(-1px); }
.pa-quick .t { font-size: 15px; font-weight: 600; margin-top: 6px; letter-spacing: -0.01em; color: var(--ink); }
.pa-quick .s { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.pa-quick .ico { width: 34px; height: 34px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); display: grid; place-items: center; flex-shrink: 0; }

/* Feed cards */
.pa-feed { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 22px 24px; }
.pa-feed-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
.pa-feed-head h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
.pa-feed-head .kor { font-size: 12px; color: var(--ink-3); margin-left: 10px; }
.pa-feed-more { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; color: var(--ink-2); cursor: pointer; background: transparent; border: 0; }
.pa-feed-list { margin: 0; padding: 0; list-style: none; }
.pa-feed-item { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 11px 0; border-top: 1px solid var(--line-2); }
.pa-cat-badge { font-family: var(--mono); font-size: 10px; padding: 3px 7px; border-radius: 4px; background: #f2f3ee; color: var(--ink-2); letter-spacing: 0.06em; }
.pa-cat-badge.news { background: var(--accent-soft); color: var(--accent-ink); }
.pa-feed-title { font-size: 14px; color: var(--ink); letter-spacing: -0.01em; display: inline-flex; gap: 8px; align-items: center; }
.pa-new-badge { font-size: 9px; padding: 2px 5px; border-radius: 3px; background: var(--ink); color: #fff; font-family: var(--mono); letter-spacing: 0.08em; }
.pa-feed-date { font-family: var(--mono); font-size: 11px; color: var(--ink-4); font-variant-numeric: tabular-nums; }

/* Right column */
.pa-right-col { display: grid; gap: 12px; }
.pa-preview { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 20px; display: flex; gap: 14px; align-items: center; }
.pa-preview-thumb { width: 72px; height: 72px; border-radius: 8px; background: #e8eae3 repeating-linear-gradient(135deg, rgba(15,21,17,0.05) 0 1px, transparent 1px 8px); flex-shrink: 0; overflow: hidden; }
.pa-preview-thumb img { width: 100%; height: 100%; object-fit: cover; }
.pa-preview .t { font-size: 14px; font-weight: 600; }
.pa-preview .s { font-size: 12px; color: var(--ink-3); margin-top: 2px; }
.pa-play-btn { width: 40px; height: 40px; border-radius: 999px; background: var(--accent); color: #fff; display: grid; place-items: center; flex-shrink: 0; border: 0; cursor: pointer; }
.pa-contact-center { background: linear-gradient(180deg, #fff 0%, #f4f5ef 100%); border: 1px solid var(--line); border-radius: 10px; padding: 24px; position: relative; overflow: hidden; }
.pa-contact-center .phone-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; }
.pa-contact-center .phone-ico { width: 36px; height: 36px; border-radius: 8px; background: var(--ink); color: #fff; display: grid; place-items: center; flex-shrink: 0; }
.pa-contact-center .phone-num { font-size: 26px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pa-hours { margin-top: 16px; display: grid; gap: 6px; font-size: 13px; color: var(--ink-2); }
.pa-hours > div { display: flex; justify-content: space-between; }
.pa-hours > div:first-child { padding-bottom: 6px; border-bottom: 1px solid var(--line-2); }
.pa-hours .k { color: var(--ink-3); }
.pa-hours .v { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.pa-contact-btns { display: flex; gap: 8px; margin-top: 16px; }
.pa-contact-btns button { flex: 1; padding: 10px 0; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; }
.pa-contact-btns button.pri { background: var(--ink); color: #fff; border: 0; }
.pa-contact-btns button.sec { background: #fff; border: 1px solid var(--line); color: var(--ink); }

/* Program Banner (dark) */
.pa-banner-wrap { padding-top: 72px; }
.pa-banner { max-width: 100%; margin: 0; padding: 28px 32px; background: var(--ink); color: #fff; border-radius: 10px; position: relative; overflow: hidden; }
.pa-banner::before { content: ""; position: absolute; right: -40px; top: -20px; width: 260px; height: 260px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, oklch(0.55 0.14 148) 0%, transparent 70%); opacity: 0.4; pointer-events: none; }
.pa-banner-inner { display: grid; grid-template-columns: 1.1fr 1fr; gap: 32px; position: relative; }
.pa-banner h2 { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; margin: 10px 0 0; line-height: 1.2; }
.pa-banner h2 .em { color: oklch(0.82 0.14 148); display: block; }
.pa-banner p { color: #c3c8bf; font-size: 13px; margin: 12px 0 0; line-height: 1.5; max-width: 360px; }
.pa-banner-cta { margin-top: 18px; padding: 10px 18px; border-radius: 999px; background: oklch(0.82 0.14 148); color: var(--ink) !important; font-size: 13px; font-weight: 600; display: inline-flex; gap: 8px; align-items: center; border: 0; cursor: pointer; }
.pa-banner-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pa-banner-card { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; justify-content: space-between; }
.pa-banner-card .t { font-size: 14px; font-weight: 600; margin-top: 6px; letter-spacing: -0.01em; }
.pa-banner-card .s { font-size: 11px; color: #9ba199; margin-top: 4px; }
.pa-banner-card button { margin-top: 14px; align-self: flex-start; padding: 6px 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.2); background: transparent; font-size: 11px; color: #fff; cursor: pointer; }

/* KPI marquee */
.pa-kpi-wrap { padding: 72px 0 0; }
.pa-kpi { max-width: 100%; margin: 0; padding: 0 40px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.pa-kpi-cell { padding: 24px 20px; border-left: 1px solid var(--line-2); }
.pa-kpi-cell:first-child { border-left: 0; }
.pa-kpi-cell .v { font-size: 32px; font-weight: 600; letter-spacing: -0.02em; margin-top: 8px; font-variant-numeric: tabular-nums; }
.pa-kpi-cell .l { font-size: 12px; color: var(--ink-3); margin-top: 2px; }

/* ─── Footer ─── */
.pa-footer { border-top: 1px solid var(--line); margin-top: 72px; background: #fff; }
.pa-footer-inner { max-width: 100%; margin: 0; padding: 48px 40px 40px; display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 48px; }
.pa-footer-brand { display: flex; align-items: center; gap: 10px; color: var(--ink); }
.pa-footer-brand .nm { font-size: 16px; font-weight: 700; }
.pa-footer-copy { font-size: 12px; color: var(--ink-3); margin-top: 14px; line-height: 1.55; }
.pa-footer-col h4 { font-size: 14px; font-weight: 600; margin: 6px 0 10px; letter-spacing: -0.01em; }
.pa-footer-col-items { display: grid; gap: 4px; font-size: 12px; color: var(--ink-3); line-height: 1.7; }
.pa-footer-col-items a { color: var(--ink-3); }
.pa-footer-col-items a:hover { color: var(--ink); }
.pa-footer-bottom { border-top: 1px solid var(--line-2); }
.pa-footer-bottom-inner { max-width: 100%; margin: 0; padding: 18px 40px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--ink-4); }
.pa-footer-bottom .pa-mono { letter-spacing: 0.08em; }

/* ─── Simple hero (for non-home pages) ─── */
.pa-page-hero { background: linear-gradient(180deg, #fafaf7 0%, #f4f5ef 100%); border-bottom: 1px solid var(--line); padding: 80px 40px 72px; text-align: center; }
.pa-page-hero h1 { font-size: 56px; letter-spacing: -0.03em; font-weight: 600; margin: 16px 0 12px; line-height: 1.05; }
.pa-page-hero .lead { font-size: 16px; color: var(--ink-2); max-width: 600px; margin: 0 auto; line-height: 1.6; }
.pa-section { padding: 72px 40px; }
.pa-section-head { max-width: 100%; margin: 0 0 40px; }
.pa-section-head h2 { font-size: 40px; letter-spacing: -0.025em; font-weight: 600; margin: 12px 0 0; line-height: 1.1; }
.pa-section-head .lead { margin-top: 12px; font-size: 15px; line-height: 1.65; color: var(--ink-3); max-width: 520px; }
.pa-sec-soft { background: var(--panel); }

/* Course grid */
.pa-course-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; max-width: 100%; margin: 0; }
.pa-course-card { background: #fff; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; transition: border-color 0.2s, transform 0.2s; }
.pa-course-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.pa-course-thumb { aspect-ratio: 4/3; overflow: hidden; background: #eef0e9; }
.pa-course-thumb img { width: 100%; height: 100%; object-fit: cover; }
.pa-course-body { padding: 20px 22px; }
.pa-course-cat { font-family: var(--mono); font-size: 10px; color: var(--ink-4); letter-spacing: 0.12em; text-transform: uppercase; }
.pa-course-card h3 { margin: 8px 0 6px; font-size: 18px; font-weight: 600; letter-spacing: -0.015em; }
.pa-course-card p { margin: 0 0 14px; font-size: 13px; color: var(--ink-3); line-height: 1.6; }
.pa-course-meta { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--ink-2); border-top: 1px solid var(--line-2); padding-top: 12px; }

/* Team grid */
.pa-team-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; max-width: 100%; margin: 0; }
.pa-team-card { }
.pa-team-photo { aspect-ratio: 3/4; border-radius: 10px; overflow: hidden; background: #eef0e9; margin-bottom: 14px; }
.pa-team-photo img { width: 100%; height: 100%; object-fit: cover; }
.pa-team-card h4 { margin: 0; font-size: 15px; font-weight: 600; }
.pa-team-card .role { margin: 2px 0 4px; font-size: 12px; color: var(--ink-3); font-family: var(--mono); letter-spacing: 0.04em; }
.pa-team-card .bio { margin: 6px 0 0; font-size: 12px; color: var(--ink-3); line-height: 1.55; }

/* Notice full list */
.pa-notice-full { max-width: 100%; margin: 0; background: #fff; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.pa-notice-full .pa-feed-item { padding: 16px 24px; border-top: 1px solid var(--line-2); }
.pa-notice-full .pa-feed-item:first-child { border-top: 0; }

/* Contact form */
.pa-contact-grid { max-width: 100%; margin: 0; display: grid; grid-template-columns: 1fr 1.2fr; gap: 48px; align-items: start; }
.pa-contact-info ul { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 14px; }
.pa-contact-info li { display: flex; gap: 12px; align-items: flex-start; font-size: 14px; color: var(--ink-2); }
.pa-contact-info li b { display: block; margin-bottom: 3px; color: var(--ink); }
.pa-contact-form { padding: 32px; border-radius: 10px; background: #fff; border: 1px solid var(--line); display: grid; gap: 12px; }
.pa-contact-form input, .pa-contact-form textarea { width: 100%; padding: 12px 14px; border: 1px solid var(--line); border-radius: 6px; font-family: inherit; font-size: 14px; background: #fff; color: var(--ink); }
.pa-contact-form input:focus, .pa-contact-form textarea:focus { outline: 0; border-color: var(--ink); }
.pa-contact-form textarea { resize: vertical; min-height: 120px; }
.pa-contact-form button { padding: 13px 22px; background: var(--ink); color: #fff; border: 0; border-radius: 999px; font-weight: 500; font-size: 14px; cursor: pointer; }

/* ─── Responsive ─── */
@media (max-width: 1200px) {
  .pa-main-grid { grid-template-columns: 1fr 1fr; }
  .pa-main-grid > :first-child,
  .pa-main-grid > :nth-child(4) { grid-column: span 2; }
  .pa-hero-grid { grid-template-columns: 1fr; gap: 32px; }
  .pa-hero h1 { font-size: 64px; }
  .pa-hero-media { display: none; }
  .pa-course-grid { grid-template-columns: repeat(2, 1fr); }
  .pa-team-grid { grid-template-columns: repeat(2, 1fr); }
  .pa-banner-inner, .pa-contact-grid { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .pa-gnb-inner { height: 64px; }
  .pa-nav { display: none; }
  .pa-topbar-left .hours { display: none; }
  .pa-hero h1 { font-size: 42px; }
  .pa-hero-grid { padding: 40px 20px 0; }
  .pa-hero-copy { padding-top: 40px; }
  .pa-hero-strip-inner { grid-template-columns: 1fr; }
  .pa-main-grid, .pa-wrap { padding: 0 20px; }
  .pa-main-grid { grid-template-columns: 1fr; gap: 16px; }
  .pa-main-grid > :first-child, .pa-main-grid > :nth-child(4) { grid-column: auto; }
  .pa-section { padding: 48px 20px; }
  .pa-section-head h2, .pa-page-hero h1 { font-size: 32px; }
  .pa-page-hero { padding: 56px 20px 48px; }
  .pa-course-grid, .pa-team-grid, .pa-kpi { grid-template-columns: 1fr 1fr; }
  .pa-footer-inner { grid-template-columns: 1fr 1fr; gap: 28px; padding: 40px 20px 28px; }
  .pa-footer-bottom-inner { flex-direction: column; gap: 8px; padding: 14px 20px; }
}
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  HEADER (top bar + GNB)
 * ═══════════════════════════════════════════════════════════════════ */

const headerHtml = `
<div class="pa-topbar">
  <div class="pa-topbar-inner">
    <div class="pa-topbar-left">
      <span class="loc">PLUS ACADEMY · ULSAN</span>
      <span class="sep"></span>
      <span class="hours"><i class="fa-regular fa-clock" style="opacity:.7;"></i> 평일 09:00–20:00 · 토요일 09:00–12:00</span>
    </div>
    <div class="pa-topbar-right">
      <a href="#">로그인</a>
      <a href="#">회원가입</a>
      <a href="#" class="lang"><i class="fa-solid fa-globe"></i> KR</a>
    </div>
  </div>
</div>

<div class="pa-gnb">
  <div class="pa-gnb-inner">
    <a class="pa-brand" href="index.html">
      <span class="pa-brand-mark">P+</span>
      <div style="line-height:1.05;">
        <div class="pa-brand-tag">PLUS ACADEMY</div>
        <div class="pa-brand-name">플러스 아카데미</div>
      </div>
    </a>
    <nav class="pa-nav" aria-label="주 메뉴">
      <a href="index.html">Home</a>
      <a href="about.html">About Us</a>
      <a href="courses.html">Courses</a>
      <a href="notice.html">Notice</a>
      <a href="contact.html">Contact</a>
    </nav>
    <div class="pa-gnb-tools">
      <button type="button" class="pa-icon-btn" aria-label="검색">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      <a href="contact.html" class="pa-cta-btn">
        수강 신청 <i class="fa-solid fa-arrow-right"></i>
      </a>
    </div>
  </div>
</div>
`.trim();

const menuHtml = `<div id="hns_menu"></div>`;

/* ═══════════════════════════════════════════════════════════════════
 *  FOOTER
 * ═══════════════════════════════════════════════════════════════════ */

const footerHtml = `
<div class="pa-footer">
  <div class="pa-footer-inner">
    <div>
      <a class="pa-footer-brand" href="index.html">
        <span class="pa-brand-mark" style="width:28px;height:28px;font-size:12px;">P+</span>
        <div class="nm">Plus Academy</div>
      </a>
      <p class="pa-footer-copy">
        Powered by homeNshop.com<br/>
        당신의 다음 한 달을 설계하는 아카데미.
      </p>
    </div>
    <div class="pa-footer-col">
      <div class="pa-mono-lbl">ADDRESS</div>
      <h4>Address</h4>
      <div class="pa-footer-col-items">
        <div>sinjung-dong NAM-Gu</div>
        <div>ULSAN Korea [611-123]</div>
      </div>
    </div>
    <div class="pa-footer-col">
      <div class="pa-mono-lbl">CONTACT</div>
      <h4>Contact</h4>
      <div class="pa-footer-col-items">
        <div>TEL · 82-52-268-6657</div>
        <div>FAX · 82-52-261-6628</div>
      </div>
    </div>
    <div class="pa-footer-col">
      <div class="pa-mono-lbl">SITEMAP</div>
      <h4>Navigation</h4>
      <div class="pa-footer-col-items">
        <a href="about.html">About · </a><a href="courses.html">Courses</a>
        <a href="notice.html">Notice</a>
        <a href="contact.html">Contact</a>
      </div>
    </div>
  </div>
  <div class="pa-footer-bottom">
    <div class="pa-footer-bottom-inner">
      <span class="pa-mono">© 2026 PLUS ACADEMY — ALL RIGHTS RESERVED</span>
      <span class="pa-mono">v2.0 · BUILD 2026-04-22</span>
    </div>
  </div>
</div>
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  PAGES
 * ═══════════════════════════════════════════════════════════════════ */

let uidSeq = 0;
const uid = (p) => `${p}_${Date.now().toString(36)}_${(uidSeq++).toString(36)}`;

function pageHome() {
  const s1 = uid("obj_sec"),
    tag = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text"),
    b1 = uid("obj_btn"), b2 = uid("obj_btn"),
    stats = uid("obj_text"),
    img1 = uid("obj_img"), img2 = uid("obj_img"),
    chipA = uid("obj_text"), chipB = uid("obj_text"),
    strip1 = uid("obj_card"), strip2 = uid("obj_card");
  const s2 = uid("obj_sec");
  const q1 = uid("obj_card"), q2 = uid("obj_card"), q3 = uid("obj_card");
  const fNotice = uid("obj_card"), fNews = uid("obj_card");
  const pv = uid("obj_card"), cc = uid("obj_card");
  const s3 = uid("obj_sec");
  const s4 = uid("obj_sec");

  return `
<div class="dragable" id="${s1}">
  <section class="pa-hero">
    <div class="pa-hero-meta-top">
      <span>HERO · 01 / 학습 시스템</span>
      <span>PLUS-ACADEMY / HOMEPAGE / 2026</span>
    </div>
    <div class="pa-hero-grid">
      <div class="pa-hero-copy">
        <div class="dragable sol-replacible-text" id="${tag}"><span class="pa-eyebrow"><span class="dot"></span>누구든지 쉽게 배우는 Plus Academy만의 방법</span></div>
        <div class="dragable sol-replacible-text" id="${h1}"><h1>한 달 만에<span class="em">성적 올리기</span></h1></div>
        <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">정확한 진단과 개인별 커리큘럼. 한 달, 두 달, 반년. 단계별로 확실하게.</p></div>
        <div class="pa-hero-ctas">
          <div class="dragable" id="${b1}"><a href="about.html" class="pa-btn-primary">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a></div>
          <div class="dragable" id="${b2}"><a href="courses.html" class="pa-btn-outline"><i class="fa-solid fa-play"></i> 강의 맛보기</a></div>
        </div>
        <div class="dragable sol-replacible-text" id="${stats}">
          <div class="pa-hero-stats">
            <div><div class="v">+42%</div><div class="l">평균 성적 향상</div></div>
            <div><div class="v">12주</div><div class="l">한 사이클</div></div>
            <div><div class="v">1:6</div><div class="l">관리 밀도</div></div>
          </div>
        </div>
      </div>
      <div class="pa-hero-media">
        <div class="pa-hero-stage">
          <div class="dragable" id="${img1}"><div class="pa-hero-img-1"><img src="${IMG("korean teacher in classroom minimal portrait", 700, 1100)}" alt="Lead instructor" /></div></div>
          <div class="dragable" id="${img2}"><div class="pa-hero-img-2"><img src="${IMG("korean student studying with laptop", 600, 900)}" alt="Student" /></div></div>
          <div class="dragable sol-replacible-text" id="${chipA}">
            <div class="pa-chip pa-chip-class">
              <div class="ico"><i class="fa-solid fa-book"></i></div>
              <div style="line-height:1.15;">
                <div class="t1">오늘 개강</div>
                <div class="t2">고3 모의고사 특강</div>
              </div>
            </div>
          </div>
          <div class="dragable sol-replacible-text" id="${chipB}">
            <div class="pa-chip pa-chip-live">
              <div class="lbl">LIVE NOW</div>
              <div class="num">284 <span class="sub">수강 중</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="pa-hero-strip">
      <div class="pa-hero-strip-inner">
        <div class="dragable de-group" id="${strip1}">
          <div class="pa-hero-strip-cell">
            <div class="pa-hero-strip-ico"><i class="fa-solid fa-pen-to-square"></i></div>
            <div style="flex:1;">
              <div class="k">우수 강사진</div>
              <div class="v">학생들을 위해 구성된 우수한 강사선생님을 모시고 수업을 진행합니다.</div>
            </div>
            <a href="about.html">자세히 <i class="fa-solid fa-arrow-right"></i></a>
          </div>
        </div>
        <div class="dragable de-group" id="${strip2}">
          <div class="pa-hero-strip-cell">
            <div class="pa-hero-strip-ico"><i class="fa-solid fa-clipboard-list"></i></div>
            <div style="flex:1;">
              <div class="k">특별한 교육 방법</div>
              <div class="v">학생들을 사로잡는 특별한 교육 비법을 가르쳐 줍니다.</div>
            </div>
            <a href="courses.html">자세히 <i class="fa-solid fa-arrow-right"></i></a>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="pa-main">
    <div class="pa-main-grid">
      <aside class="pa-quick">
        <div class="dragable de-group" id="${q1}">
          <a href="courses.html">
            <div>
              <div class="pa-mono-lbl">APPLY / 01</div>
              <div class="t">온라인 강좌 수강신청</div>
              <div class="s">지금 바로 신청하세요</div>
            </div>
            <span class="ico"><i class="fa-solid fa-arrow-right"></i></span>
          </a>
        </div>
        <div class="dragable de-group" id="${q2}">
          <a href="courses.html">
            <div>
              <div class="pa-mono-lbl">BOOKS / 02</div>
              <div class="t">아카데미 추천 교재</div>
              <div class="s">추천 교재 신청하기</div>
            </div>
            <span class="ico"><i class="fa-solid fa-arrow-right"></i></span>
          </a>
        </div>
        <div class="dragable de-group" id="${q3}">
          <a href="notice.html">
            <div>
              <div class="pa-mono-lbl">INFO / 03</div>
              <div class="t">2026 수능 정보 나눔</div>
              <div class="s">입시 자료실 바로가기</div>
            </div>
            <span class="ico"><i class="fa-solid fa-arrow-right"></i></span>
          </a>
        </div>
      </aside>

      <div class="dragable de-group" id="${fNotice}">
        <section class="pa-feed">
          <header class="pa-feed-head">
            <div><h3>Notice</h3><span class="kor">— 공지사항</span></div>
            <a href="notice.html" class="pa-feed-more">전체보기 <i class="fa-solid fa-plus"></i></a>
          </header>
          <ul class="pa-feed-list">
            <li class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">2026학년도 수시 대비반 개강 안내 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-22</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">5월 학부모 설명회 — 현장 신청 시작 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-20</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge">안내</span><span class="pa-feed-title">주말 단과반 시간표 개편 공지</span><span class="pa-feed-date">2026-04-18</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">장학 프로그램 2026-1학기 접수</span><span class="pa-feed-date">2026-04-15</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge">안내</span><span class="pa-feed-title">울산 본원 이전 관련 운영 시간</span><span class="pa-feed-date">2026-04-10</span></li>
          </ul>
        </section>
      </div>

      <div class="dragable de-group" id="${fNews}">
        <section class="pa-feed">
          <header class="pa-feed-head">
            <div><h3>News</h3><span class="kor">— 뉴스</span></div>
            <a href="notice.html" class="pa-feed-more">전체보기 <i class="fa-solid fa-plus"></i></a>
          </header>
          <ul class="pa-feed-list">
            <li class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">Plus Academy, 2025 교육 브랜드 대상 수상 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-21</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge news">PRESS</span><span class="pa-feed-title">AI 학습 진단 도구 베타 오픈</span><span class="pa-feed-date">2026-04-17</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">제8회 지역 모의고사 경시대회 개최</span><span class="pa-feed-date">2026-04-12</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge news">PRESS</span><span class="pa-feed-title">교사 연구자 포럼 — 하반기 일정</span><span class="pa-feed-date">2026-04-08</span></li>
            <li class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">온라인 강좌 플랫폼 2.0 업데이트</span><span class="pa-feed-date">2026-04-02</span></li>
          </ul>
        </section>
      </div>

      <div class="pa-right-col">
        <div class="dragable de-group" id="${pv}">
          <div class="pa-preview">
            <div class="pa-preview-thumb"><img src="${IMG("online class video preview", 200, 200)}" alt="preview" /></div>
            <div style="flex:1;">
              <div class="t">강좌 맛보기</div>
              <div class="s">무료로 강의를 들으신 후 결정하세요</div>
            </div>
            <button type="button" class="pa-play-btn" aria-label="재생"><i class="fa-solid fa-play"></i></button>
          </div>
        </div>

        <div class="dragable de-group" id="${cc}">
          <div class="pa-contact-center">
            <div class="pa-mono-lbl">고객 상담 센터 · CUSTOMER CARE</div>
            <div class="phone-row">
              <div class="phone-ico"><i class="fa-solid fa-phone"></i></div>
              <div class="phone-num">1566-1234</div>
            </div>
            <div class="pa-hours">
              <div><span class="k">평일</span><span class="v">AM 09:00 — PM 20:00</span></div>
              <div><span class="k">토요일</span><span class="v">AM 09:00 — PM 12:00</span></div>
            </div>
            <div class="pa-contact-btns">
              <button type="button" class="pri">상담 예약</button>
              <button type="button" class="sec">채팅 문의</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${s3}">
  <section class="pa-banner-wrap">
    <div class="pa-banner">
      <div class="pa-banner-inner">
        <div>
          <div class="pa-mono-lbl" style="color:#9ba199;">WEEKEND / INTENSIVE</div>
          <h2>기초부터 탄탄하게<span class="em">주말 단과반 모집</span></h2>
          <p>기초가 탄탄하면 아카데미의 단과부터 시작하세요. 매주 토요일 09:00 개강.</p>
          <a href="courses.html" class="pa-banner-cta">바로가기 <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="pa-banner-cards">
          <div class="pa-banner-card">
            <div>
              <div class="pa-mono-lbl" style="color:#8b918a;">MIDDLE</div>
              <div class="t">중등 / 대입 학습 시스템</div>
              <div class="s">꼼꼼하게 대비하고 싶으시면 신청하기</div>
            </div>
            <button type="button">신청하기</button>
          </div>
          <div class="pa-banner-card">
            <div>
              <div class="pa-mono-lbl" style="color:#8b918a;">HIGH-3</div>
              <div class="t">고등부 3년 모의고사</div>
              <div class="s">꼼꼼하게 대비하고 싶으시면 신청하기</div>
            </div>
            <button type="button">신청하기</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${s4}">
  <section class="pa-kpi-wrap">
    <div class="pa-kpi">
      <div class="pa-kpi-cell"><div class="pa-mono-lbl">KPI / 01</div><div class="v">12y+</div><div class="l">교육 업력</div></div>
      <div class="pa-kpi-cell"><div class="pa-mono-lbl">KPI / 02</div><div class="v">38</div><div class="l">전임 강사</div></div>
      <div class="pa-kpi-cell"><div class="pa-mono-lbl">KPI / 03</div><div class="v">2,840+</div><div class="l">재학생 누적</div></div>
      <div class="pa-kpi-cell"><div class="pa-mono-lbl">KPI / 04</div><div class="v">94%</div><div class="l">재수강률</div></div>
    </div>
  </section>
</div>
`.trim();
}

function pageAbout() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), eye2 = uid("obj_text"), h2 = uid("obj_title"), p2 = uid("obj_text");
  const s3 = uid("obj_sec"), eye3 = uid("obj_text"), h3 = uid("obj_title");
  const members = [
    ["이지우", "KOREAN · 국어", "korean female teacher portrait minimal"],
    ["박도윤", "ENGLISH · 영어", "korean male teacher portrait minimal"],
    ["최서연", "MATH · 수학", "asian female math teacher minimal"],
    ["김한결", "SCIENCE · 과학", "asian male science teacher minimal"],
  ].map(([n, r, q]) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    nameId: uid("obj_title"),
    n, r, q,
  }));

  return `
<div class="dragable" id="${s1}">
  <section class="pa-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="pa-mono-lbl">ABOUT / PLUS ACADEMY</span></div>
    <div class="dragable sol-replacible-text" id="${h1}"><h1>가르침을<br/>다시 설계합니다</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">2013년 설립 이후 12년 동안 학생 한 명 한 명의 속도와 관심에 맞춘 커리큘럼을 설계해 왔습니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="pa-section">
    <div class="pa-section-head">
      <div class="dragable sol-replacible-text" id="${eye2}"><span class="pa-mono-lbl">OUR MISSION</span></div>
      <div class="dragable sol-replacible-text" id="${h2}"><h2>혼자서도 될 만큼<br/>단단한 루틴을 설계합니다</h2></div>
      <div class="dragable sol-replacible-text" id="${p2}"><p class="lead">성적은 결국 루틴의 결과입니다. Plus Academy는 학생이 혼자 있는 시간에도 공부가 돌아가도록, 주간 플래너·오답 노트·멘토링 루틴을 함께 설계합니다.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${s3}">
  <section class="pa-section pa-sec-soft">
    <div class="pa-section-head">
      <div class="dragable sol-replacible-text" id="${eye3}"><span class="pa-mono-lbl">TEACHERS</span></div>
      <div class="dragable sol-replacible-text" id="${h3}"><h2>함께하는 강사진</h2></div>
    </div>
    <div class="pa-team-grid">
      ${members.map((m) => `
      <div class="dragable de-group" id="${m.id}">
        <div class="pa-team-card">
          <div class="dragable" id="${m.imgId}"><div class="pa-team-photo"><img src="${IMG(m.q, 500, 700)}" alt="${m.n}" /></div></div>
          <div class="dragable sol-replacible-text" id="${m.nameId}">
            <h4>${m.n}</h4>
            <div class="role">${m.r}</div>
            <p class="bio">입시와 현장 경험을 바탕으로 학생 개개인의 속도를 존중하는 수업을 합니다.</p>
          </div>
        </div>
      </div>`).join("")}
    </div>
  </section>
</div>
`.trim();
}

function pageCourses() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec");
  const courses = [
    ["국어 정규반", "KOREAN", "독해·문법·고전 시가를 체계적으로.", "classroom korean language"],
    ["영어 정규반", "ENGLISH", "어휘·문법·독해·듣기 균형 커리큘럼.", "english lesson classroom"],
    ["수학 정규반", "MATH", "개념·유형·심화까지 3단계 관리.", "math class whiteboard"],
    ["과학 정규반", "SCIENCE", "물리·화학·생명·지구과학 선택.", "science lab class"],
    ["주말 단과반", "WEEKEND", "핵심만 빠르게, 매주 토요일 개강.", "korean students study group"],
    ["온라인 강좌", "ONLINE", "어디서든 수강, 녹화본 무제한.", "online learning laptop"],
  ].map(([t, cat, s, q]) => ({
    id: uid("obj_card"),
    imgId: uid("obj_img"),
    textId: uid("obj_title"),
    t, cat, s, q,
  }));
  return `
<div class="dragable" id="${s1}">
  <section class="pa-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="pa-mono-lbl">COURSES</span></div>
    <div class="dragable sol-replacible-text" id="${h1}"><h1>학습 단계별<br/>맞춤 커리큘럼</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">중등·고등·주말 단과·온라인까지. 학생의 일정과 목표에 맞는 과정을 제안합니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="pa-section">
    <div class="pa-course-grid">
      ${courses.map((c) => `
      <div class="dragable de-group" id="${c.id}">
        <a href="contact.html" class="pa-course-card">
          <div class="dragable" id="${c.imgId}"><div class="pa-course-thumb"><img src="${IMG(c.q, 800, 600)}" alt="${c.t}" /></div></div>
          <div class="dragable sol-replacible-text" id="${c.textId}">
            <div class="pa-course-body">
              <div class="pa-course-cat">${c.cat}</div>
              <h3>${c.t}</h3>
              <p>${c.s}</p>
              <div class="pa-course-meta">
                <span>주 3회 · 90분</span>
                <span>신청하기 →</span>
              </div>
            </div>
          </div>
        </a>
      </div>`).join("")}
    </div>
  </section>
</div>
`.trim();
}

function pageNotice() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), list = uid("obj_text");
  return `
<div class="dragable" id="${s1}">
  <section class="pa-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="pa-mono-lbl">NOTICE · PRESS</span></div>
    <div class="dragable sol-replacible-text" id="${h1}"><h1>공지사항 · 보도자료</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">Plus Academy의 새 소식과 운영 공지를 확인하세요.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="pa-section">
    <div class="dragable sol-replacible-text" id="${list}">
      <div class="pa-notice-full">
        <div class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">2026학년도 수시 대비반 개강 안내 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-22</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">Plus Academy, 2025 교육 브랜드 대상 수상 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-21</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">5월 학부모 설명회 — 현장 신청 시작 <span class="pa-new-badge">NEW</span></span><span class="pa-feed-date">2026-04-20</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge">안내</span><span class="pa-feed-title">주말 단과반 시간표 개편 공지</span><span class="pa-feed-date">2026-04-18</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge news">PRESS</span><span class="pa-feed-title">AI 학습 진단 도구 베타 오픈</span><span class="pa-feed-date">2026-04-17</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge">공지</span><span class="pa-feed-title">장학 프로그램 2026-1학기 접수</span><span class="pa-feed-date">2026-04-15</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">제8회 지역 모의고사 경시대회 개최</span><span class="pa-feed-date">2026-04-12</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge">안내</span><span class="pa-feed-title">울산 본원 이전 관련 운영 시간</span><span class="pa-feed-date">2026-04-10</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge news">PRESS</span><span class="pa-feed-title">교사 연구자 포럼 — 하반기 일정</span><span class="pa-feed-date">2026-04-08</span></div>
        <div class="pa-feed-item"><span class="pa-cat-badge news">NEWS</span><span class="pa-feed-title">온라인 강좌 플랫폼 2.0 업데이트</span><span class="pa-feed-date">2026-04-02</span></div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageContact() {
  const s1 = uid("obj_sec"), eye = uid("obj_text"), h1 = uid("obj_title"), lead = uid("obj_text");
  const s2 = uid("obj_sec"), info = uid("obj_text"), heading = uid("obj_title");
  return `
<div class="dragable" id="${s1}">
  <section class="pa-page-hero">
    <div class="dragable sol-replacible-text" id="${eye}"><span class="pa-mono-lbl">CONTACT</span></div>
    <div class="dragable sol-replacible-text" id="${h1}"><h1>문의 · 상담 예약</h1></div>
    <div class="dragable sol-replacible-text" id="${lead}"><p class="lead">아카데미 방문, 전화, 온라인 상담 모두 가능합니다. 아래 양식을 작성해주시면 담당자가 24시간 내 회신드립니다.</p></div>
  </section>
</div>

<div class="dragable" id="${s2}">
  <section class="pa-section">
    <div class="pa-contact-grid">
      <div class="pa-contact-info">
        <div class="dragable sol-replacible-text" id="${heading}">
          <div class="pa-mono-lbl">GET IN TOUCH</div>
          <h2 style="margin: 10px 0 0; font-size: 28px; letter-spacing: -0.02em; font-weight: 600;">연락처 정보</h2>
        </div>
        <div class="dragable sol-replacible-text" id="${info}">
          <ul>
            <li><i class="fa-solid fa-phone" style="color: var(--accent-ink); margin-top: 4px;"></i><div><b>전화</b>1566-1234 (평일 09:00–20:00 · 토 09:00–12:00)</div></li>
            <li><i class="fa-solid fa-envelope" style="color: var(--accent-ink); margin-top: 4px;"></i><div><b>이메일</b>hello@plus-academy.example</div></li>
            <li><i class="fa-solid fa-location-dot" style="color: var(--accent-ink); margin-top: 4px;"></i><div><b>주소</b>울산광역시 남구 신정동 123-45, 4층</div></li>
            <li><i class="fa-solid fa-calendar-check" style="color: var(--accent-ink); margin-top: 4px;"></i><div><b>현장 상담</b>평일 오후 3시부터 예약 가능</div></li>
          </ul>
        </div>
      </div>
      <form class="pa-contact-form" onsubmit="return false;">
        <input type="text" placeholder="학생 이름" />
        <input type="text" placeholder="학부모 성함" />
        <input type="email" placeholder="이메일" />
        <input type="tel" placeholder="연락처" />
        <textarea placeholder="상담 희망 과목 · 학년 · 기타 요청사항"></textarea>
        <button type="button">상담 예약하기</button>
      </form>
    </div>
  </section>
</div>
`.trim();
}

const pagesSnapshot = [
  { slug: "index",    title: "홈",       isHome: true,  showInMenu: true, sortOrder: 0, lang: "ko", content: { html: pageHome() } },
  { slug: "about",    title: "소개",     isHome: false, showInMenu: true, sortOrder: 1, lang: "ko", content: { html: pageAbout() } },
  { slug: "courses",  title: "강좌",     isHome: false, showInMenu: true, sortOrder: 2, lang: "ko", content: { html: pageCourses() } },
  { slug: "notice",   title: "공지사항", isHome: false, showInMenu: true, sortOrder: 3, lang: "ko", content: { html: pageNotice() } },
  { slug: "contact",  title: "문의",     isHome: false, showInMenu: true, sortOrder: 4, lang: "ko", content: { html: pageContact() } },
];

/* ═══════════════════════════════════════════════════════════════════
 *  UPSERT
 * ═══════════════════════════════════════════════════════════════════ */

const pool = new pg.Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    const name = "Plus Academy";
    const category = "education";
    const description = "미니멀 모던 교육 · 학원 · 아카데미 템플릿. Pretendard + JetBrains Mono, 녹색 oklch 강조. 5페이지 완성본";
    const keywords = "academy,education,school,minimal,modern,pretendard,교육,학원,아카데미,입시,과외";
    const thumbnailUrl = IMG("korean teacher in classroom minimal portrait", 800, 600);
    const id = `tpl_plusac_${Date.now().toString(36)}`;
    const path = `system/plus-academy-${Date.now().toString(36)}`;
    // sortOrder = 0 → top of newest-first list.
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
      console.log(`✓ Updated existing Plus Academy template: ${existingId}`);
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
      console.log(`✓ Inserted new Plus Academy template: ${id}`);
    }
    console.log(`   · path: ${path}`);
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
