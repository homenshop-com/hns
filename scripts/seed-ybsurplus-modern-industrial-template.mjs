/**
 * Seed the "YoungBin Modern Industrial" template as eric.ahn09@gmail.com's
 * personal template (Template.userId = eric.ahn09's id, isPublic = false →
 * shows in "나의 템플릿" tab only).
 *
 * Ported from Claude Design handoff "youngbin-technology" (FaYaxP_a33xJ5ESNyWHQ8w):
 * an ASML/Lam-Research-inspired modern industrial redesign for the user's
 * existing ybsurplus.com site, matching brand info already on record.
 *
 * Pattern: same as POST /api/templates/save-from-site:
 *   1. Create a hidden Site with isTemplateStorage=true (the "demo / storage"
 *      site the template owns)
 *   2. Clone EN Pages onto that storage site
 *   3. Migrate EN Products + BoardCategories + BoardPosts from the source
 *      ybsurplus site into the storage site (so the template's preview
 *      shows the user's real catalog/board out of the box)
 *   4. Create a Template row pointing to demoSiteId = storage site
 *
 * Run on server:
 *   DATABASE_URL="$(grep DATABASE_URL /var/www/homenshop-next/.env | cut -d= -f2- | tr -d '"')" \
 *     node /var/www/homenshop-next/scripts/seed-ybsurplus-modern-industrial-template.mjs
 */

import pg from "pg";
import { randomBytes } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("DATABASE_URL is required"); process.exit(1); }

const OWNER_USER_ID  = "cmmq7zsqt4dc0c00e98142849"; // eric.ahn09@gmail.com
const SOURCE_SITE_ID = "cmmq7zu61ac29d9fceef2e756"; // ybsurplus

let cuidCounter = 0;
const uid = (prefix) => {
  cuidCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${cuidCounter.toString(36)}${randomBytes(3).toString("hex")}`;
};
const cuid = () => "c" + randomBytes(12).toString("hex");

/* ═══════════════════════════════════════════════════════════════════
 *  CSS — Modern Industrial (ASML/Lam Research aesthetic)
 *  Space Grotesk + Inter + JetBrains Mono · navy + cyan accent
 * ═══════════════════════════════════════════════════════════════════ */

const cssText = `
/* HNS-MODERN-TEMPLATE */
/* HNS-THEME-TOKENS:START */
:root {
  --yb-navy: #0a2540;
  --yb-navy-deep: #061a2e;
  --yb-navy-mid: #1e3a5f;
  --yb-blue: #2563eb;
  --yb-accent: #00b4d8;
  --yb-orange: #ea580c;
  --ink: #0a0e14;
  --slate-900: #0f172a;
  --slate-700: #334155;
  --slate-600: #475569;
  --slate-500: #64748b;
  --slate-400: #94a3b8;
  --slate-300: #cbd5e1;
  --slate-200: #e2e8f0;
  --slate-100: #f1f5f9;
  --slate-50: #f8fafc;
  --white: #ffffff;
  --brand-color: var(--yb-navy);
  --brand-accent: var(--yb-accent);
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-display: 'Space Grotesk', 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
  --brand-font: var(--font-sans);
}
/* HNS-THEME-TOKENS:END */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; font-family: var(--font-sans); font-size: 15px; line-height: 1.6; color: var(--ink); background: var(--white); -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
a { color: inherit; text-decoration: none; }
img { max-width: 100%; display: block; }
button { font-family: inherit; cursor: pointer; border: none; background: none; }

.yb-container { width: 100%; max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.yb-section { padding: 96px 0; }
.yb-section-tight { padding: 64px 0; }

/* ─── Utility bar ─── */
.yb-utility { background: var(--yb-navy-deep); color: var(--slate-300); font-size: 12px; letter-spacing: 0.04em; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
.yb-utility-inner { display: flex; justify-content: space-between; align-items: center; max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.yb-badges { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.yb-badge { display: inline-flex; align-items: center; gap: 8px; text-transform: uppercase; }
.yb-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; }
.yb-lang { display: flex; gap: 16px; align-items: center; }
.yb-lang a:hover { color: var(--white); }

/* ─── Header / Nav ─── */
.yb-header { background: var(--white); border-bottom: 1px solid var(--slate-200); position: sticky; top: 0; z-index: 100; }
.yb-header-inner { display: flex; align-items: center; justify-content: space-between; height: 76px; max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.yb-brand { display: flex; align-items: center; gap: 12px; }
.yb-brand-logo { width: 44px; height: 44px; background: var(--yb-navy); display: grid; place-items: center; font-family: var(--font-display); font-weight: 700; font-size: 20px; color: var(--white); position: relative; }
.yb-brand-logo::after { content: ''; position: absolute; inset: 4px; border: 1px solid rgba(255,255,255,0.2); }
.yb-brand-text { line-height: 1.1; }
.yb-brand-text .name { font-family: var(--font-display); font-weight: 600; font-size: 17px; color: var(--yb-navy); letter-spacing: -0.01em; }
.yb-brand-text .sub { font-size: 11px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 0.12em; margin-top: 2px; }
.yb-nav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.yb-nav a { padding: 10px 18px; font-size: 14px; font-weight: 500; color: var(--slate-700); position: relative; transition: color 0.15s; }
.yb-nav a:hover { color: var(--yb-navy); }
.yb-nav a.active { color: var(--yb-navy); }
.yb-nav a.active::after { content: ''; position: absolute; left: 18px; right: 18px; bottom: -1px; height: 2px; background: var(--yb-navy); }
.yb-nav-cta { display: inline-flex !important; align-items: center; gap: 8px; padding: 10px 20px !important; background: var(--yb-navy); color: var(--white) !important; font-size: 13px; font-weight: 500; margin-left: 12px; transition: background 0.15s; }
.yb-nav-cta:hover { background: var(--yb-navy-mid); }
.yb-nav-cta::after { content: '→'; font-size: 14px; }

/* ─── Buttons ─── */
.yb-btn { display: inline-flex; align-items: center; gap: 10px; padding: 14px 28px; font-size: 14px; font-weight: 500; letter-spacing: 0.01em; transition: all 0.18s ease; cursor: pointer; border: 1px solid transparent; }
.yb-btn-primary { background: var(--yb-navy); color: var(--white); }
.yb-btn-primary:hover { background: var(--yb-navy-mid); transform: translateY(-1px); }
.yb-btn-outline { background: transparent; color: var(--yb-navy); border-color: var(--slate-300); }
.yb-btn-outline:hover { border-color: var(--yb-navy); }
.yb-btn-light { background: var(--white); color: var(--yb-navy); }
.yb-btn-light:hover { background: var(--slate-100); }
.yb-btn-ghost { background: transparent; color: var(--white); border-color: rgba(255,255,255,0.25); }
.yb-btn-ghost:hover { border-color: var(--white); }
.yb-btn .arrow { font-size: 16px; transition: transform 0.18s; }
.yb-btn:hover .arrow { transform: translateX(3px); }

/* ─── Eyebrows ─── */
.yb-eyebrow { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--yb-blue); display: inline-flex; align-items: center; gap: 10px; font-weight: 500; }
.yb-eyebrow::before { content: ''; width: 24px; height: 1px; background: var(--yb-blue); }
.yb-eyebrow-light { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--yb-accent); display: inline-flex; align-items: center; gap: 10px; font-weight: 500; }
.yb-eyebrow-light::before { content: ''; width: 24px; height: 1px; background: var(--yb-accent); }

/* ─── Headings ─── */
.yb-h-display { font-family: var(--font-display); font-size: clamp(48px, 6vw, 76px); line-height: 1.02; letter-spacing: -0.03em; font-weight: 500; color: var(--ink); }
.yb-h-section { font-family: var(--font-display); font-size: clamp(32px, 4vw, 48px); line-height: 1.1; font-weight: 500; letter-spacing: -0.02em; color: var(--ink); }
.yb-lead { font-size: 18px; line-height: 1.6; color: var(--slate-700); max-width: 60ch; }

/* ─── Page header (sub-pages) ─── */
.yb-page-header { background: var(--yb-navy); color: var(--white); padding: 80px 0 96px; position: relative; overflow: hidden; }
.yb-page-header::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 48px 48px; pointer-events: none; }
.yb-page-header .yb-container { position: relative; z-index: 1; }
.yb-page-header h1 { color: var(--white); font-family: var(--font-display); font-size: clamp(40px, 5vw, 64px); line-height: 1.05; margin: 16px 0 0; max-width: 24ch; font-weight: 500; letter-spacing: -0.02em; }
.yb-crumbs { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yb-accent); margin-bottom: 8px; }
.yb-page-header .desc { margin-top: 24px; color: var(--slate-300); max-width: 56ch; font-size: 17px; }

/* ─── Hero ─── */
.yb-hero { background: var(--yb-navy); color: var(--white); position: relative; overflow: hidden; padding: 120px 0 140px; }
.yb-hero::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 56px 56px; pointer-events: none; -webkit-mask-image: radial-gradient(ellipse 80% 60% at 30% 50%, black 40%, transparent 100%); mask-image: radial-gradient(ellipse 80% 60% at 30% 50%, black 40%, transparent 100%); }
.yb-hero::after { content: ''; position: absolute; right: -200px; top: -200px; width: 800px; height: 800px; background: radial-gradient(circle, rgba(0,180,216,0.15) 0%, transparent 60%); pointer-events: none; }
.yb-hero .yb-container { position: relative; z-index: 1; }
.yb-hero-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 64px; align-items: end; }
.yb-hero h1 { color: var(--white); font-family: var(--font-display); font-size: clamp(48px, 6vw, 76px); line-height: 1.02; letter-spacing: -0.03em; margin: 24px 0 0; font-weight: 500; }
.yb-hero h1 .accent { color: var(--yb-accent); font-style: italic; font-weight: 400; }
.yb-hero p.lead { color: var(--slate-300); font-size: 19px; margin-top: 32px; max-width: 60ch; line-height: 1.6; }
.yb-hero-actions { margin-top: 48px; display: flex; gap: 16px; flex-wrap: wrap; }
.yb-hero-side { display: flex; flex-direction: column; gap: 24px; padding-bottom: 8px; }
.yb-live-feed { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); padding: 24px; }
.yb-live-feed-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: var(--slate-400); text-transform: uppercase; }
.yb-live-feed-head .live { color: #34d399; display: inline-flex; align-items: center; gap: 6px; }
.yb-live-feed-head .live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; animation: yb-pulse 1.6s ease-in-out infinite; }
@keyframes yb-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.yb-live-feed-row { display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.06); font-size: 13px; color: var(--slate-300); gap: 12px; }
.yb-live-feed-row .pn { font-family: var(--font-mono); color: var(--white); }
.yb-live-feed-row .st { font-family: var(--font-mono); font-size: 11px; }
.yb-st-stock { color: #34d399; }
.yb-st-low { color: #fbbf24; }
.yb-hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; }
.yb-hero-stats > div { padding-right: 16px; }
.yb-hero-stats .num { font-family: var(--font-display); font-size: 36px; font-weight: 500; color: var(--white); letter-spacing: -0.02em; line-height: 1; }
.yb-hero-stats .lbl { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-400); margin-top: 10px; }

/* ─── Capabilities ─── */
.yb-capabilities { background: var(--slate-50); }
.yb-cap-head { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: end; }
.yb-cap-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--slate-200); margin-top: 56px; border: 1px solid var(--slate-200); }
.yb-cap-card { background: var(--white); padding: 32px 28px; display: flex; flex-direction: column; min-height: 320px; position: relative; transition: all 0.2s; }
.yb-cap-card:hover { background: var(--yb-navy); color: var(--white); }
.yb-cap-card:hover h3, .yb-cap-card:hover .num, .yb-cap-card:hover .link { color: var(--white); }
.yb-cap-card:hover p { color: var(--slate-300); }
.yb-cap-card:hover .link::after { background: var(--white); right: 0 !important; }
.yb-cap-card .num { font-family: var(--font-mono); font-size: 11px; color: var(--slate-400); letter-spacing: 0.1em; margin-bottom: 24px; transition: color 0.2s; }
.yb-cap-card h3 { font-family: var(--font-display); font-size: 22px; margin: 0 0 12px; transition: color 0.2s; font-weight: 500; letter-spacing: -0.01em; }
.yb-cap-card p { color: var(--slate-600); font-size: 14px; margin: 0 0 20px; transition: color 0.2s; line-height: 1.6; }
.yb-cap-card .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 32px; }
.yb-tag { display: inline-flex; align-items: center; padding: 4px 10px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; background: var(--slate-100); color: var(--slate-700); border-radius: 2px; }
.yb-tag-blue { background: rgba(37,99,235,0.08); color: var(--yb-blue); }
.yb-tag-orange { background: rgba(234,88,12,0.08); color: var(--yb-orange); }
.yb-tag-green { background: rgba(16,185,129,0.08); color: #047857; }
.yb-cap-card .cap-actions { margin-top: auto; display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding-top: 8px; }
.yb-cap-card .link { font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--yb-navy); display: inline-flex; align-items: center; gap: 8px; position: relative; padding-bottom: 6px; transition: color 0.2s; align-self: flex-start; }
.yb-cap-card .link::after { content: ''; position: absolute; left: 0; right: 30%; bottom: 0; height: 1px; background: var(--yb-navy); transition: all 0.2s; }
.yb-cap-card .cap-dl {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--slate-700);
  background: var(--slate-50);
  border: 1px solid var(--slate-200);
  text-decoration: none;
  letter-spacing: 0.04em;
  transition: all 0.18s;
}
.yb-cap-card .cap-dl:hover {
  background: var(--white);
  border-color: var(--yb-navy);
  color: var(--yb-navy);
}
.yb-cap-card .cap-dl .ic {
  display: inline-grid; place-items: center;
  width: 22px; height: 22px;
  background: var(--white);
  border: 1px solid var(--slate-300);
  font-size: 12px; font-weight: 700;
  color: var(--yb-navy);
  flex-shrink: 0;
}
.yb-cap-card:hover .cap-dl .ic { border-color: var(--yb-navy); }
.yb-cap-card .cap-dl .lbl { line-height: 1.2; flex: 1; }
.yb-cap-card .cap-dl em { font-style: normal; opacity: 0.6; margin-left: 4px; text-transform: uppercase; }
/* Hover-invert behavior: when whole card flips dark, recolor download chip */
.yb-cap-card:hover .cap-dl { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.18); color: var(--slate-300); }
.yb-cap-card:hover .cap-dl:hover { background: var(--white); color: var(--yb-navy); border-color: var(--white); }
.yb-cap-card:hover .cap-dl .ic { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); color: var(--white); }
.yb-cap-card:hover .cap-dl:hover .ic { background: var(--yb-navy); border-color: var(--yb-navy); color: var(--white); }

/* ─── Showcase ─── */
.yb-showcase { background: var(--white); }
.yb-showcase-head { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: end; margin-bottom: 56px; }
.yb-showcase-head h2 { max-width: 16ch; }
.yb-showcase-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; }
.yb-eq-card { background: var(--white); border: 1px solid var(--slate-200); overflow: hidden; transition: all 0.2s; cursor: pointer; }
.yb-eq-card:hover { border-color: var(--yb-navy); transform: translateY(-2px); box-shadow: 0 18px 32px -16px rgba(10,37,64,0.18); }
.yb-eq-card .eq-img { aspect-ratio: 16/9; position: relative; background-color: #1e293b; background-size: cover; background-position: center; overflow: hidden; }
.yb-eq-card .eq-img::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(10,37,64,0.55) 0%, rgba(10,37,64,0.20) 50%, rgba(0,180,216,0.18) 100%); }
.yb-eq-card .eq-img::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 32px 32px; pointer-events: none; }
.yb-eq-card .tag-row { position: absolute; top: 16px; left: 16px; display: flex; gap: 8px; z-index: 2; }
.yb-eq-card .eq-tag { background: rgba(0,0,0,0.5); backdrop-filter: blur(8px); padding: 4px 10px; font-family: var(--font-mono); font-size: 10px; color: var(--white); letter-spacing: 0.1em; text-transform: uppercase; }
.yb-eq-card .eq-meta { position: absolute; bottom: 16px; right: 16px; font-family: var(--font-mono); font-size: 10px; color: rgba(255,255,255,0.6); letter-spacing: 0.1em; z-index: 2; }
.yb-eq-card .eq-body { padding: 24px; }
.yb-eq-card .eq-cat { font-family: var(--font-mono); font-size: 11px; color: var(--yb-blue); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
.yb-eq-card h3 { font-family: var(--font-display); font-size: 22px; margin: 0 0 8px; font-weight: 500; }
.yb-eq-card p { color: var(--slate-600); font-size: 14px; margin: 0 0 16px; line-height: 1.6; }
.yb-eq-card .models { display: flex; flex-wrap: wrap; gap: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--slate-500); border-top: 1px solid var(--slate-100); padding-top: 16px; }
.yb-eq-card .models span { padding: 2px 8px; background: var(--slate-100); }

/* ─── Featured equipment & parts (real product photos) ─── */
.yb-featured { background: var(--white); padding-bottom: 120px; }
.yb-featured-head { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: end; margin-bottom: 48px; }
.yb-featured-head h2 { max-width: 18ch; }
.yb-featured-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.yb-feat-card { background: var(--white); border: 1px solid var(--slate-200); overflow: hidden; transition: all 0.18s; display: flex; flex-direction: column; text-decoration: none; color: inherit; }
.yb-feat-card:hover { border-color: var(--yb-navy); transform: translateY(-2px); box-shadow: 0 12px 24px -8px rgba(10,37,64,0.15); }
.yb-feat-img { aspect-ratio: 4/3; position: relative; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); overflow: hidden; }
.yb-feat-img::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px); background-size: 16px 16px; }
.yb-feat-img img { width: 100%; height: 100%; object-fit: contain; padding: 16px; position: relative; z-index: 1; }
.yb-feat-img .badge { position: absolute; top: 12px; left: 12px; z-index: 2; padding: 4px 10px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; background: rgba(10,37,64,0.85); color: var(--white); backdrop-filter: blur(4px); }
.yb-feat-body { padding: 16px 18px 18px; flex: 1; display: flex; flex-direction: column; gap: 6px; }
.yb-feat-cat { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yb-blue); }
.yb-feat-name { font-family: var(--font-mono); font-size: 12px; line-height: 1.5; color: var(--ink); font-weight: 500; min-height: 3.6em; }
.yb-feat-cta-row { margin-top: 56px; display: flex; justify-content: center; }

/* ─── Process ─── */
.yb-process { background: var(--ink); color: var(--white); padding: 120px 0; }
.yb-process h2 { color: var(--white); }
.yb-process p.lead { color: var(--slate-400); }
.yb-process-head { max-width: 720px; margin-bottom: 80px; }
.yb-process-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
.yb-process-step { border-left: 1px solid rgba(255,255,255,0.08); padding: 0 32px 0 24px; position: relative; }
.yb-process-step:first-child { border-left-color: rgba(255,255,255,0.16); }
.yb-process-step .no { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: var(--yb-accent); text-transform: uppercase; }
.yb-process-step h3 { color: var(--white); font-family: var(--font-display); font-size: 22px; margin: 16px 0 12px; font-weight: 500; }
.yb-process-step p { color: var(--slate-400); font-size: 14px; margin: 0; line-height: 1.6; }

/* ─── Inventory ─── */
.yb-inventory { background: var(--slate-50); padding: 96px 0; }
.yb-inv-head { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: end; margin-bottom: 48px; }
.yb-inv-table { background: var(--white); border: 1px solid var(--slate-200); }
.yb-inv-row { display: grid; grid-template-columns: 160px 1.2fr 1.4fr 80px 100px; gap: 24px; padding: 18px 28px; border-bottom: 1px solid var(--slate-100); font-size: 14px; align-items: center; transition: background 0.15s; }
.yb-inv-row:hover { background: var(--slate-50); }
.yb-inv-row:last-child { border-bottom: none; }
.yb-inv-row.head { background: var(--slate-50); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-500); }
.yb-inv-row.head:hover { background: var(--slate-50); }
.yb-inv-row .pn { font-family: var(--font-mono); color: var(--ink); font-weight: 500; }
.yb-inv-row .cat { color: var(--slate-700); }
.yb-inv-row .desc { color: var(--slate-600); }
.yb-inv-row .qty { font-family: var(--font-mono); color: var(--slate-700); }
.yb-inv-row .stat { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; }
.yb-stat-stock { color: #047857; }
.yb-stat-low { color: #b45309; }
.yb-stat-1 { color: #b91c1c; }

/* ─── Partners CTA ─── */
.yb-partners-cta { background: var(--yb-navy); color: var(--white); padding: 120px 0; position: relative; overflow: hidden; }
.yb-partners-cta::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: 64px 64px; -webkit-mask-image: radial-gradient(ellipse 70% 80% at 70% 50%, black 30%, transparent 100%); mask-image: radial-gradient(ellipse 70% 80% at 70% 50%, black 30%, transparent 100%); }
.yb-partners-cta .yb-container { position: relative; }
.yb-partners-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 80px; align-items: center; }
.yb-partners-cta h2 { color: var(--white); max-width: 16ch; }
.yb-partners-cta p { color: var(--slate-300); margin-top: 24px; max-width: 50ch; font-size: 17px; line-height: 1.6; }
.yb-partners-actions { margin-top: 40px; display: flex; gap: 16px; flex-wrap: wrap; }
.yb-partners-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08); }
.yb-partners-list .partner { background: var(--yb-navy); padding: 28px 24px; display: flex; flex-direction: column; gap: 6px; }
.yb-partners-list .partner .nm { font-family: var(--font-display); font-size: 18px; color: var(--white); font-weight: 500; }
.yb-partners-list .partner .role { font-family: var(--font-mono); font-size: 11px; color: var(--yb-accent); letter-spacing: 0.1em; text-transform: uppercase; }

/* ─── Spec strip ─── */
.yb-spec-strip { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid var(--slate-200); border-bottom: 1px solid var(--slate-200); }
.yb-spec-strip > div { padding: 28px 32px; border-right: 1px solid var(--slate-200); }
.yb-spec-strip > div:last-child { border-right: none; }
.yb-spec-strip .num { font-family: var(--font-display); font-size: 40px; font-weight: 500; color: var(--yb-navy); letter-spacing: -0.02em; line-height: 1; }
.yb-spec-strip .label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--slate-500); margin-top: 12px; }

/* ─── Welcome (Company) ─── */
.yb-welcome { display: grid; grid-template-columns: 1fr 1.1fr; gap: 80px; align-items: start; }
.yb-welcome-img {
  aspect-ratio: 4/5;
  background-color: #1e293b;
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
}
.yb-welcome-img::before {
  content: ''; position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(10,37,64,0.10) 0%, rgba(10,37,64,0.55) 60%, rgba(10,37,64,0.85) 100%),
    linear-gradient(135deg, rgba(0,180,216,0.08) 0%, transparent 60%);
}
.yb-welcome-img::after {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
}
.yb-welcome-img .label {
  position: absolute; bottom: 24px; left: 24px; z-index: 2;
  font-family: var(--font-mono); font-size: 11px;
  color: rgba(255,255,255,0.85);
  letter-spacing: 0.12em; text-transform: uppercase;
  background: rgba(10,37,64,0.5);
  padding: 6px 12px;
  backdrop-filter: blur(4px);
}
.yb-welcome-img .corner {
  position: absolute; top: 24px; right: 24px; z-index: 2;
  width: 80px; height: 80px;
  border-top: 2px solid var(--yb-accent);
  border-right: 2px solid var(--yb-accent);
}
.yb-welcome-text h2 { font-family: var(--font-display); font-size: clamp(28px, 3.4vw, 42px); line-height: 1.15; margin: 24px 0 32px; font-weight: 500; letter-spacing: -0.02em; }
.yb-welcome-text p { font-size: 17px; line-height: 1.7; color: var(--slate-700); margin: 0 0 20px; }
.yb-signature { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--slate-200); font-style: italic; color: var(--slate-700); }
.yb-signature .nm { font-style: normal; font-family: var(--font-display); font-weight: 500; color: var(--ink); display: block; margin-top: 4px; }

/* ─── Timeline ─── */
.yb-timeline-section { background: var(--slate-50); }
.yb-timeline { position: relative; }
.yb-timeline::before { content: ''; position: absolute; left: 200px; top: 0; bottom: 0; width: 1px; background: var(--slate-300); }
.yb-tl-row { display: grid; grid-template-columns: 200px 60px 1fr; gap: 0; padding: 32px 0; border-bottom: 1px solid var(--slate-200); align-items: center; }
.yb-tl-row:last-child { border-bottom: none; }
.yb-tl-date { font-family: var(--font-mono); font-size: 13px; color: var(--yb-blue); letter-spacing: 0.06em; font-weight: 500; }
.yb-tl-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--yb-navy); border: 3px solid var(--white); box-shadow: 0 0 0 1px var(--slate-300); position: relative; z-index: 1; }
.yb-tl-content h3 { font-family: var(--font-display); font-size: 22px; margin: 0 0 6px; font-weight: 500; }
.yb-tl-content p { color: var(--slate-600); font-size: 15px; margin: 0; line-height: 1.6; }

/* ─── Org chart ─── */
.yb-org-chart { display: flex; flex-direction: column; gap: 0; align-items: center; }
.yb-org-node { background: var(--white); border: 1px solid var(--slate-300); padding: 20px 32px; min-width: 200px; text-align: center; position: relative; }
.yb-org-node.root { background: var(--yb-navy); color: var(--white); border-color: var(--yb-navy); }
.yb-org-node.root .role { color: var(--yb-accent); }
.yb-org-node .role { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yb-blue); margin-bottom: 6px; }
.yb-org-node .nm { font-family: var(--font-display); font-size: 18px; font-weight: 500; }
.yb-org-tier-2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; width: 100%; max-width: 1100px; margin-top: 60px; position: relative; }
.yb-org-tier-2::before { content: ''; position: absolute; top: -30px; left: 12.5%; right: 12.5%; height: 1px; background: var(--slate-300); }
.yb-org-tier-2 .yb-org-node::before { content: ''; position: absolute; top: -30px; left: 50%; width: 1px; height: 30px; background: var(--slate-300); }
.yb-org-tier-3 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; width: 100%; max-width: 1100px; margin-top: 40px; position: relative; }
.yb-org-tier-3 .yb-org-node { background: var(--slate-50); position: relative; }
.yb-org-tier-3 .yb-org-node::before { content: ''; position: absolute; top: -40px; left: 50%; width: 1px; height: 40px; background: var(--slate-300); }

/* ─── Values (dark) ─── */
.yb-values { background: var(--ink); color: var(--white); padding: 120px 0; }
.yb-values h2 { color: var(--white); }
.yb-val-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: rgba(255,255,255,0.08); margin-top: 64px; border: 1px solid rgba(255,255,255,0.08); }
.yb-val-card { background: var(--ink); padding: 40px 36px; }
.yb-val-card .vno { font-family: var(--font-mono); font-size: 12px; color: var(--yb-accent); letter-spacing: 0.12em; margin-bottom: 32px; }
.yb-val-card h3 { color: var(--white); font-family: var(--font-display); font-size: 24px; margin: 0 0 12px; font-weight: 500; }
.yb-val-card p { color: var(--slate-400); font-size: 15px; line-height: 1.7; margin: 0; }

/* ─── Business: services ─── */
.yb-biz-intro { display: grid; grid-template-columns: 1fr 1.4fr; gap: 80px; align-items: start; margin-bottom: 72px; }
.yb-svc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: var(--slate-200); border: 1px solid var(--slate-200); }
.yb-svc-card { background: var(--white); padding: 40px 36px; }
.yb-svc-card .num { font-family: var(--font-mono); font-size: 12px; color: var(--yb-blue); letter-spacing: 0.12em; margin-bottom: 24px; }
.yb-svc-card h3 { font-family: var(--font-display); font-size: 26px; margin: 0 0 12px; font-weight: 500; }
.yb-svc-card p { color: var(--slate-600); font-size: 15px; line-height: 1.7; margin: 0; }

/* ─── Models grid ─── */
.yb-models-section { background: var(--slate-50); }
.yb-models-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 56px; }
.yb-model-card { background: var(--white); border: 1px solid var(--slate-200); padding: 32px; }
.yb-model-card .vendor { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yb-blue); margin-bottom: 8px; }
.yb-model-card.tel .vendor { color: var(--yb-orange); }
.yb-model-card.amat .vendor { color: #047857; }
.yb-model-card h3 { font-family: var(--font-display); font-size: 22px; margin: 0 0 20px; font-weight: 500; }
.yb-model-card ul { list-style: none; display: flex; flex-direction: column; gap: 6px; font-family: var(--font-mono); font-size: 13px; color: var(--slate-700); padding: 0; margin: 0; }
.yb-model-card ul li { padding: 6px 0; border-bottom: 1px dashed var(--slate-200); }
.yb-model-card ul li:last-child { border-bottom: none; }

/* ─── Contact form ─── */
.yb-contact-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 80px; align-items: start; }
.yb-contact-form { background: var(--white); border: 1px solid var(--slate-200); padding: 48px; }
.yb-contact-form h2 { font-family: var(--font-display); font-size: 32px; margin: 0 0 8px; font-weight: 500; }
.yb-contact-form p.sub { color: var(--slate-600); margin-bottom: 32px; font-size: 15px; }
.yb-field { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
.yb-field label { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--slate-700); font-weight: 500; }
.yb-field input, .yb-field select, .yb-field textarea { border: 1px solid var(--slate-300); padding: 12px 14px; font-family: var(--font-sans); font-size: 14px; background: var(--white); outline: none; transition: border 0.15s; }
.yb-field input:focus, .yb-field select:focus, .yb-field textarea:focus { border-color: var(--yb-navy); }
.yb-field textarea { resize: vertical; min-height: 120px; }
.yb-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.yb-contact-info > div { padding: 32px 0; border-top: 1px solid var(--slate-200); }
.yb-contact-info > div:first-child { border-top: none; padding-top: 0; }
.yb-ic-h { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--yb-blue); margin-bottom: 16px; }
.yb-contact-info h3 { font-family: var(--font-display); font-size: 22px; margin: 0 0 8px; font-weight: 500; }
.yb-contact-info p, .yb-contact-info a { color: var(--slate-700); font-size: 15px; line-height: 1.7; }
.yb-contact-info a:hover { color: var(--yb-blue); }

/* ─── Map band ─── */
.yb-map-band { background: var(--ink); }
.yb-map-fake { height: 360px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%); position: relative; overflow: hidden; }
.yb-map-fake::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(0,180,216,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,180,216,0.06) 1px, transparent 1px); background-size: 40px 40px; }
.yb-map-pin { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 16px; height: 16px; border-radius: 50%; background: var(--yb-accent); box-shadow: 0 0 0 8px rgba(0,180,216,0.2), 0 0 24px rgba(0,180,216,0.5); }
.yb-map-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -120%); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--white); background: var(--yb-navy); padding: 8px 14px; white-space: nowrap; }

/* ─── FAQ ─── */
.yb-faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 56px; }
.yb-faq-item { padding: 32px; border: 1px solid var(--slate-200); background: var(--white); }
.yb-faq-item .q { font-family: var(--font-display); font-size: 18px; font-weight: 500; color: var(--ink); margin-bottom: 12px; }
.yb-faq-item .a { color: var(--slate-600); font-size: 14px; line-height: 1.7; }

/* ─── Auto-rendered Product list (renderProductList) — industrial parts catalog ─── */
/* Override the renderer's inline grey/Tahoma look with !important so the
   YoungBin design lands without changing the global renderer. */
.product-content {
  max-width: 1320px !important;
  margin: 0 auto !important;
  padding: 48px 32px 96px !important;
  font-family: var(--font-sans) !important;
  color: var(--ink) !important;
  background: var(--slate-50);
}
.product-tabs {
  display: flex !important;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 32px !important;
  padding: 12px;
  background: var(--white);
  border: 1px solid var(--slate-200);
  text-align: left !important;
}
.product-tabs .product-tab {
  display: inline-block !important;
  padding: 10px 18px !important;
  margin: 0 !important;
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--slate-700) !important;
  background: transparent !important;
  border: none !important;
  border-radius: 0;
  text-decoration: none !important;
  transition: all 0.15s;
}
.product-tabs .product-tab:hover {
  background: var(--slate-100) !important;
  color: var(--ink) !important;
}
.product-tabs .product-tab.product-tab-active {
  background: var(--yb-navy) !important;
  color: var(--white) !important;
}

.product-grid {
  display: grid !important;
  grid-template-columns: repeat(4, 1fr) !important;
  gap: 16px !important;
}
.product-item {
  background: var(--white);
  border: 1px solid var(--slate-200);
  padding: 0 !important;
  text-align: left !important;
  transition: all 0.18s;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.product-item:hover {
  border-color: var(--yb-navy);
  transform: translateY(-2px);
  box-shadow: 0 12px 24px -8px rgba(10,37,64,0.15);
}
.product-item .product-item-imglink {
  display: block;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  position: relative;
  aspect-ratio: 4/3;
  overflow: hidden;
}
.product-item .product-item-imglink::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px);
  background-size: 16px 16px;
  pointer-events: none;
}
.product-item .product-item-img,
.product-item .product-item-imgph {
  width: 100% !important;
  height: 100% !important;
  max-width: none !important;
  object-fit: contain !important;
  background: transparent !important;
  border: none !important;
  position: relative;
  z-index: 1;
  padding: 16px;
}
.product-item .product-item-name {
  padding: 16px 18px 0 !important;
  margin-top: 0 !important;
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  color: var(--ink) !important;
  letter-spacing: -0.01em;
  -webkit-line-clamp: 3 !important;
  max-height: none !important;
  min-height: 4.5em;
}
.product-item .product-item-name a {
  color: var(--ink) !important;
  font-weight: 500;
}
.product-item .product-item-name a:hover { color: var(--yb-blue) !important; }
.product-item .product-item-price {
  padding: 8px 18px 16px !important;
  margin-top: 0 !important;
  font-family: var(--font-mono) !important;
  font-size: 13px !important;
  font-weight: 600;
  color: var(--yb-orange) !important;
}

/* Mobile compaction: header chrome eats most of the viewport on small
   phones, so drop or shrink everything that's not load-bearing for
   navigation. */
@media (max-width: 640px) {
  /* Utility bar — hide entirely. Phone/email/badges live in the footer
     and contact page, no need to spend 120px of viewport on them. */
  .yb-utility { display: none !important; }

  /* Header — single row, no wrap. Logo shrinks; brand text drops the
     "Semiconductor · Est. 2012" sub. Nav becomes a horizontal scroller. */
  .yb-header { position: sticky; top: 0; }
  .yb-header-inner {
    flex-direction: row !important;
    height: 56px !important;
    padding: 0 12px !important;
    gap: 8px !important;
    align-items: center;
    flex-wrap: nowrap;
  }
  .yb-brand { gap: 8px; flex-shrink: 0; }
  .yb-brand-logo { width: 32px !important; height: 32px !important; font-size: 14px !important; }
  .yb-brand-text .name { font-size: 14px !important; }
  .yb-brand-text .sub { display: none !important; }
  .yb-nav {
    flex-wrap: nowrap !important;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    flex: 1;
    margin: 0;
    gap: 0;
    justify-content: flex-end !important;
  }
  .yb-nav::-webkit-scrollbar { display: none; }
  .yb-nav a { padding: 6px 10px !important; font-size: 12px !important; white-space: nowrap; }
  .yb-nav a.active::after { display: none; }
  .yb-nav .yb-nav-cta {
    padding: 6px 12px !important;
    font-size: 11px !important;
    margin-left: 6px !important;
    flex-shrink: 0;
  }

  /* Slim page-header — even tighter on mobile. */
  .yb-page-header.yb-page-header-slim { padding: 12px 0 !important; }
  .yb-page-header.yb-page-header-slim .yb-container { padding: 0 16px !important; }
  .yb-page-header.yb-page-header-slim h1 { font-size: 16px !important; }
  .yb-page-header.yb-page-header-slim .yb-crumbs { font-size: 9px !important; }

  /* Container side padding tightens too. */
  .yb-container { padding: 0 16px !important; }

  .product-content {
    padding: 16px 12px 48px !important;
  }
  /* Tabs — wrap to multiple rows on mobile (horizontal scroll was a
     hidden-affordance trap; wrapping makes every tab visible at once). */
  .yb-cap-grid { grid-template-columns: 1fr !important; }
  .product-tabs {
    margin: 0 0 16px !important;
    padding: 6px;
    gap: 4px;
    flex-wrap: wrap !important;
  }
  .product-tabs .product-tab {
    padding: 7px 10px !important;
    font-size: 10.5px !important;
    letter-spacing: 0.04em !important;
    line-height: 1.2;
    flex: 0 0 auto;
  }
  .product-grid {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 10px !important;
  }
  .product-item .product-item-imglink {
    aspect-ratio: 1 / 1;
  }
  .product-item .product-item-img,
  .product-item .product-item-imgph {
    padding: 6px !important;
  }
  .product-item .product-item-name {
    padding: 10px 12px 0 !important;
    font-size: 11px !important;
    -webkit-line-clamp: 2 !important;
    min-height: 3em !important;
    line-height: 1.4 !important;
  }
  .product-item .product-item-price {
    padding: 4px 12px 12px !important;
    font-size: 12px !important;
  }
  .product-pagination { margin-top: 24px !important; }
  .product-pagination .product-page,
  .product-pagination .product-page-active {
    padding: 8px 10px !important;
    font-size: 12px !important;
  }
  .yb-list-intro { padding: 24px 0 0 !important; }
  .yb-list-intro h2 { font-size: 22px !important; }
  .yb-list-intro p { font-size: 13px !important; }
}

.product-pagination {
  margin-top: 48px !important;
  text-align: center;
}
.product-pagination .product-page,
.product-pagination .product-page-active {
  display: inline-block !important;
  padding: 10px 14px !important;
  margin: 0 2px !important;
  font-family: var(--font-mono) !important;
  font-size: 13px !important;
  color: var(--slate-700) !important;
  background: var(--white) !important;
  border: 1px solid var(--slate-200) !important;
  text-decoration: none !important;
  font-weight: 400 !important;
}
.product-pagination .product-page:hover { background: var(--slate-50) !important; }
.product-pagination .product-page-active {
  background: var(--yb-navy) !important;
  color: var(--white) !important;
  border-color: var(--yb-navy) !important;
}

/* ─── Auto-rendered Board list (renderBoardList) — technical bulletin board ─── */
.board-content {
  max-width: 1320px !important;
  margin: 0 auto !important;
  padding: 48px 32px 96px !important;
  font-family: var(--font-sans) !important;
  color: var(--ink) !important;
  background: var(--slate-50);
  width: 100% !important;
}
.board-content table {
  width: 100% !important;
  border-collapse: collapse;
  background: var(--white);
  border: 1px solid var(--slate-200);
}
.board-content th {
  background: var(--slate-50) !important;
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--slate-500) !important;
  padding: 16px !important;
  border-bottom: 1px solid var(--slate-200) !important;
  text-align: left !important;
  font-weight: 500;
}
.board-content td {
  padding: 18px 16px !important;
  border-bottom: 1px solid var(--slate-100) !important;
  font-size: 14px !important;
  color: var(--ink) !important;
}
.board-content tr:hover td { background: var(--slate-50); }
.board-content a { color: var(--ink) !important; font-weight: 500; }
.board-content a:hover { color: var(--yb-blue) !important; }
.board-content img { border-radius: 0; max-width: 100%; height: auto; }

/* Slim page-header variant — used on product/board list pages (and
   anywhere the page-header is just a thin orientation strip rather than a
   full hero). Authored as an explicit modifier so the editor preview
   shows the slim look immediately, without depending on a sibling element
   the dynamic plugin renderer adds at runtime. */
.yb-page-header.yb-page-header-slim {
  padding: 20px 0 !important;
}
.yb-page-header.yb-page-header-slim h1 {
  font-size: clamp(18px, 1.9vw, 24px) !important;
  line-height: 1.2 !important;
  margin: 6px 0 0 !important;
  max-width: none !important;
  font-weight: 500 !important;
}
.yb-page-header.yb-page-header-slim .desc { display: none !important; }
.yb-page-header.yb-page-header-slim .yb-crumbs {
  font-size: 10px !important;
  margin-bottom: 0;
}

/* Platform deep-dive sections on product page — static editorial content
   that gives both the editor and the live page real substance above the
   auto-rendered parts catalog. */
.yb-platform { padding: 96px 0; border-bottom: 1px solid var(--slate-200); }
.yb-platform.dark { background: var(--ink); color: var(--white); }
.yb-platform.dark h2, .yb-platform.dark h3 { color: var(--white); }
.yb-platform.dark p { color: var(--slate-400); }
.yb-platform.dark .yb-spec-list li { border-color: rgba(255,255,255,0.08); color: var(--slate-300); }
.yb-platform.dark .yb-spec-list li strong { color: var(--white); }
.yb-platform-grid { display: grid; grid-template-columns: 1fr 1.2fr; gap: 64px; align-items: start; }
.yb-platform-grid.flip { grid-template-columns: 1.2fr 1fr; }
.yb-platform-grid.flip .yb-platform-text { order: 2; }
.yb-platform-grid.flip .yb-platform-img { order: 1; }
.yb-platform-text h2 {
  font-family: var(--font-display);
  font-size: clamp(32px, 4vw, 48px); line-height: 1.05;
  margin: 0 0 24px; font-weight: 500; letter-spacing: -0.02em;
}
.yb-platform-text .lead { font-size: 17px; color: var(--slate-700); margin-bottom: 32px; line-height: 1.6; }
.yb-spec-list { list-style: none; margin: 32px 0 0; padding: 0; }
.yb-spec-list li {
  display: grid; grid-template-columns: 180px 1fr; gap: 24px;
  padding: 16px 0; border-bottom: 1px solid var(--slate-200);
  font-size: 14px; color: var(--slate-700);
}
.yb-spec-list li strong {
  font-family: var(--font-mono); font-size: 12px;
  color: var(--slate-900); letter-spacing: 0.06em;
  text-transform: uppercase; font-weight: 500;
}
.yb-platform-img {
  position: relative; aspect-ratio: 4/3;
  background-color: #1e293b;
  background-size: cover; background-position: center;
  overflow: hidden;
}
.yb-platform-img::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(10,37,64,0.55) 0%, rgba(10,37,64,0.20) 50%, rgba(0,180,216,0.18) 100%);
}
.yb-platform-img::after {
  content: ''; position: absolute; inset: 0;
  background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 24px 24px;
}
.yb-platform-img .lbl {
  position: absolute; bottom: 16px; left: 16px; z-index: 2;
  font-family: var(--font-mono); font-size: 10px;
  color: rgba(255,255,255,0.85); letter-spacing: 0.12em; text-transform: uppercase;
  background: rgba(10,37,64,0.6); padding: 4px 10px;
}

/* Auto-rendered list section title (above .product-content) */
.yb-list-intro { background: var(--white); padding: 48px 0 0; }
.yb-list-intro h2 {
  font-family: var(--font-display);
  font-size: clamp(24px, 3vw, 36px); line-height: 1.1;
  margin: 16px 0 0; font-weight: 500; letter-spacing: -0.02em;
}
.yb-list-intro p { color: var(--slate-600); font-size: 15px; margin: 12px 0 0; max-width: 60ch; }

/* Product detail (renderProductRead) — industrial theming */
.product-content.product-detail {
  max-width: 1200px !important;
  padding: 48px 32px 96px !important;
}
.product-detail-back a {
  font-family: var(--font-mono) !important;
  font-size: 12px !important;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--slate-500) !important;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--slate-200);
  background: var(--white);
  transition: all 0.15s;
}
.product-detail-back a:hover {
  border-color: var(--yb-navy);
  color: var(--yb-navy) !important;
}
.product-detail-grid {
  gap: 48px !important;
  margin-top: 24px;
  background: var(--white);
  border: 1px solid var(--slate-200);
  padding: 32px !important;
  align-items: start;
}
.product-detail-photos {
  flex: 0 0 420px !important;
  background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
  position: relative;
  padding: 16px;
}
.product-detail-photos::before {
  content: '';
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px);
  background-size: 16px 16px;
  pointer-events: none;
}
.product-detail-mainimg,
.product-detail-photos img {
  border: none !important;
  background: transparent !important;
  position: relative;
  z-index: 1;
  max-width: 100% !important;
}
.product-detail-thumbs {
  position: relative;
  z-index: 1;
  display: flex !important;
  flex-wrap: wrap;
  gap: 6px !important;
}
.product-detail-thumbs img {
  width: 56px !important;
  height: 56px !important;
  border: 1px solid var(--slate-200) !important;
  background: var(--white) !important;
  margin: 0 !important;
}
.product-detail-info {
  padding: 8px 0;
}
.product-detail-name {
  font-family: var(--font-display) !important;
  font-size: 28px !important;
  font-weight: 500 !important;
  color: var(--ink) !important;
  letter-spacing: -0.01em;
  line-height: 1.2 !important;
  margin: 0 0 16px !important;
}
.product-detail-price {
  font-family: var(--font-mono) !important;
  font-size: 18px !important;
  color: var(--yb-orange) !important;
  font-weight: 600 !important;
  margin-bottom: 24px !important;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--slate-200);
}
.product-detail-spec {
  font-size: 14px !important;
  color: var(--slate-700) !important;
  line-height: 1.7 !important;
}
.product-detail-desc {
  margin-top: 32px !important;
  padding-top: 32px !important;
  border-top: 1px solid var(--slate-200) !important;
  font-size: 14px !important;
  color: var(--slate-700) !important;
  line-height: 1.8 !important;
}
.product-detail-desc img { max-width: 100%; height: auto; }

/* ─── Product detail CTAs (sales / inquiry buttons + inline form) ─── */
.product-detail-cta {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--slate-200);
}
.product-detail-cta-sales {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.product-detail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 14px 24px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.01em;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s ease;
}
.product-detail-btn-cart {
  background: var(--white);
  color: var(--yb-navy);
  border-color: var(--yb-navy);
  flex: 1;
  min-width: 140px;
}
.product-detail-btn-cart:hover {
  background: var(--slate-100);
  transform: translateY(-1px);
}
.product-detail-btn-buy {
  background: var(--yb-navy);
  color: var(--white);
  flex: 1;
  min-width: 140px;
}
.product-detail-btn-buy:hover {
  background: var(--yb-navy-mid);
  transform: translateY(-1px);
}
.product-detail-btn-inquiry {
  background: var(--yb-navy);
  color: var(--white);
  width: 100%;
  font-family: var(--font-sans);
  font-size: 15px;
  padding: 16px 28px;
}
.product-detail-btn-inquiry:hover {
  background: var(--yb-navy-mid);
  transform: translateY(-1px);
}

/* Inquiry form — collapsed by default; reveals on button click via .open class */
.product-detail-inquiry-form {
  position: relative;
  display: none;
  margin-top: 16px;
  padding: 24px;
  background: var(--slate-50);
  border: 1px solid var(--slate-200);
}
.product-detail-inquiry-form.open { display: block; }
.product-detail-inquiry-form .row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.product-detail-inquiry-form input,
.product-detail-inquiry-form textarea {
  width: 100%;
  padding: 12px 14px;
  font-family: var(--font-sans);
  font-size: 14px;
  border: 1px solid var(--slate-300);
  background: var(--white);
  outline: none;
  transition: border 0.15s;
  box-sizing: border-box;
}
.product-detail-inquiry-form input:focus,
.product-detail-inquiry-form textarea:focus { border-color: var(--yb-navy); }
.product-detail-inquiry-form textarea {
  min-height: 110px;
  resize: vertical;
  margin-bottom: 12px;
  line-height: 1.5;
}
.product-detail-inquiry-form .actions {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.product-detail-inquiry-form button[type="submit"] {
  background: var(--yb-navy);
  color: var(--white);
  padding: 12px 28px;
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
}
.product-detail-inquiry-form button[type="submit"]:hover { background: var(--yb-navy-mid); }
.product-detail-inquiry-form button[type="submit"]:disabled { opacity: 0.6; cursor: default; }
.product-detail-inquiry-form .product-inquiry-msg {
  font-size: 13px;
  line-height: 1.5;
  flex: 1;
  min-width: 200px;
}
@media (max-width: 640px) {
  .product-detail-inquiry-form { padding: 16px; }
  .product-detail-inquiry-form .row { grid-template-columns: 1fr; gap: 10px; }
}
@media (max-width: 768px) {
  .product-detail-grid { flex-direction: column; padding: 20px !important; }
  .product-detail-photos { flex: 1 1 auto !important; }
}
#hns_body .yb-page-header + .product-content,
#hns_body .yb-page-header + .board-content {
  margin-top: 0 !important;
}

/* ─── Footer ─── */
.yb-footer { background: var(--yb-navy-deep); color: var(--slate-300); padding: 80px 0 32px; }
.yb-footer-inner { max-width: 1320px; margin: 0 auto; padding: 0 32px; }
.yb-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 64px; margin-bottom: 64px; }
.yb-footer h4 { color: var(--white); font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-family: var(--font-mono); font-weight: 500; margin: 0 0 20px; }
.yb-footer ul { list-style: none; display: flex; flex-direction: column; gap: 10px; padding: 0; margin: 0; }
.yb-footer ul a { color: var(--slate-400); font-size: 14px; transition: color 0.15s; }
.yb-footer ul a:hover { color: var(--white); }
.yb-footer-brand .nm { font-family: var(--font-display); color: var(--white); font-size: 20px; font-weight: 600; margin-bottom: 16px; }
.yb-footer-brand p { font-size: 14px; color: var(--slate-400); max-width: 32ch; line-height: 1.6; margin: 0; }
.yb-footer-bottom { border-top: 1px solid rgba(255,255,255,0.08); padding-top: 28px; display: flex; justify-content: space-between; font-size: 12px; color: var(--slate-500); font-family: var(--font-mono); letter-spacing: 0.04em; }

/* ─── Responsive ─── */
@media (max-width: 900px) {
  .yb-utility-inner { flex-direction: column; gap: 8px; padding: 8px 16px; }
  .yb-header-inner { flex-direction: column; height: auto; padding: 16px; gap: 12px; }
  .yb-nav { justify-content: center; }
  .yb-nav-cta { margin-left: 0 !important; }
  .yb-hero { padding: 80px 0; }
  .yb-hero-grid { grid-template-columns: 1fr; gap: 48px; }
  .yb-cap-head, .yb-showcase-head, .yb-partners-grid, .yb-inv-head, .yb-biz-intro, .yb-welcome, .yb-contact-grid { grid-template-columns: 1fr; gap: 40px; }
  .yb-cap-grid { grid-template-columns: 1fr 1fr; }
  .yb-cap-card { min-height: auto; padding: 28px 24px; }
  .yb-showcase-grid { grid-template-columns: 1fr; }
  .yb-featured-head { grid-template-columns: 1fr; gap: 32px; }
  .yb-featured-grid { grid-template-columns: repeat(2, 1fr); }
  .yb-platform-grid, .yb-platform-grid.flip { grid-template-columns: 1fr; gap: 40px; }
  .yb-platform-grid.flip .yb-platform-text { order: 0; }
  .yb-platform-grid.flip .yb-platform-img { order: 1; }
  .yb-platform { padding: 64px 0; }
  .yb-spec-list li { grid-template-columns: 1fr; gap: 6px; }
  .yb-process-steps { grid-template-columns: 1fr 1fr; gap: 32px; }
  .yb-process-step { border-left: none; padding-left: 0; }
  .yb-inv-row { grid-template-columns: 1fr; gap: 4px; padding: 14px 16px; }
  .yb-inv-row > *:nth-child(n+3) { display: none; }
  .yb-tl-row { grid-template-columns: 100px 30px 1fr; }
  .yb-timeline::before { left: 115px; }
  .yb-org-tier-2, .yb-org-tier-3 { grid-template-columns: 1fr 1fr; }
  .yb-val-grid, .yb-svc-grid, .yb-models-grid, .yb-faq-grid { grid-template-columns: 1fr; }
  .yb-spec-strip { grid-template-columns: repeat(2, 1fr); }
  .yb-spec-strip > div:nth-child(2) { border-right: none; }
  .yb-footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  .yb-footer-bottom { flex-direction: column; gap: 8px; }
  .yb-page-header { padding: 60px 0; }
  .yb-section { padding: 64px 0; }
  .yb-process { padding: 80px 0; }
  .yb-partners-cta { padding: 80px 0; }
}
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  Header / Menu / Footer (shared chrome)
 * ═══════════════════════════════════════════════════════════════════ */

const headerHtml = `
<div id="hns_header" class="dragable" data-preserve>
  <div class="yb-utility">
    <div class="yb-utility-inner">
      <div class="yb-badges">
        <span class="yb-badge">Inventory live · 1,200+ parts in stock</span>
        <span class="yb-badge" style="opacity:0.7;">Cheongju, Korea · ISO-aligned process</span>
      </div>
      <div class="yb-lang">
        <a href="/" style="color:#fff;">EN</a>
        <span style="color:#64748b;">·</span>
        <a href="mailto:eric.ahn09@gmail.com">eric.ahn09@gmail.com</a>
      </div>
    </div>
  </div>
  <div class="yb-header">
    <div class="yb-header-inner">
      <a href="index.html" class="yb-brand">
        <div class="yb-brand-logo">YB</div>
        <div class="yb-brand-text">
          <div class="name">YoungBin Technology</div>
          <div class="sub">Semiconductor · Est. 2012</div>
        </div>
      </a>
      <nav class="yb-nav" data-preserve>
        <a href="index.html">Home</a>
        <a href="company.html">Company</a>
        <a href="business.html">Business</a>
        <a href="product.html">Product</a>
        <a href="board.html">Board</a>
        <a href="contact.html">Contact</a>
        <a href="contact.html" class="yb-nav-cta">Request a quote</a>
      </nav>
    </div>
  </div>
</div>
`.trim();

// Per memory note: AI-style sites put nav inside headerHtml; menuHtml stays
// as an empty wrapper so the renderer doesn't double-inject a nav.
const menuHtml = `<div id="hns_menu"></div>`;

const footerHtml = `
<div id="hns_footer" class="dragable" data-preserve>
  <footer class="yb-footer">
    <div class="yb-footer-inner">
      <div class="yb-footer-grid">
        <div class="yb-footer-brand">
          <div class="nm">YoungBin Technology</div>
          <p>Refurbished semiconductor equipment, cost-effective modules and spare parts for fabs worldwide. Established 2012.</p>
        </div>
        <div>
          <h4>Sitemap</h4>
          <ul>
            <li><a href="index.html">Home</a></li>
            <li><a href="company.html">Company</a></li>
            <li><a href="business.html">Business</a></li>
            <li><a href="product.html">Product</a></li>
            <li><a href="board.html">Board</a></li>
            <li><a href="contact.html">Contact</a></li>
          </ul>
        </div>
        <div>
          <h4>Capabilities</h4>
          <ul>
            <li><a href="product.html?action=list&amp;category=3">Canon Stepper</a></li>
            <li><a href="product.html?action=list&amp;category=5">TEL Track</a></li>
            <li><a href="product.html?action=list&amp;category=5">DNS Track</a></li>
            <li><a href="product.html?action=list&amp;category=4">Applied Materials</a></li>
            <li><a href="product.html">All spare parts</a></li>
          </ul>
          <h4 style="margin-top:24px;">Inventory lists</h4>
          <ul>
            <li><a href="https://ybsurplus.com/InventoryList/Canon_InventoryList.xlsx" target="_blank" rel="noopener" download>Canon (.xlsx)</a></li>
            <li><a href="https://ybsurplus.com/InventoryList/TEL_InventoryList.xlsx" target="_blank" rel="noopener" download>TEL Track (.xlsx)</a></li>
            <li><a href="https://ybsurplus.com/InventoryList/DNS_InventoryList.pdf" target="_blank" rel="noopener" download>DNS Track (.pdf)</a></li>
            <li><a href="https://ybsurplus.com/InventoryList/AMAT_InventoryList.xlsx" target="_blank" rel="noopener" download>AMAT (.xlsx)</a></li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li>Sugok-Ro 46, Seowon-Gu</li>
            <li>Cheongju-Si, Chungbuk-Do</li>
            <li>Korea 28696</li>
            <li><a href="mailto:eric.ahn09@gmail.com">eric.ahn09@gmail.com</a></li>
          </ul>
        </div>
      </div>
      <div class="yb-footer-bottom">
        <div>© 2025 YoungBin Technology · ybsurplus.com</div>
        <div>All rights reserved</div>
      </div>
    </div>
  </footer>
</div>
`.trim();

/* ═══════════════════════════════════════════════════════════════════
 *  Page bodies — all wrapped in editable .dragable sections
 * ═══════════════════════════════════════════════════════════════════ */

function pageHome() {
  const sHero = uid("obj_sec"), eyeId = uid("obj_text"), h1Id = uid("obj_title"), leadId = uid("obj_text"), feedId = uid("obj_card"), statsId = uid("obj_text");
  const sCap = uid("obj_sec"), capHead = uid("obj_title"), capLead = uid("obj_text"), capCards = uid("obj_text");
  const sShow = uid("obj_sec"), showHead = uid("obj_title"), showLead = uid("obj_text"), showCards = uid("obj_text");
  const sFeat = uid("obj_sec"), featHead = uid("obj_title"), featLead = uid("obj_text"), featGrid = uid("obj_text");
  const sProc = uid("obj_sec"), procHead = uid("obj_title"), procSteps = uid("obj_text");
  const sInv = uid("obj_sec"), invHead = uid("obj_title"), invLead = uid("obj_text"), invTable = uid("obj_text");
  const sPart = uid("obj_sec"), partHead = uid("obj_title"), partText = uid("obj_text"), partList = uid("obj_text");

  // Real product photos migrated from ybsurplus — kept hosted on the source
  // shopId so they keep working regardless of which site instantiates this
  // template. (User can replace via the editor.)
  const PHOTO_BASE = "https://home.homenshop.com/ybsurplus/uploaded/";
  const featuredItems = [
    { cat: "AMAT · PVD",       name: "AMAT PVD Txz HP+ Chamber",                         badge: "AMAT",   href: "product.html?action=read&id=19",  photo: PHOTO_BASE + "20170323_125811339658d388c943a55.jpg" },
    { cat: "AMAT · Etch",      name: "AMAT Etch ASP+ Chamber",                          badge: "AMAT",   href: "product.html?action=read&id=17",  photo: PHOTO_BASE + "20170323_79123938458d3886fee643.jpg" },
    { cat: "Canon · Lamp",     name: "Canon Stepper HBO-2001 (FPA-3000i4 Lamp)",         badge: "Canon",  href: "product.html?action=read&id=41",  photo: PHOTO_BASE + "20170419_10640790658f6f048e839c.jpg" },
    { cat: "Canon · Optics",   name: "Canon Stepper HeNe Laser, New",                    badge: "Canon",  href: "product.html?action=read&id=43",  photo: PHOTO_BASE + "20170419_113863355358f6f18248cba.jpg" },
    { cat: "TEL · Module",     name: "TEL Track Hot plate module",                       badge: "TEL",    href: "product.html?action=read&id=9",   photo: PHOTO_BASE + "20170322_68355921658d27f2d654d5.jpg" },
    { cat: "TEL · Module",     name: "Auto Drain System",                                badge: "TEL",    href: "product.html?action=read&id=6",   photo: PHOTO_BASE + "20170322_88251165258d27e621b26a.jpg" },
    { cat: "AMAT · Gas",       name: "AMAT Gas Box · Txz",                              badge: "AMAT",   href: "product.html?action=read&id=13",  photo: PHOTO_BASE + "20170323_200442117458d387965f70a.jpg" },
    { cat: "Canon · Robot",    name: "Canon Stepper Hand1 Arm for FPA3000-i4",          badge: "Canon",  href: "product.html?action=read&id=246", photo: PHOTO_BASE + "20170626_1184634781595075906af78.jpg" },
  ];
  const featuredCards = featuredItems.map((p) => `
          <a class="yb-feat-card" href="${p.href}">
            <div class="yb-feat-img"><span class="badge">${p.badge}</span><img src="${p.photo}" alt="${p.name.replace(/"/g, '&quot;')}" loading="lazy" /></div>
            <div class="yb-feat-body">
              <div class="yb-feat-cat">${p.cat}</div>
              <div class="yb-feat-name">${p.name}</div>
            </div>
          </a>`).join("");

  return `
<div class="dragable" id="${sHero}">
  <section class="yb-hero">
    <div class="yb-container">
      <div class="yb-hero-grid">
        <div>
          <div class="dragable sol-replacible-text" id="${eyeId}"><span class="yb-eyebrow-light">Refurbished Semiconductor Equipment</span></div>
          <div class="dragable sol-replacible-text" id="${h1Id}"><h1>Precision tools,<br><span class="accent">second life.</span></h1></div>
          <div class="dragable sol-replacible-text" id="${leadId}"><p class="lead">For 18+ years, YoungBin Technology has refurbished, relocated and supplied parts for Canon Steppers, TEL/DNS Tracks, and Applied Materials systems — enabling fabs worldwide to extend equipment lifecycles at a fraction of new-tool cost.</p></div>
          <div class="yb-hero-actions"><a href="product.html" class="yb-btn yb-btn-light">Browse part inventory <span class="arrow">→</span></a><a href="contact.html" class="yb-btn yb-btn-ghost">Talk to an engineer</a></div>
        </div>
        <div class="yb-hero-side">
          <div class="dragable" id="${feedId}">
            <div class="yb-live-feed">
              <div class="yb-live-feed-head"><span>Recent inventory</span><span class="live">Live</span></div>
              <div class="yb-live-feed-row"><span class="pn">0100-20068</span><span style="color:#94a3b8;">CCD BD · AMAT</span><span class="st yb-st-stock">In stock</span></div>
              <div class="yb-live-feed-row"><span class="pn">PE-250U5SV2</span><span style="color:#94a3b8;">USHIO Lamp</span><span class="st yb-st-stock">In stock</span></div>
              <div class="yb-live-feed-row"><span class="pn">P22NRXA-LDN</span><span style="color:#94a3b8;">Powermax II</span><span class="st yb-st-low">Low (2)</span></div>
              <div class="yb-live-feed-row"><span class="pn">0010-37804</span><span style="color:#94a3b8;">CVD Throttle</span><span class="st yb-st-stock">In stock</span></div>
            </div>
          </div>
          <div class="dragable sol-replacible-text" id="${statsId}">
            <div class="yb-hero-stats">
              <div><div class="num">18+</div><div class="lbl">Years experience</div></div>
              <div><div class="num">1.2k</div><div class="lbl">Parts inventory</div></div>
              <div><div class="num">14</div><div class="lbl">Countries served</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sCap}">
  <section class="yb-section yb-capabilities">
    <div class="yb-container">
      <div class="yb-cap-head">
        <div>
          <span class="yb-eyebrow">Capabilities</span>
          <div class="dragable sol-replacible-text" id="${capHead}"><h2 class="yb-h-section" style="margin-top:24px;">Three platforms.<br>One team behind every tool.</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${capLead}"><p class="yb-lead">We specialize narrowly — and deeply. Every engineer at YoungBin has hands-on experience with the systems we service, which is why fabs in Korea, Taiwan and Southeast Asia trust us with critical relocations and overhauls.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${capCards}">
        <div class="yb-cap-grid">
          <div class="yb-cap-card">
            <div class="num">01 / Lithography</div>
            <h3>Canon Stepper</h3>
            <p>Refurbish, relocation, installation, modification and repair — from PLA-500 aligners through FPA-3000 EX steppers.</p>
            <div class="tags"><span class="yb-tag yb-tag-blue">PLA-500/600</span><span class="yb-tag yb-tag-blue">FPA-2000i</span><span class="yb-tag yb-tag-blue">FPA-3000 EX</span></div>
            <div class="cap-actions">
              <a href="product.html?action=list&amp;category=3" class="link">Canon parts →</a>
              <a href="https://ybsurplus.com/InventoryList/Canon_InventoryList.xlsx" class="cap-dl" target="_blank" rel="noopener" download>
                <span class="ic">↓</span><span class="lbl">Inventory list <em>.xlsx</em></span>
              </a>
            </div>
          </div>
          <div class="yb-cap-card">
            <div class="num">02 / Coat &amp; Develop</div>
            <h3>TEL Track</h3>
            <p>Tokyo Electron coater/developer tracks — Mark V/Vz, Mark 7/8, Act-8/12. Refurbish, relocation and module supply.</p>
            <div class="tags"><span class="yb-tag yb-tag-orange">Mark V/Vz</span><span class="yb-tag yb-tag-orange">Mark 7/8</span><span class="yb-tag yb-tag-orange">Act-8 / 12</span></div>
            <div class="cap-actions">
              <a href="product.html?action=list&amp;category=5" class="link">TEL parts →</a>
              <a href="https://ybsurplus.com/InventoryList/TEL_InventoryList.xlsx" class="cap-dl" target="_blank" rel="noopener" download>
                <span class="ic">↓</span><span class="lbl">Inventory list <em>.xlsx</em></span>
              </a>
            </div>
          </div>
          <div class="yb-cap-card">
            <div class="num">03 / Coat &amp; Develop</div>
            <h3>DNS Track</h3>
            <p>SCREEN/DNS coater/developer tracks — DNS-60 and DNS-80 series. Spare parts and module-level rebuilds available.</p>
            <div class="tags"><span class="yb-tag yb-tag-orange">DNS-60</span><span class="yb-tag yb-tag-orange">DNS-80</span><span class="yb-tag yb-tag-orange">2nd Source</span></div>
            <div class="cap-actions">
              <a href="product.html?action=list&amp;category=5" class="link">DNS parts →</a>
              <a href="https://ybsurplus.com/InventoryList/DNS_InventoryList.pdf" class="cap-dl" target="_blank" rel="noopener" download>
                <span class="ic">↓</span><span class="lbl">Inventory list <em>.pdf</em></span>
              </a>
            </div>
          </div>
          <div class="yb-cap-card">
            <div class="num">04 / Etch &amp; Thin Film</div>
            <h3>Applied Materials</h3>
            <p>AMAT Endura-5500 and Centura-5200 chamber assembly, modification and process support — PVD, CVD, metal.</p>
            <div class="tags"><span class="yb-tag yb-tag-green">Endura 5500</span><span class="yb-tag yb-tag-green">Centura 5200</span><span class="yb-tag yb-tag-green">Chamber</span></div>
            <div class="cap-actions">
              <a href="product.html?action=list&amp;category=4" class="link">AMAT parts →</a>
              <a href="https://ybsurplus.com/InventoryList/AMAT_InventoryList.xlsx" class="cap-dl" target="_blank" rel="noopener" download>
                <span class="ic">↓</span><span class="lbl">Inventory list <em>.xlsx</em></span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sShow}">
  <section class="yb-section yb-showcase">
    <div class="yb-container">
      <div class="yb-showcase-head">
        <div>
          <span class="yb-eyebrow">Active programs</span>
          <div class="dragable sol-replacible-text" id="${showHead}"><h2 class="yb-h-section" style="margin-top:24px;">Recent refurbishment &amp; relocation work</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${showLead}"><p class="yb-lead">From single-chamber overhauls to full tool relocations across borders, our engineers handle every stage — disassembly, transport, re-installation, and process qualification.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${showCards}">
        <div class="yb-showcase-grid">
          <div class="yb-eq-card"><div class="eq-img" style="background-image:url('https://homenshop.com/api/img?q=semiconductor+lithography+stepper+machine+cleanroom&w=1200&h=675');"><div class="tag-row" style="position:absolute;z-index:2;"><span class="eq-tag">Lithography</span><span class="eq-tag" style="background:rgba(0,180,216,0.5);">Active</span></div><div class="eq-meta" style="position:absolute;z-index:2;">FPA-3000 i5+ · 2024-Q4</div></div><div class="eq-body"><div class="eq-cat">Canon Stepper</div><h3>FPA-3000 i5+ relocation &amp; lens performance check</h3><p>Complete tool relocation including XY stage, theta-tilt stage, illumination parts, interferometer laser and B/C scope alignment.</p><div class="models"><span>XY Stage</span><span>Berofram</span><span>Piezo Unit</span><span>Laser align</span></div></div></div>
          <div class="yb-eq-card"><div class="eq-img" style="background-image:url('https://homenshop.com/api/img?q=semiconductor+wafer+coating+track+equipment+factory&w=1200&h=675');"><div class="tag-row" style="position:absolute;z-index:2;"><span class="eq-tag">Coat / Develop</span><span class="eq-tag" style="background:rgba(234,88,12,0.55);">Refurb</span></div><div class="eq-meta" style="position:absolute;z-index:2;">Mark Vz · 2024-Q3</div></div><div class="eq-body"><div class="eq-cat">TEL Track</div><h3>Mark Vz load/unload + align unit overhaul</h3><p>New-brand wafer track system supporting 2"–6" round, 8"–12" round and 5"–7" square wafer process flows for coater, developer and scrubber.</p><div class="models"><span>Hot plate</span><span>LED coater</span><span>Auto drain</span><span>Mixing</span></div></div></div>
          <div class="yb-eq-card"><div class="eq-img" style="background-image:url('https://homenshop.com/api/img?q=vacuum+chamber+semiconductor+processing+equipment+industrial&w=1200&h=675');"><div class="tag-row" style="position:absolute;z-index:2;"><span class="eq-tag">Etch / PVD</span><span class="eq-tag" style="background:rgba(16,185,129,0.5);">Complete</span></div><div class="eq-meta" style="position:absolute;z-index:2;">Endura 5500 · 2024-Q2</div></div><div class="eq-body"><div class="eq-cat">Applied Materials</div><h3>Endura-5500 multi-chamber assembly &amp; upgrade</h3><p>TxZ HP+ MO-CVD, IMP Ti/TiN chamber, AL PVD chamber, Ti/TiN chamber and P/C #2 chamber rebuilt to spec and qualified.</p><div class="models"><span>Ti/TiN PVD</span><span>AL PVD</span><span>P/C #2</span><span>MO-CVD</span></div></div></div>
          <div class="yb-eq-card"><div class="eq-img" style="background-image:url('https://homenshop.com/api/img?q=silicon+wafer+chip+manufacturing+factory+blue&w=1200&h=675');"><div class="tag-row" style="position:absolute;z-index:2;"><span class="eq-tag">CVD / Metal</span><span class="eq-tag" style="background:rgba(0,180,216,0.5);">In progress</span></div><div class="eq-meta" style="position:absolute;z-index:2;">Centura 5200 · 2025-Q1</div></div><div class="eq-body"><div class="eq-cat">Applied Materials</div><h3>Centura-5200 DPS+ &amp; E-Max chamber program</h3><p>DPS+ Metal, DPS+ Poly, Super-e, Mxp/Mxp+, E-Max, Wxz and Dxz chamber installation and process upgrade for memory fab.</p><div class="models"><span>DPS+ Metal</span><span>E-Max</span><span>Mxp+</span><span>Dxz</span></div></div></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sFeat}">
  <section class="yb-section yb-featured">
    <div class="yb-container">
      <div class="yb-featured-head">
        <div>
          <span class="yb-eyebrow">Featured equipment &amp; parts</span>
          <div class="dragable sol-replacible-text" id="${featHead}"><h2 class="yb-h-section" style="margin-top:24px;">Real inventory.<br>Photographed in our workshop.</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${featLead}"><p class="yb-lead">A small slice of the 1,200+ SKUs in stock — from FPA-series stepper sub-systems to AMAT chambers and TEL Track modules. Click any item for full specs, photos and quote requests.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${featGrid}">
        <div class="yb-featured-grid">${featuredCards}
        </div>
      </div>
      <div class="yb-feat-cta-row">
        <a href="product.html" class="yb-btn yb-btn-primary">Browse full catalog (462 items) <span class="arrow">→</span></a>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sProc}">
  <section class="yb-process">
    <div class="yb-container">
      <div class="yb-process-head">
        <span class="yb-eyebrow-light">How we work</span>
        <div class="dragable sol-replacible-text" id="${procHead}"><h2 class="yb-h-section" style="margin-top:24px;">From spec review to first wafer<br>— a single accountable team.</h2></div>
      </div>
      <div class="dragable sol-replacible-text" id="${procSteps}">
        <div class="yb-process-steps">
          <div class="yb-process-step"><div class="no">Step 01</div><h3>Assess</h3><p>Engineering review of tool history, target site conditions, utility specs and process requirements.</p></div>
          <div class="yb-process-step"><div class="no">Step 02</div><h3>Refurbish</h3><p>Full disassembly, parts replacement, sub-system rebuild and bench-level qualification before shipment.</p></div>
          <div class="yb-process-step"><div class="no">Step 03</div><h3>Relocate</h3><p>Crating, customs, on-site installation and utility hook-up — coordinated with your facilities team.</p></div>
          <div class="yb-process-step"><div class="no">Step 04</div><h3>Qualify</h3><p>Process tuning, lens performance check, wafer qualification and operator handoff with full documentation.</p></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sInv}">
  <section class="yb-inventory">
    <div class="yb-container">
      <div class="yb-inv-head">
        <div>
          <span class="yb-eyebrow">Spare parts inventory</span>
          <div class="dragable sol-replacible-text" id="${invHead}"><h2 class="yb-h-section" style="margin-top:24px;">Live from the warehouse.</h2></div>
        </div>
        <div>
          <div class="dragable sol-replacible-text" id="${invLead}"><p class="yb-lead">A real-time slice of in-stock spare parts for AMAT, Canon, TEL Track and ETC systems. Full catalog with filtering on the Product page.</p></div>
          <a href="product.html" class="yb-btn yb-btn-outline" style="margin-top:24px;">Open full inventory <span class="arrow">→</span></a>
        </div>
      </div>
      <div class="dragable sol-replacible-text" id="${invTable}">
        <div class="yb-inv-table">
          <div class="yb-inv-row head"><div>Part No.</div><div>Category</div><div>Description</div><div>Qty</div><div>Status</div></div>
          <div class="yb-inv-row"><div class="pn">0100-20068</div><div class="cat">AMAT · PCB</div><div class="desc">CCD BD assembly, 200mm platform</div><div class="qty">12 ea</div><div class="stat yb-stat-stock">In stock</div></div>
          <div class="yb-inv-row"><div class="pn">PE-250U5SV2</div><div class="cat">USHIO · Lamp</div><div class="desc">Mercury short-arc lamp, 250W</div><div class="qty">8 ea</div><div class="stat yb-stat-stock">In stock</div></div>
          <div class="yb-inv-row"><div class="pn">P22NRXA-LDN-HD</div><div class="cat">AMAT · Power</div><div class="desc">Powermax II, high-density power module</div><div class="qty">2 ea</div><div class="stat yb-stat-low">Low stock</div></div>
          <div class="yb-inv-row"><div class="pn">0020-18109</div><div class="cat">AMAT · Hardware</div><div class="desc">200mm SNNF SML FLT Ultima HDPC collar</div><div class="qty">5 ea</div><div class="stat yb-stat-stock">In stock</div></div>
          <div class="yb-inv-row"><div class="pn">0020-05810</div><div class="cat">AMAT · Gasket</div><div class="desc">Gasket RF 8.02&quot; × .135&quot; THK Copper 8&quot; B1</div><div class="qty">14 ea</div><div class="stat yb-stat-stock">In stock</div></div>
          <div class="yb-inv-row"><div class="pn">0010-37804</div><div class="cat">AMAT · CVD</div><div class="desc">5000/5200 CVD throttle valve assembly</div><div class="qty">3 ea</div><div class="stat yb-stat-low">Low stock</div></div>
          <div class="yb-inv-row"><div class="pn">FCS-G1/4A2-NA</div><div class="cat">AMAT · Flow</div><div class="desc">Truck flow control, H1141 line</div><div class="qty">1 ea</div><div class="stat yb-stat-1">Last unit</div></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sPart}">
  <section class="yb-partners-cta">
    <div class="yb-container">
      <div class="yb-partners-grid">
        <div>
          <span class="yb-eyebrow-light">Your business partner</span>
          <div class="dragable sol-replacible-text" id="${partHead}"><h2 class="yb-h-section" style="margin-top:24px;">Let's keep your fab running.</h2></div>
          <div class="dragable sol-replacible-text" id="${partText}"><p>Whether you're starting a new line, expanding capacity, or troubleshooting a legacy tool — we'd like to support and earn the chance to work with you. Tell us what you need and we'll respond within one business day.</p></div>
          <div class="yb-partners-actions"><a href="contact.html" class="yb-btn yb-btn-light">Request a quote <span class="arrow">→</span></a><a href="company.html" class="yb-btn yb-btn-ghost">About YoungBin</a></div>
        </div>
        <div class="dragable sol-replacible-text" id="${partList}">
          <div class="yb-partners-list">
            <div class="partner"><div class="role">Lithography</div><div class="nm">Canon</div></div>
            <div class="partner"><div class="role">Coat / Develop</div><div class="nm">Tokyo Electron</div></div>
            <div class="partner"><div class="role">Coat / Develop</div><div class="nm">SCREEN (DNS)</div></div>
            <div class="partner"><div class="role">Etch / PVD / CVD</div><div class="nm">Applied Materials</div></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageCompany() {
  const sHead = uid("obj_sec"), crumbsId = uid("obj_text"), titleId = uid("obj_title"), descId = uid("obj_text");
  const sWelcome = uid("obj_sec"), welText = uid("obj_text");
  const sSpec = uid("obj_sec"), specId = uid("obj_text");
  const sTl = uid("obj_sec"), tlHead = uid("obj_title"), tlBody = uid("obj_text");
  const sOrg = uid("obj_sec"), orgHead = uid("obj_title"), orgBody = uid("obj_text");
  const sVal = uid("obj_sec"), valHead = uid("obj_title"), valBody = uid("obj_text");
  const sCta = uid("obj_sec"), ctaText = uid("obj_text");

  return `
<div class="dragable" id="${sHead}">
  <section class="yb-page-header">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${crumbsId}"><div class="yb-crumbs">YoungBin · Company</div></div>
      <div class="dragable sol-replacible-text" id="${titleId}"><h1>An engineer-led team behind every refurbished tool.</h1></div>
      <div class="dragable sol-replacible-text" id="${descId}"><p class="desc">Founded in 2012 in Cheongju, Korea — YoungBin Technology has spent over a decade specializing in lithography, etch and track equipment for semiconductor fabs across Asia and beyond.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${sWelcome}">
  <section class="yb-section">
    <div class="yb-container">
      <div class="yb-welcome">
        <div class="yb-welcome-img" style="background-image:url('https://homenshop.com/api/img?q=microchip+electronic+circuit+board+macro+detail&w=900&h=1125');"><div class="corner"></div><div class="label">Cheongju HQ · Workshop floor</div></div>
        <div class="dragable sol-replacible-text" id="${welText}">
          <div class="yb-welcome-text">
            <span class="yb-eyebrow">Welcome</span>
            <h2>Welcome to YoungBin Technology.</h2>
            <p>For over 18 years, our team has worked hands-on with Canon Steppers, TEL Track and Applied Materials systems across the semiconductor industry — building deep familiarity with each platform's quirks, failure modes and process windows.</p>
            <p>Whether you're starting a new fab, expanding capacity, or troubleshooting existing tools, we offer practical engineering help backed by a wide inventory of spare parts for AMAT, TEL/DNS Track, and Canon Stepper.</p>
            <p>Most of all — our cost-effective modules and second-source parts make a real difference to your operating budget without compromising tool performance. We hope to support you and earn the chance to work together for the long term.</p>
            <div class="yb-signature">Sincerely yours,<span class="nm">YoungBin Technology</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sSpec}">
  <section class="yb-section-tight">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${specId}">
        <div class="yb-spec-strip">
          <div><div class="num">2012</div><div class="label">Established</div></div>
          <div><div class="num">18+</div><div class="label">Years experience</div></div>
          <div><div class="num">3</div><div class="label">Equipment platforms</div></div>
          <div><div class="num">14</div><div class="label">Countries served</div></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sTl}">
  <section class="yb-section yb-timeline-section">
    <div class="yb-container">
      <div style="max-width:720px; margin-bottom:64px;">
        <span class="yb-eyebrow">History</span>
        <div class="dragable sol-replacible-text" id="${tlHead}"><h2 class="yb-h-section" style="margin-top:24px;">Twelve years of measured growth.</h2></div>
      </div>
      <div class="dragable sol-replacible-text" id="${tlBody}">
        <div class="yb-timeline">
          <div class="yb-tl-row"><div class="yb-tl-date">JUN 2012</div><div class="yb-tl-dot"></div><div class="yb-tl-content"><h3>YoungBin Technology established</h3><p>Founded in Cheongju, Chungbuk-Do, Korea, with a focus on used semiconductor equipment service.</p></div></div>
          <div class="yb-tl-row"><div class="yb-tl-date">SEP 2012</div><div class="yb-tl-dot"></div><div class="yb-tl-content"><h3>Lithography 2nd-source parts development</h3><p>Began developing and supplying alternative-source spare parts for Canon Stepper systems.</p></div></div>
          <div class="yb-tl-row"><div class="yb-tl-date">MAY 2014</div><div class="yb-tl-dot"></div><div class="yb-tl-content"><h3>TEL Track refurbish &amp; relocation launched</h3><p>Expanded capability to include Tokyo Electron coater/developer track systems — Mark V through Act-12.</p></div></div>
          <div class="yb-tl-row"><div class="yb-tl-date">SEP 2015</div><div class="yb-tl-dot"></div><div class="yb-tl-content"><h3>Canon Stepper refurbish &amp; relocation launched</h3><p>Established full refurbishment line for Canon FPA-series steppers, supporting end-to-end relocations.</p></div></div>
          <div class="yb-tl-row"><div class="yb-tl-date">JAN 2016</div><div class="yb-tl-dot"></div><div class="yb-tl-content"><h3>AMAT refurbish &amp; relocation launched</h3><p>Added Applied Materials Endura-5500 and Centura-5200 capability — chamber assembly, modification and process support.</p></div></div>
          <div class="yb-tl-row"><div class="yb-tl-date">2019 — TODAY</div><div class="yb-tl-dot" style="background:#00b4d8;box-shadow:0 0 0 1px #00b4d8,0 0 12px #00b4d8;"></div><div class="yb-tl-content"><h3>Global expansion &amp; spare parts inventory</h3><p>Active programs across Korea, Taiwan, China and Southeast Asia. Spare parts inventory now exceeds 1,200 SKUs across four equipment families.</p></div></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sOrg}">
  <section class="yb-section" style="background:#fff; padding:120px 0;">
    <div class="yb-container">
      <div style="max-width:720px; margin-bottom:80px;">
        <span class="yb-eyebrow">Organization</span>
        <div class="dragable sol-replacible-text" id="${orgHead}"><h2 class="yb-h-section" style="margin-top:24px;">How the team is structured.</h2></div>
      </div>
      <div class="dragable sol-replacible-text" id="${orgBody}">
        <div class="yb-org-chart">
          <div class="yb-org-node root"><div class="role">Headquarters</div><div class="nm">YB Technology</div></div>
          <div class="yb-org-tier-2">
            <div class="yb-org-node"><div class="role">Division</div><div class="nm">Lithography Used Tools</div></div>
            <div class="yb-org-node"><div class="role">Division</div><div class="nm">Etch / Thin Film Used Tools</div></div>
            <div class="yb-org-node"><div class="role">Division</div><div class="nm">New Module</div></div>
            <div class="yb-org-node"><div class="role">Division</div><div class="nm">Application</div></div>
          </div>
          <div class="yb-org-tier-3">
            <div class="yb-org-node"><div class="role">Platform</div><div class="nm">Canon · Tel Track</div></div>
            <div class="yb-org-node"><div class="role">Platform</div><div class="nm">AMAT</div></div>
            <div class="yb-org-node"><div class="role">Platform</div><div class="nm">AMAT · Tel Track</div></div>
            <div class="yb-org-node"><div class="role">Service</div><div class="nm">Litho Process Training</div></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sVal}">
  <section class="yb-values">
    <div class="yb-container">
      <div style="max-width:720px;">
        <span class="yb-eyebrow-light">Operating principles</span>
        <div class="dragable sol-replacible-text" id="${valHead}"><h2 class="yb-h-section" style="margin-top:24px;">What we hold ourselves to.</h2></div>
      </div>
      <div class="dragable sol-replacible-text" id="${valBody}">
        <div class="yb-val-grid">
          <div class="yb-val-card"><div class="vno">01 / Specialization</div><h3>Deep, not wide.</h3><p>We service three equipment families — Canon, TEL/DNS and AMAT — and we know them well. We say no to work outside that lane so the work inside it is excellent.</p></div>
          <div class="yb-val-card"><div class="vno">02 / Accountability</div><h3>One team, start to finish.</h3><p>The engineers who assess your tool are the ones who refurbish it, install it and qualify it. No subcontracting, no handoffs, no mystery owners.</p></div>
          <div class="yb-val-card"><div class="vno">03 / Practicality</div><h3>Lifecycle over showroom.</h3><p>Refurbished doesn't mean compromised — but it does mean cost-effective. We optimize for total cost of ownership, not new-tool aesthetics.</p></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sCta}">
  <section class="yb-partners-cta" style="padding:96px 0;">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${ctaText}">
        <div style="text-align:center; max-width:720px; margin:0 auto;">
          <span class="yb-eyebrow-light">Work with us</span>
          <h2 class="yb-h-section" style="margin-top:24px; color:#fff;">Tell us about your project.</h2>
          <p style="color:#cbd5e1; margin-top:24px; font-size:17px;">New fab, expansion, relocation, troubleshooting — every conversation starts with a quick call.</p>
          <div style="margin-top:40px; display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
            <a href="contact.html" class="yb-btn yb-btn-light">Contact us <span class="arrow">→</span></a>
            <a href="product.html" class="yb-btn yb-btn-ghost">Browse inventory</a>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

function pageBusiness() {
  const sHead = uid("obj_sec"), crumbsId = uid("obj_text"), titleId = uid("obj_title"), descId = uid("obj_text");
  const sSvc = uid("obj_sec"), svcIntroH = uid("obj_title"), svcIntroP = uid("obj_text"), svcGrid = uid("obj_text");
  const sModels = uid("obj_sec"), modH = uid("obj_title"), modLead = uid("obj_text"), modGrid = uid("obj_text");

  return `
<div class="dragable" id="${sHead}">
  <section class="yb-page-header">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${crumbsId}"><div class="yb-crumbs">YoungBin · Business</div></div>
      <div class="dragable sol-replacible-text" id="${titleId}"><h1>Eight services. One workflow. Three platforms.</h1></div>
      <div class="dragable sol-replacible-text" id="${descId}"><p class="desc">Whether you need a single chamber rebuilt or a full tool relocated across borders, we handle the same workflow end-to-end — assess, refurbish, relocate, qualify.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${sSvc}">
  <section class="yb-section">
    <div class="yb-container">
      <div class="yb-biz-intro">
        <div>
          <span class="yb-eyebrow">Service offering</span>
          <div class="dragable sol-replacible-text" id="${svcIntroH}"><h2 class="yb-h-section" style="margin-top:24px;">Eight services.<br>One workflow.</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${svcIntroP}"><p class="yb-lead">Most of our work falls into one of the eight service types below. Whether you need a single chamber rebuilt or a full tool relocated across borders, we handle the same workflow end-to-end — assess, refurbish, relocate, qualify.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${svcGrid}">
        <div class="yb-svc-grid">
          <div class="yb-svc-card"><div class="num">01 / Service</div><h3>Refurbish</h3><p>Full disassembly, parts replacement, sub-system rebuild and bench-level qualification — restoring tools to manufacturer-spec performance.</p></div>
          <div class="yb-svc-card"><div class="num">02 / Service</div><h3>Relocation</h3><p>Tool de-installation, crating, customs handling, on-site re-installation and utility hook-up — coordinated with your facilities team.</p></div>
          <div class="yb-svc-card"><div class="num">03 / Service</div><h3>Modification</h3><p>Hardware and software updates that adapt legacy tools to new wafer sizes, processes, or fab requirements without replacing the platform.</p></div>
          <div class="yb-svc-card"><div class="num">04 / Service</div><h3>Repair</h3><p>Fault diagnosis and component-level repair across XY stage, illumination optics, throttle valves, RF systems and process chambers.</p></div>
          <div class="yb-svc-card"><div class="num">05 / Service</div><h3>Overhaul</h3><p>Periodic deep maintenance — typically scheduled at 5- and 10-year intervals — to extend tool life and restore process margins.</p></div>
          <div class="yb-svc-card"><div class="num">06 / Service</div><h3>Module supply</h3><p>Auto-drain systems, manual coater, chemical mixing, hot-plate modules, LED coater/developer and Mark-Vz load/unload align units.</p></div>
          <div class="yb-svc-card"><div class="num">07 / Service</div><h3>2nd Source</h3><p>Cost-effective alternative-source parts validated against OEM specifications — significant savings without sacrificing yield.</p></div>
          <div class="yb-svc-card"><div class="num">08 / Service</div><h3>Chamber assembly</h3><p>AMAT Endura/Centura chamber rebuilds — Ti/TiN, AL PVD, MO-CVD, DPS+ Metal, E-Max, Mxp+ — assembled, leak-checked, qualified.</p></div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sModels}">
  <section class="yb-section yb-models-section">
    <div class="yb-container">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:end;">
        <div>
          <span class="yb-eyebrow">System models</span>
          <div class="dragable sol-replacible-text" id="${modH}"><h2 class="yb-h-section" style="margin-top:24px;">Tools we know cold.</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${modLead}"><p class="yb-lead">Every model below has been hands-on serviced by our team. If a system you run isn't on this list, we may still be able to help — call us and we'll tell you straight.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${modGrid}">
        <div class="yb-models-grid">
          <div class="yb-model-card"><div class="vendor">Canon · Lithography</div><h3>Aligner &amp; Stepper</h3><ul><li>PLA-500 / 600</li><li>MPA-500 / 600</li><li>FPA-1550M3 / M4</li><li>FPA-2000i1 / 2500i2 / i3</li><li>FPA-3000 i2 / i4 / i5 / i5+</li><li>FPA-3000 EX3 / EX4 / EX5 / EX6</li><li>FPA-5500 / 5510 iZ / iZ+ / iZa</li></ul></div>
          <div class="yb-model-card tel"><div class="vendor">TEL / SCREEN · Coat &amp; Develop</div><h3>Wafer Track</h3><ul><li>Tel Track Mark V / Mark Vz</li><li>Tel Track Mark 7 / Mark 8</li><li>Tel Track Act-8 / Act-12</li><li>DNS Track DNS-60 series</li><li>DNS Track DNS-80 series</li></ul></div>
          <div class="yb-model-card amat"><div class="vendor">Applied Materials · Etch / PVD / CVD</div><h3>Endura &amp; Centura</h3><ul><li>AMAT Endura-5500</li><li>AMAT Centura-5200</li><li>TxZ HP+ / MO-CVD chambers</li><li>IMP Ti/TiN / AL PVD</li><li>DPS+ Metal / Poly · Super-e</li><li>Mxp / Mxp+ · E-Max · Wxz · Dxz</li></ul></div>
        </div>
      </div>
      <div style="text-align:center; margin-top:64px;">
        <a href="product.html" class="yb-btn yb-btn-primary">Explore products &amp; parts <span class="arrow">→</span></a>
      </div>
    </div>
  </section>
</div>
`.trim();
}

// product.html: slim page-header + a small "Live parts catalog" intro.
// Published renderer appends the dynamic parts catalog (.product-content)
// below this. Platform deep-dive sections were removed per user request —
// the catalog itself is the page's primary content.
function pageProduct() {
  const sHead = uid("obj_sec"), crumbsId = uid("obj_text"), titleId = uid("obj_title");
  const sIntro = uid("obj_sec"), introH = uid("obj_title"), introP = uid("obj_text");
  return `
<div class="dragable" id="${sHead}">
  <section class="yb-page-header yb-page-header-slim">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${crumbsId}"><div class="yb-crumbs">YoungBin · Product</div></div>
      <div class="dragable sol-replacible-text" id="${titleId}"><h1>Tools, modules and parts for the platforms we know best.</h1></div>
    </div>
  </section>
</div>

<div class="dragable" id="${sIntro}">
  <section class="yb-list-intro">
    <div class="yb-container">
      <span class="yb-eyebrow">Spare parts inventory</span>
      <div class="dragable sol-replacible-text" id="${introH}"><h2>Live parts catalog.</h2></div>
      <div class="dragable sol-replacible-text" id="${introP}"><p>Filter by platform, search by part number or model. All listings reflect warehouse stock — typical lead time on in-stock items is 3–5 business days.</p></div>
    </div>
  </section>
</div>
`.trim();
}

// board.html: slim page-header + small editorial intro. Published renderer
// appends the dynamic .board-content list below.
function pageBoard() {
  const sHead = uid("obj_sec"), crumbsId = uid("obj_text"), titleId = uid("obj_title");
  const sIntro = uid("obj_sec"), introH = uid("obj_title"), introP = uid("obj_text");
  return `
<div class="dragable" id="${sHead}">
  <section class="yb-page-header yb-page-header-slim">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${crumbsId}"><div class="yb-crumbs">YoungBin · Board</div></div>
      <div class="dragable sol-replacible-text" id="${titleId}"><h1>Parts lists, technical bulletins &amp; announcements.</h1></div>
    </div>
  </section>
</div>

<div class="dragable" id="${sIntro}">
  <section class="yb-list-intro">
    <div class="yb-container">
      <span class="yb-eyebrow">Technical bulletins</span>
      <div class="dragable sol-replacible-text" id="${introH}"><h2>Spare parts catalogs &amp; announcements.</h2></div>
      <div class="dragable sol-replacible-text" id="${introP}"><p>Browse parts lists published by our team — most posts include downloadable PDFs with part numbers, models supported and quote forms.</p></div>
    </div>
  </section>
</div>
`.trim();
}

function pageContact() {
  const sHead = uid("obj_sec"), crumbsId = uid("obj_text"), titleId = uid("obj_title"), descId = uid("obj_text");
  const sForm = uid("obj_sec"), formId = uid("obj_text"), infoId = uid("obj_text");
  const sMap = uid("obj_sec");
  const sFaq = uid("obj_sec"), faqH = uid("obj_title"), faqLead = uid("obj_text"), faqBody = uid("obj_text");
  return `
<div class="dragable" id="${sHead}">
  <section class="yb-page-header">
    <div class="yb-container">
      <div class="dragable sol-replacible-text" id="${crumbsId}"><div class="yb-crumbs">YoungBin · Contact</div></div>
      <div class="dragable sol-replacible-text" id="${titleId}"><h1>Tell us what you need.</h1></div>
      <div class="dragable sol-replacible-text" id="${descId}"><p class="desc">Quote requests, technical questions, partnership inquiries — every message is read by an engineer, not a chatbot. Typical response time: one business day.</p></div>
    </div>
  </section>
</div>

<div class="dragable" id="${sForm}">
  <section class="yb-section">
    <div class="yb-container">
      <div class="yb-contact-grid">
        <div class="dragable sol-replacible-text" id="${formId}">
          <div class="yb-contact-form">
            <h2>Send us a message</h2>
            <p class="sub">All fields are optional except email. Attach part numbers, model lists, or pictures if helpful.</p>
            <form action="/api/contact/submit" method="post">
              <div class="yb-field-row">
                <div class="yb-field"><label>Name</label><input type="text" name="name" placeholder="Jane Park"></div>
                <div class="yb-field"><label>Company</label><input type="text" name="company" placeholder="Memory Fab Co."></div>
              </div>
              <div class="yb-field-row">
                <div class="yb-field"><label>Email *</label><input type="email" name="email" required placeholder="jane@fab.com"></div>
                <div class="yb-field"><label>Country</label><input type="text" name="country" placeholder="Korea"></div>
              </div>
              <div class="yb-field"><label>Inquiry type</label><select name="topic"><option>Spare parts quote</option><option>Tool refurbish / relocation</option><option>Chamber assembly (AMAT)</option><option>Module supply (TEL/DNS)</option><option>Lithography process training</option><option>General partnership</option></select></div>
              <div class="yb-field"><label>Equipment platform(s)</label><select name="platform"><option>Canon Stepper</option><option>TEL / DNS Track</option><option>AMAT (Endura / Centura)</option><option>Multiple — see message</option><option>Other / unsure</option></select></div>
              <div class="yb-field"><label>Message</label><textarea name="message" placeholder="Models, part numbers, timeline, or anything else we should know…"></textarea></div>
              <button class="yb-btn yb-btn-primary" type="submit" style="width:100%; justify-content:center;">Send inquiry <span class="arrow">→</span></button>
            </form>
          </div>
        </div>
        <div class="dragable sol-replacible-text" id="${infoId}">
          <div class="yb-contact-info">
            <div><div class="yb-ic-h">Email</div><h3>Eric Ahn</h3><p>Direct line for engineering &amp; quote requests.</p><p style="margin-top:8px;"><a href="mailto:eric.ahn09@gmail.com" style="font-family:'JetBrains Mono',monospace; font-size:14px;">eric.ahn09@gmail.com</a></p></div>
            <div><div class="yb-ic-h">Headquarters</div><h3>Cheongju, Korea</h3><p>Sugok-Ro 46, Seowon-Gu<br>Cheongju-Si, Chungbuk-Do<br>Korea 28696</p></div>
            <div><div class="yb-ic-h">Hours</div><h3>Monday – Friday</h3><p>09:00 – 18:00 KST<br>Urgent equipment downtime: 24/7 by prior arrangement.</p></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="dragable" id="${sMap}">
  <section class="yb-map-band">
    <div class="yb-map-fake">
      <div class="yb-map-pin"></div>
      <div class="yb-map-label">YoungBin Technology · Cheongju HQ</div>
    </div>
  </section>
</div>

<div class="dragable" id="${sFaq}">
  <section class="yb-section">
    <div class="yb-container">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:end;">
        <div>
          <span class="yb-eyebrow">Frequent questions</span>
          <div class="dragable sol-replacible-text" id="${faqH}"><h2 class="yb-h-section" style="margin-top:24px;">Before you write.</h2></div>
        </div>
        <div class="dragable sol-replacible-text" id="${faqLead}"><p class="yb-lead">A few things people ask most often. If your question isn't here, just send it — we'd rather answer than have you guess.</p></div>
      </div>
      <div class="dragable sol-replacible-text" id="${faqBody}">
        <div class="yb-faq-grid">
          <div class="yb-faq-item"><div class="q">Do you ship parts internationally?</div><div class="a">Yes — we regularly ship to Taiwan, China, Japan, Singapore, the US and the EU. We handle export documentation; the customer typically handles import duties.</div></div>
          <div class="yb-faq-item"><div class="q">What's a typical lead time on in-stock parts?</div><div class="a">3–5 business days from order confirmation for items marked "In stock" on the Product page. Refurbishment programs vary by scope — typically 6–14 weeks.</div></div>
          <div class="yb-faq-item"><div class="q">Do you offer warranty on refurbished tools?</div><div class="a">Yes. Refurbished tools come with a standard 6-month parts warranty plus on-site support during the qualification period. Extended terms available on request.</div></div>
          <div class="yb-faq-item"><div class="q">Can you support tools not listed on the Business page?</div><div class="a">Sometimes. We focus on Canon, TEL/DNS and AMAT — but adjacent systems (LAM, Nikon, ASML) come up regularly through our parts network. Ask and we'll tell you straight.</div></div>
        </div>
      </div>
    </div>
  </section>
</div>
`.trim();
}

const pages = [
  { slug: "index",    title: "Home",     isHome: true,  sortOrder: 0, html: pageHome() },
  { slug: "company",  title: "Company",  isHome: false, sortOrder: 1, html: pageCompany() },
  { slug: "business", title: "Business", isHome: false, sortOrder: 2, html: pageBusiness() },
  { slug: "product",  title: "Product",  isHome: false, sortOrder: 3, html: pageProduct() },
  { slug: "board",    title: "Board",    isHome: false, sortOrder: 4, html: pageBoard() },
  { slug: "contact",  title: "Contact",  isHome: false, sortOrder: 5, html: pageContact() },
];

const pagesSnapshot = pages.map((p) => ({
  slug: p.slug,
  title: p.title,
  content: { html: p.html },
  css: null,
  lang: "en",
  sortOrder: p.sortOrder,
  isHome: p.isHome,
  showInMenu: true,
}));

/* ═══════════════════════════════════════════════════════════════════
 *  UPSERT
 * ═══════════════════════════════════════════════════════════════════ */

const pool = new pg.Pool({ connectionString: DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const owner = await client.query(
      'SELECT id, email FROM "User" WHERE id = $1',
      [OWNER_USER_ID],
    );
    if (!owner.rows.length) throw new Error(`Owner user ${OWNER_USER_ID} not found`);
    const source = await client.query(
      'SELECT id, "shopId", name FROM "Site" WHERE id = $1',
      [SOURCE_SITE_ID],
    );
    if (!source.rows.length) throw new Error(`Source site ${SOURCE_SITE_ID} not found`);

    console.log(`Owner:  ${owner.rows[0].email} (${OWNER_USER_ID})`);
    console.log(`Source: ${source.rows[0].name} / ${source.rows[0].shopId}`);

    const tplToken = randomBytes(6).toString("hex");
    const storageShopId = `tpl-${tplToken}`.slice(0, 20);
    const tplPath = `user-templates/u_${OWNER_USER_ID}_${Date.now()}`;

    const templateName = "YoungBin Modern Industrial";
    const templateDescription =
      "Modern industrial template inspired by ASML / Lam Research — refurbished semiconductor equipment, spare parts catalog, technical board. Navy + cyan, Space Grotesk + JetBrains Mono. Ships pre-loaded with 462 EN products and 17 board posts migrated from ybsurplus.";
    const templateCategory = "business";
    const templateKeywords = "semiconductor,industrial,b2b,parts catalog,refurbished,canon stepper,amat,tel track,dark navy,modern,english";
    const templateThumb = "https://homenshop.com/api/img?q=semiconductor+wafer+equipment+factory+industrial&w=800&h=600";

    /* ─── Storage Site ─── */
    const storageSiteId = cuid();
    await client.query(
      `INSERT INTO "Site" (
         id, "userId", "shopId", name, description,
         "defaultLanguage", languages, "templateId", "templatePath",
         "headerHtml", "menuHtml", "footerHtml", "cssText",
         published, "accountType", "isTemplateStorage",
         "tempDomain", "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, NULL, $8,
         $9, $10, $11, $12,
         false, 'free', true,
         'home.homenshop.com', NOW(), NOW()
       )`,
      [
        storageSiteId, OWNER_USER_ID, storageShopId,
        templateName, templateDescription,
        "en", ["en"], tplPath,
        headerHtml, menuHtml, footerHtml, cssText,
      ],
    );
    console.log(`✓ Storage Site created: ${storageSiteId} (${storageShopId})`);

    /* ─── Pages on storage site ─── */
    for (const p of pages) {
      await client.query(
        `INSERT INTO "Page" (
           id, "siteId", title, slug, lang, content, css,
           "sortOrder", "isHome", depth, "showInMenu", "menuType",
           "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, 'en', $5::jsonb, NULL,
           $6, $7, '01', true, 'page',
           NOW(), NOW()
         )`,
        [
          cuid(), storageSiteId, p.title, p.slug,
          JSON.stringify({ html: p.html }),
          p.sortOrder, p.isHome,
        ],
      );
    }
    console.log(`✓ ${pages.length} Pages created on storage site`);

    /* ─── Migrate BoardCategories (EN only) ─── */
    const catRows = await client.query(
      `SELECT id, "legacyId", lang, name, "defaultKey", "replyMode",
              "writeMode", "rowsPerPage", "titleLen", "imgWidth",
              "imgHeight", "listStyle"
         FROM "BoardCategory"
        WHERE "siteId" = $1 AND lang = 'en'
        ORDER BY "legacyId"`,
      [SOURCE_SITE_ID],
    );
    const catIdMap = new Map();
    for (const c of catRows.rows) {
      const newId = cuid();
      catIdMap.set(c.id, newId);
      await client.query(
        `INSERT INTO "BoardCategory" (
           id, "siteId", "legacyId", lang, name, "defaultKey",
           "replyMode", "writeMode", "rowsPerPage", "titleLen",
           "imgWidth", "imgHeight", "listStyle"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          newId, storageSiteId, c.legacyId, c.lang, c.name,
          c.defaultKey, c.replyMode, c.writeMode, c.rowsPerPage,
          c.titleLen, c.imgWidth, c.imgHeight, c.listStyle,
        ],
      );
    }
    console.log(`✓ ${catRows.rows.length} BoardCategories migrated`);

    /* ─── Migrate BoardPosts (EN only) ─── */
    const postRows = await client.query(
      `SELECT id, "categoryId", "legacyId", lang, author, title,
              content, photos, views, "isNotice", "isPublic", regdate
         FROM "BoardPost"
        WHERE "siteId" = $1 AND lang = 'en'
        ORDER BY "legacyId"`,
      [SOURCE_SITE_ID],
    );
    for (const p of postRows.rows) {
      await client.query(
        `INSERT INTO "BoardPost" (
           id, "siteId", "categoryId", "legacyId", lang, author,
           title, content, photos, views, "isNotice", "isPublic",
           regdate, "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())`,
        [
          cuid(), storageSiteId, catIdMap.get(p.categoryId) || null,
          p.legacyId, p.lang, p.author, p.title, p.content, p.photos,
          p.views, p.isNotice, p.isPublic, p.regdate,
        ],
      );
    }
    console.log(`✓ ${postRows.rows.length} BoardPosts migrated`);

    /* ─── Migrate Products (EN only) ─── */
    const prodRows = await client.query(
      `SELECT "legacyId", lang, name, description, price, "salePrice",
              stock, category, images, photos, specification, status, "sortOrder"
         FROM "Product"
        WHERE "siteId" = $1 AND lang = 'en'
        ORDER BY "legacyId"`,
      [SOURCE_SITE_ID],
    );
    let prodCount = 0;
    for (const p of prodRows.rows) {
      await client.query(
        `INSERT INTO "Product" (
           id, "siteId", "legacyId", lang, name, description,
           price, "salePrice", stock, category, images, photos,
           specification, status, "sortOrder", "createdAt", "updatedAt"
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14::"ProductStatus",$15,NOW(),NOW()
         )`,
        [
          cuid(), storageSiteId, p.legacyId, p.lang, p.name, p.description,
          p.price, p.salePrice, p.stock, p.category,
          p.images ? JSON.stringify(p.images) : null,
          p.photos, p.specification, p.status, p.sortOrder,
        ],
      );
      prodCount += 1;
    }
    console.log(`✓ ${prodCount} Products migrated`);

    /* ─── Template row ─── */
    const existingTpl = await client.query(
      'SELECT id FROM "Template" WHERE name = $1 AND "userId" = $2 LIMIT 1',
      [templateName, OWNER_USER_ID],
    );
    if (existingTpl.rows.length) {
      const tplId = existingTpl.rows[0].id;
      // Update existing — also drop the previous demoSite to avoid orphans
      const oldDemo = await client.query(
        'SELECT "demoSiteId" FROM "Template" WHERE id = $1',
        [tplId],
      );
      await client.query(
        `UPDATE "Template"
            SET path = $2, description = $3, category = $4, keywords = $5,
                "thumbnailUrl" = $6, "headerHtml" = $7, "menuHtml" = $8,
                "footerHtml" = $9, "cssText" = $10,
                "pagesSnapshot" = $11::jsonb, "demoSiteId" = $12,
                "isPublic" = false, "isActive" = true,
                "isResponsive" = true, "updatedAt" = NOW()
          WHERE id = $1`,
        [
          tplId, tplPath, templateDescription, templateCategory,
          templateKeywords, templateThumb,
          headerHtml, menuHtml, footerHtml, cssText,
          JSON.stringify(pagesSnapshot), storageSiteId,
        ],
      );
      const oldDemoId = oldDemo.rows[0]?.demoSiteId;
      if (oldDemoId && oldDemoId !== storageSiteId) {
        await client.query('DELETE FROM "Site" WHERE id = $1 AND "isTemplateStorage" = true', [oldDemoId]);
      }
      console.log(`✓ Updated existing Template: ${tplId}`);
    } else {
      const tplId = cuid();
      await client.query(
        `INSERT INTO "Template" (
           id, "userId", name, path, "thumbnailUrl",
           category, price, keywords, description,
           "demoSiteId", "headerHtml", "menuHtml", "footerHtml", "cssText",
           "pagesSnapshot", "isPublic", "isActive", "isResponsive",
           clicks, "sortOrder", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, 0, $7, $8,
           $9, $10, $11, $12, $13,
           $14::jsonb, false, true, true,
           0, 0, NOW(), NOW()
         )`,
        [
          tplId, OWNER_USER_ID, templateName, tplPath, templateThumb,
          templateCategory, templateKeywords, templateDescription,
          storageSiteId, headerHtml, menuHtml, footerHtml, cssText,
          JSON.stringify(pagesSnapshot),
        ],
      );
      console.log(`✓ Created new Template: ${tplId}`);
    }

    await client.query("COMMIT");

    console.log("\n─── Summary ───");
    console.log(`  · Owner:        ${owner.rows[0].email}`);
    console.log(`  · Template:     ${templateName} (private — '나의 템플릿' tab only)`);
    console.log(`  · Storage Site: ${storageSiteId} (shopId=${storageShopId})`);
    console.log(`  · Path:         ${tplPath}`);
    console.log(`  · Pages:        ${pages.length} (${pages.map((p) => p.slug).join(", ")})`);
    console.log(`  · Categories:   ${catRows.rows.length}`);
    console.log(`  · Posts:        ${postRows.rows.length}`);
    console.log(`  · Products:     ${prodCount}`);
    console.log(`  · headerHtml:   ${headerHtml.length} chars`);
    console.log(`  · footerHtml:   ${footerHtml.length} chars`);
    console.log(`  · cssText:      ${cssText.length} chars`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
