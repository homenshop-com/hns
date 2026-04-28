import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "@/lib/credits";
import { freeSiteDefaults } from "@/lib/site-expiration";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.AI_GENERATE_MODEL || "claude-sonnet-4-6";
// Claude Sonnet 4.6 supports up to 64k output tokens. 20k was OK for the
// old flat-HTML design but the new Overlay/Flow section patterns emit many
// more inline position styles per atomic — tight sites (3 short pages)
// now land around 18-25k, richer sites (5 pages w/ feature grids + cards)
// can exceed 30k. Default 40k covers a comfortable majority; set
// AI_GENERATE_MAX_TOKENS higher if the site needs exceptional complexity.
const MAX_TOKENS = Number(process.env.AI_GENERATE_MAX_TOKENS) || 40000;

export const maxDuration = 180;

const SYSTEM_PROMPT = `You are a senior web designer. Return the finished site by invoking the create_site tool. No prose.

# Promotional materials (when the user attaches images / PDFs)
The user may attach flyers, brochures, menu cards, business cards, or
PDF marketing material along with the text prompt. Treat them as the
PRIMARY source of truth — extract and incorporate:
  - Brand / business name, slogan / tagline
  - Service or product names, with prices and durations (e.g., "60분 79,000원")
  - Phone numbers, address, email, business hours
  - Booking / reservation links (네이버 예약, KakaoTalk, etc.)
  - Photos / illustrations — describe them in alt text and choose
    /api/img keywords that match the visual style (warm portraits,
    minimalist product, etc.)
  - Visual style cues — color palette, typography mood (luxury / wellness /
    tech / friendly), photo treatment — translate into the design tokens
Verbatim preservation: prices, phone numbers, official names, addresses
must appear EXACTLY as on the source. Translate generic marketing prose
into the user's defaultLanguage when needed, but do not paraphrase
business-critical data.

If the user prompt is short or vague, lean entirely on the attachments
to determine site structure. Pages should organize the source content
naturally (e.g., a clinic flyer → home / services / pricing / booking
/ contact, a cafe menu → home / menu / about / location).

Build the homepage AROUND the attached content rather than producing
generic placeholders. The user uploaded these because they are the real
business artifacts — honor them.

# Hard structural rules (editor depends on these)
- Exactly one page has slug "index". Other slugs: lowercase alphanumeric only.
- bodyHtml is INNER HTML of <div id="hns_body"> — no wrapper.
- Wrap every section in <div class="dragable" id="obj_{unique}">…</div>, unique ids.
- **Sections** (obj_sec_*) are ALWAYS flow-positioned (no inline position, top, left). They stack vertically down the page like document blocks. Each section sets its own height via CSS (min-height or fixed height on hero).
- **Atomic children inside a section** CAN be either flow OR absolute-positioned (see § Section layout patterns below). Pick whichever produces the visually correct design — stacked prose uses flow, overlaid hero content uses absolute.
- When using absolute positioning on atomic children, put "position:absolute; left:Xpx; top:Ypx; width:Wpx; height:Hpx;" in an inline style attribute. The section MUST have "position:relative" (set via CSS class) so children position relative to the section, not the page.
- headerHtml/menuHtml/footerHtml include their outer <div id="hns_header|hns_menu|hns_footer"> wrapper.
- **Navigation goes INSIDE headerHtml only, wrapped in a <nav>…</nav> block** (modern single-row design: brand + <nav> + CTA).
- **menuHtml MUST be a bare wrapper: "<div id=\"hns_menu\"></div>" with NO <ul>, NO <li>, NO nav links inside.** The server renders the nav links from the header's <nav>; if you also put links in menuHtml you get a duplicate menu bar.
- menuHtml links would use <a href="/{slug}">Title</a> — home uses href="/" — but AGAIN: put these inside headerHtml's <nav>, NOT in menuHtml.
- Write ALL content in the user's defaultLanguage.

# Atomic layering (CRITICAL — the editor's LayerPanel depends on this)
The editor has a Photoshop-style LayerPanel that lets users select, hide,
rename, and edit each piece independently. For this to work, EVERY distinct
content unit inside a section MUST be its own .dragable element with a
unique id — NOT buried in a section's innerHTML as raw <h1>/<p>/<img>/<a>.

Exact patterns (use these verbatim — the scene parser keys on these classes):

  SECTION WRAPPER (flow layout, contains child atomics):
    <div class="dragable" id="obj_sec_{n}">…children…</div>

  TITLE (H1/H2/H3/H4) — use semantic heading level (h1 for hero, h2 for section titles):
    <div class="dragable sol-replacible-text" id="obj_title_{n}">
      <h2>섹션 제목</h2>
    </div>

  TEXT / PARAGRAPH:
    <div class="dragable sol-replacible-text" id="obj_text_{n}">
      <p>본문 텍스트…</p>
    </div>

  IMAGE (exactly one <img>, no other structural content):
    <div class="dragable" id="obj_img_{n}">
      <img src="https://homenshop.com/api/img?q=…&w=…&h=…" alt="설명" />
    </div>

  BUTTON / CTA:
    <div class="dragable" id="obj_btn_{n}">
      <a class="btn btn-primary" href="/slug">버튼 라벨</a>
    </div>

  TABLE:
    <div class="dragable" id="obj_table_{n}">
      <table>…</table>
    </div>

  LIST:
    <div class="dragable" id="obj_list_{n}">
      <ul>…</ul>
    </div>

  CARD / FEATURE TILE (group of sub-atomics — use class "de-group" so the
  LayerPanel renders it as a collapsible group):
    <div class="dragable de-group" id="obj_card_{n}">
      <div class="dragable" id="obj_cardimg_{n}">
        <img src="…" alt="…" />
      </div>
      <div class="dragable sol-replacible-text" id="obj_cardtitle_{n}">
        <h3>카드 제목</h3>
      </div>
      <div class="dragable sol-replacible-text" id="obj_cardtext_{n}">
        <p>카드 설명</p>
      </div>
    </div>

Rules:
- EVERY atomic unit is its own .dragable child. No unwrapped <h1>, <p>, <img>,
  <a class="btn">, <table>, <ul> directly inside a section — they MUST be
  wrapped in their own dragable. (Inline <strong>/<em>/<span> INSIDE a text
  block are fine; those aren't atomic units.)
- Text-containing dragables (titles AND paragraphs) MUST have class
  "sol-replacible-text" — the scene parser uses this to type them as "텍스트"
  in the LayerPanel. Without it they show as generic "박스".
- Groups MUST have class "de-group" (in addition to "dragable") so the
  LayerPanel renders an expand/collapse chevron.
- Every dragable id starts with "obj_" followed by a role hint + running
  number ("obj_title_1", "obj_img_3", "obj_card_2"). Ids must be unique
  across the entire site (use page-slug prefixes if needed).
- Don't over-nest. Max depth 3-4.

# Section layout patterns (USE THESE — do NOT stack atoms vertically by default)
Each section picks ONE of these three layouts (A / B / C). Never produce a
section where an image sits as the first sibling and title + text + CTA sit
below it in flow order — that's the "data dump" bug and produces ugly
vertical stacks. For image + content pairings use Pattern C (Split), not B.

## Pattern A — OVERLAY (hero, banner, CTA band, product showcase)
Section has a CSS background-image + gradient overlay. Atomic children are
ABSOLUTELY positioned over the background, creating a layered design.

<div class="dragable hero" id="obj_sec_hero" style="position:relative;">
  <!-- Decorative img dragable pinned to fill the section (editor can swap it) -->
  <div class="dragable" id="obj_img_herobg"
       style="position:absolute; left:0; top:0; width:100%; height:100%; z-index:0;">
    <img src="https://homenshop.com/api/img?q=cafe+interior+warm&w=1920&h=800"
         alt="매장 분위기"
         style="width:100%; height:100%; object-fit:cover;" />
  </div>
  <div class="dragable sol-replacible-text" id="obj_title_hero"
       style="position:absolute; left:80px; top:260px; width:620px; z-index:2;">
    <h1>책으로 가득 찬 따뜻한 공간</h1>
  </div>
  <div class="dragable sol-replacible-text" id="obj_text_hero"
       style="position:absolute; left:80px; top:380px; width:520px; z-index:2;">
    <p>놀숲 세종 보람점은 자연 채광이 풍부한 넓은 공간에 …</p>
  </div>
  <div class="dragable" id="obj_btn_hero"
       style="position:absolute; left:80px; top:500px; width:200px; height:52px; z-index:2;">
    <a class="btn btn-primary" href="/about">공간 더 알아보기</a>
  </div>
</div>

cssText for the section:
  .hero { position: relative; height: 680px; overflow: hidden; }
  .hero::after { content:""; position:absolute; inset:0; z-index:1;
    background: linear-gradient(180deg, rgba(0,0,0,.1), rgba(0,0,0,.55)); }
  .hero h1 { color: #fff; font-size: clamp(2.25rem,4vw,3.5rem); ... }
  .hero p { color: rgba(255,255,255,.9); ... }

Use overlay pattern for: hero, CTA band, testimonial w/ portrait, image+quote,
full-bleed banner. The section height is fixed (usually 500-800px on desktop).

## Pattern B — FLOW (prose sections, 3-col grids, FAQ lists, forms)
Atomic children flow top-to-bottom with padding, no absolute positioning on
children. Use CSS flex/grid on the section class to arrange.

<div class="dragable features" id="obj_sec_features">
  <div class="dragable sol-replacible-text" id="obj_title_feat">
    <h2>우리의 서비스</h2>
  </div>
  <div class="dragable de-group" id="obj_card_feat1">
    <div class="dragable" id="obj_cardimg_feat1"><img src="..." alt="..."/></div>
    <div class="dragable sol-replacible-text" id="obj_cardtitle_feat1"><h3>…</h3></div>
    <div class="dragable sol-replacible-text" id="obj_cardtext_feat1"><p>…</p></div>
  </div>
  <div class="dragable de-group" id="obj_card_feat2">…</div>
  <div class="dragable de-group" id="obj_card_feat3">…</div>
</div>

cssText:
  .features { padding: clamp(48px,8vw,120px) 24px; max-width: 1200px; margin: 0 auto; }
  .features > #obj_title_feat { text-align: center; margin-bottom: 48px; }
  .features > .de-group { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; }
  /* Tip: use :has() or give the 3-card wrapper its own class */

Use flow pattern for: 3-col feature grids, testimonial rows, FAQ list, contact
form, stats row, content-heavy prose **without** a large image.
**Do NOT use Flow when you have one big image + text content. Use Split (C) instead.**

## Pattern C — SPLIT (image + content side-by-side)
THE most common content section: one large image paired with a title +
paragraph + bullet list + CTA, arranged in a two-column grid.
**Never stack an image as the first child, then title + text + button as
siblings below it — that produces the ugly "data dump" vertical layout.
Always pair them as two grouped children of a grid-based section.**

<div class="dragable why-us" id="obj_sec_why">
  <div class="dragable" id="obj_img_why">
    <img src="https://homenshop.com/api/img?q=mechanic+portrait&w=900&h=600"
         alt="수석 정비사"
         style="width:100%; height:100%; object-fit:cover; border-radius:16px;" />
  </div>
  <div class="dragable de-group" id="obj_content_why">
    <div class="dragable sol-replacible-text" id="obj_title_why">
      <h2>왜 신흥 자동차를 선택해야 할까요?</h2>
    </div>
    <div class="dragable sol-replacible-text" id="obj_text_why">
      <p>20년 이상의 현장 경험을 바탕으로, 고객 차량을 내 차처럼 꼼꼼하게 살핍니다.</p>
    </div>
    <div class="dragable sol-replacible-text" id="obj_check_why1">
      <p><i class="fa-solid fa-circle-check"></i> 20년 경력 국가공인 정비사</p>
    </div>
    <div class="dragable sol-replacible-text" id="obj_check_why2">
      <p><i class="fa-solid fa-circle-check"></i> 사전 견적 제공, 추가 비용 없음</p>
    </div>
    <div class="dragable sol-replacible-text" id="obj_check_why3">
      <p><i class="fa-solid fa-circle-check"></i> 정품 부품만 사용, 품질 보증</p>
    </div>
    <div class="dragable" id="obj_btn_why">
      <a class="btn btn-primary" href="/services">자세히 알아보기</a>
    </div>
  </div>
</div>

cssText:
  .why-us {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(32px, 5vw, 64px);
    align-items: center;
    padding: clamp(64px, 10vw, 120px) 24px;
    max-width: 1200px;
    margin: 0 auto;
  }
  .why-us > #obj_img_why { aspect-ratio: 3/2; }
  .why-us > #obj_img_why img { width:100%; height:100%; object-fit:cover; border-radius:16px; }
  .why-us #obj_check_why1 i, .why-us #obj_check_why2 i, .why-us #obj_check_why3 i {
    color: var(--color-primary); margin-right: 8px;
  }
  /* Reverse column order for visual variety on alternating sections */
  .why-us.image-right { direction: rtl; } .why-us.image-right > * { direction: ltr; }
  @media (max-width: 768px) { .why-us { grid-template-columns: 1fr; } }

Use split pattern for: "why us" blocks, feature-detail sections, about-us
with portrait, product-showcase pairs, service description blocks. Alternate
left/right via a ".image-right" class every other split section on the page.

## Picking a pattern — DECISION MATRIX (follow strictly)
| Content shape | Pattern |
|---|---|
| Large full-bleed image + 1-2 lines text + CTA | **A (Overlay)** |
| 1 image + title + paragraph + bullets/checks + CTA | **C (Split)** ← very common |
| 3+ equivalent cards in a row (features, team, stats) | **B (Flow grid)** |
| Pure text (about copy, terms, FAQ list) | **B (Flow stack)** |
| Alternating image-text rows (zigzag) | **C (Split)**, alternate .image-right |

**Hard rule — never flat-stack an image dragable next to text dragables
as siblings of a flow section. That's the "data dump" bug. Group them:
either overlay (A) or split (C).**

Typical home page skeleton:
  [A hero] → [C "about / why us"] → [B 3-col features] → [C "process / how it works"]
  → [B stats or testimonials row] → [A CTA band]

# Editor friendliness (the user will tweak typography after generation)
- Put typography color/size/family rules on the dragable WRAPPER's class,
  NOT on inner heading tags. The Inspector lets users change "글자색"
  and "글자크기" on a text dragable; if the color rule lives on
  ".hero h1 { color: #fff }" it beats the user's inline change. Prefer
  ".hero .obj-title { color: #fff }" (or pull color via "var(--text-on-hero)")
  so the Inspector edit applies cleanly via inheritance.
- For dark hero overlays where the heading must stay white, that's still
  a wrapper concern — color the wrapper, not the h1: e.g.
    .hero #obj_title_hero { color: #fff; }
  (Targeting the dragable's id is fine — the editor never strips inline
  styles from the wrapper itself.)
- Avoid "color: white !important" etc. — leaves nothing for the user to
  override.

# Design quality bar (follow these — quality is what matters)
- **Design tokens** at :root — color-primary/accent/bg/surface/text/muted/border, font-heading/body, radius-sm/md/lg, shadow-sm/md/lg, space scale (8pt rhythm), container 1200px.
- **Palette** fits the brand mood: cafe→warm neutrals+terracotta+deep green; tech→indigo+near-black; wellness→sage+cream; luxury→black+gold+ivory; medical→deep blue+white.
- **Typography**: @import Google Fonts at top of cssText. Type scale using clamp(): h1 clamp(2.25rem,4vw,3.5rem), h2 clamp(1.75rem,3vw,2.5rem). line-height 1.15 headings / 1.65 body.
  **CRITICAL — defaultLanguage drives font selection:**
    - **Korean (ko)**: REQUIRED first font for headings & body must be a CJK-supporting Korean font. Use Noto Serif KR or Gowun Batang for serif designs (luxury/editorial/organic), Pretendard or Noto Sans KR for sans designs (minimal/colorful). Place Korean font FIRST in the font-family stack, then optional Latin display fallback. Example: \`--font-heading: 'Noto Serif KR', 'Cormorant Garamond', serif;\` NOT the reverse — Korean glyphs in Latin display fonts fall back to system default and look broken.
    - **Korean weight rules**: Korean serif glyphs are visually denser than Latin — weight 300-400 looks unrefined and unreadable on dark backgrounds. For Korean headings use weight 600-700 (NEVER 300-400, even in luxury/minimal styles). For Korean body use weight 400-500. Import the heavier weights explicitly (e.g., \`Noto+Serif+KR:wght@400;500;600;700;900\`).
    - **Japanese (ja)**: First font Noto Serif JP / Noto Sans JP / Shippori Mincho. Same weight rules as Korean.
    - **Chinese (zh-cn / zh-tw)**: First font Noto Serif SC/TC / Noto Sans SC/TC / ZCOOL XiaoWei. Same weight rules.
    - **Latin only (en/es)**: Heading Playfair/Fraunces/Space Grotesk/Cormorant. Body Inter/Lato/Noto Sans. Original weight rules apply (300-500 OK).
    - **Letter-spacing**: −0.02em headings is fine for Latin. For Korean/Japanese/Chinese headings use letter-spacing 0 to −0.005em — tight Latin tracking distorts CJK glyphs. uppercase + wide letter-spacing on CJK eyebrow text is fine since it only affects the Latin label part.
- **Home page MUST have**: (1) Hero w/ bg image + overlay + large heading + CTA (2) 3-col feature grid (3) image+text content section (4) testimonial or stats (5) final CTA band. Other pages: 3-4 varied sections each.
- **Layout**: CSS Grid + Flexbox. Section vertical rhythm padding-block: clamp(48px,8vw,120px).
- **Polish**: Buttons padding 14px 28px, radius md, hover translateY(-2px)+shadow. Cards radius-lg+shadow-sm+padding 32px, hover lift. Images radius-md, object-fit:cover, aspect-ratio enforced. Hero bg w/ linear-gradient overlay.
- **Icons** — USE FONT AWESOME 6, never emoji, never inline SVG.
    Font Awesome 6 Free is loaded globally; reference icons with simple <i> tags:
      <i class="fa-solid fa-bullseye"></i>   (solid style, most icons)
      <i class="fa-regular fa-star"></i>     (regular/outline style)
      <i class="fa-brands fa-instagram"></i> (brand logos)
    Put each icon inside a circular tinted badge (e.g. .icon-badge) so it pairs
    with the card color palette. Size the <i> with font-size (22-28px typical);
    set color via CSS on the parent, not inline.
    Common pairings: cafe → fa-mug-hot, shop → fa-bag-shopping, delivery →
    fa-truck, contact → fa-phone / fa-envelope / fa-location-dot, time →
    fa-clock, services → fa-star / fa-gear / fa-chart-line, people → fa-users,
    award → fa-award, feature → fa-check, search → fa-magnifying-glass,
    globe → fa-earth-asia, settings → fa-sliders. Brands: instagram, facebook,
    youtube, tiktok, x-twitter, kakao (fa-comment as fallback).
    NEVER include emoji characters (🎨📱🌐 etc.) in ANY text, attribute, or
    CSS content — the site looks inconsistent when emojis mix with FA icons.
- **Imagery**: https://homenshop.com/api/img?q={english-keywords}&w={w}&h={h} — semantic image search (Pexels-backed). ALWAYS use the absolute https://homenshop.com prefix (relative /api/img breaks on custom domains).
    q MUST be English keywords describing the image content. Translate Korean/other languages first.
    Examples: cafe interior → q=cafe+interior · ocean sunset → q=ocean+sunset · team meeting → q=team+meeting · happy family → q=happy+family
    Use 1-3 specific words, lowercase, joined with "+". NEVER use picsum.photos or other random placeholders.
    Hero 1920×1080, cards 600×400, team portraits 400×400. Use orientation-appropriate dimensions.
    **Ethnicity / locale matching for people imagery (CRITICAL):**
      - When defaultLanguage is **ko (Korean)**: any image showing PEOPLE (portraits, customers, staff, family, lifestyle, hands, faces) MUST include the keyword \`korean\` to ensure Korean-looking subjects. Examples:
          team meeting → q=korean+team+meeting · happy family → q=korean+family · woman portrait → q=korean+woman+portrait · hands typing → q=korean+hands+laptop · customer smiling → q=korean+customer+smile · therapist → q=korean+esthetician
      - When defaultLanguage is **ja (Japanese)**: prepend \`japanese\` for people images. e.g. q=japanese+businessman+meeting
      - When defaultLanguage is **zh-cn / zh-tw (Chinese)**: prepend \`chinese\` for people images.
      - When defaultLanguage is **en / es** (Latin): no ethnicity prefix needed — Pexels defaults are diverse.
      - The ethnicity keyword is for PEOPLE only. Generic objects/scenes (cafe interior, ocean sunset, food, products, buildings) do not need it.
      - Why: Korean/Japanese/Chinese SMEs need locally-relatable customer faces. Default Pexels results lean Western, which feels off-brand for an Asian-language site.
- **Header**: brand + inline nav, sticky w/ shadow + backdrop-filter. Menu underline-on-hover via pseudo-element.
    EDITOR-FRIENDLY HEADER MARKUP (REQUIRED — the design editor's "헤더 편집" modal looks for these):
    - Wrap the brand area with id="hns_h_logo" OR class="logo" so the logo-replace flow (canvas ↻ button + modal upload)
      can find it. Example: <a id="hns_h_logo" href="/"><img src="..." alt="브랜드" /></a>
      For text-only brands: <a id="hns_h_logo" href="/"><span class="brand-mark">H</span><span class="brand-name">홈샵</span></a>
    - Put navigation in <nav> directly inside <header>. Each <a href="/{slug}">{label}</a> at top level.
      The MenuManagerModal regenerates these links from Pages metadata; keep the first <a>'s class
      (and any <span class="num">01</span> pattern) consistent so syncHeaderNavToMenu can clone it.
- **Footer**: 4 columns (About/Links/Contact/Social), dark bg, light text, small copyright row.
    EDITOR-FRIENDLY FOOTER MARKUP (the design editor's "푸터 편집" modal auto-extracts these):
    - Use <img> for any brand logo / social icons / certification marks (NOT background-image — the modal lists imgs).
    - Use <a href="..."> for every link (sitemap, social, legal). Modal lists each <a> with editable label/href/target.
    - Use <span> / <p> for text content (copyright, taglines, address). TreeWalker extracts visible text nodes.
    - Wrap social icons inside their <a> as <a href="https://..." target="_blank"><img src="..." alt="..." /></a>
      so label-edit preserves the icon (modal replaces only the first text node).
- **Responsive**: @media (max-width:768px) stack menu, collapse grids to 1 col, touch targets ≥44px.
- **A11y**: WCAG AA contrast, alt on every img, focus outlines 2px var(--color-primary).

# Size budget (stay within limits)
- cssText ~5-7KB; each bodyHtml ~2-3.5KB; total ≤28KB.
- Prefer reusable CSS classes over repeated rules. 3-5 pages, not more.

# Forbidden
- Lorem ipsum; emoji as icons; bare div soup (use semantic section/article/nav/header/footer); inline style attributes (except where truly required).
- Always invoke create_site — never respond with prose.`;

const SHOP_ID_REGEX = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/;

type DesignStyle =
  | "auto"
  | "minimal"
  | "editorial"
  | "organic"
  | "luxury"
  | "colorful";

const DESIGN_STYLE_DIRECTIVES: Record<Exclude<DesignStyle, "auto">, string> = {
  minimal: `
# Selected design style: MINIMAL MODERN
Commit to refined minimalism. The user picked this — execute it boldly, do not blend it with other styles.
- Palette: near-monochromatic. White / off-white background (#fafafa or #ffffff), deep ink text (#0f172a or #111111), one restrained accent (slate-blue, charcoal, or sage). NO gradients on hero, NO multiple bright colors.
- Typography: clean geometric sans only.
    - **Korean (ko)**: Pretendard or Noto Sans KR (weights 400;500;700;900). Heading 700, body 400-500. font-heading stack starts with the Korean font.
    - **Japanese (ja)**: Noto Sans JP first.
    - **Chinese (zh-cn/zh-tw)**: Noto Sans SC/TC first.
    - **Latin (en/es)**: @import Inter, Space Grotesk, or Manrope. Heading 600-700, tight tracking (-0.025em).
    - Body line-height 1.65. Generous type scale jumps.
- Layout: massive whitespace. Section padding-block clamp(80px, 12vw, 160px). 1100-1200px container. Single-column hero with text-only or image+text split. NO 3-card decorative grid unless content demands it.
- Polish: subtle 1px hairlines (border-color #e5e7eb), no shadows or very faint shadow-sm only. Buttons: outlined or solid black, sharp 4px radius. Images: minimal radius (4-8px), grayscale-leaning palette.
- Hero pattern preference: Pattern A overlay with VERY subtle dark gradient, large heading + one-line subhead + single CTA. No card stacks.
`.trim(),
  editorial: `
# Selected design style: EDITORIAL MAGAZINE
Commit to a magazine / newspaper aesthetic. Bold display headings dominate the page.
- Palette: monochrome black + white + cream (#fffaf0). One accent color used sparingly (rich red #c8102e, deep navy, or burnt orange).
- Typography: bold display headings.
    - **Korean (ko)**: Noto Serif KR (weights 600;700;900) FIRST in font-heading. Heading weight 700-900 (large display sizes need heavy strokes). Italic does NOT exist in Korean fonts — use weight contrast or color accent for emphasis instead.
    - **Japanese (ja)** / **Chinese (zh-cn/zh-tw)**: Noto Serif JP / Noto Serif SC/TC first, weights 700-900 for headings.
    - **Latin (en/es)**: @import "Fraunces" or "Playfair Display" or "DM Serif Display". Hero h1 clamp(3rem, 6vw, 5rem), italic for emphasis OK. Body: serif (Source Serif 4, Lora) or pairing sans (Inter).
- Layout: asymmetric magazine grids. Large pull quotes, oversized first-letter drop caps allowed, byline-style metadata under titles. Use CSS columns or asymmetric 2/3 + 1/3 splits, not equal 3-col grids.
- Polish: thin top/bottom rules (1px solid #111) framing sections. Captions in tiny uppercase (font-size 11px, letter-spacing 0.15em). Black & white photography preferred — desaturate via filter: grayscale(15%) on hero images.
- Hero pattern preference: Pattern A with massive serif headline, no image overlay tint, very high contrast.
`.trim(),
  organic: `
# Selected design style: WARM & ORGANIC
Commit to a warm, natural, friendly aesthetic. Rounded, hand-crafted feel.
- Palette: earth + cream tones. Background cream/oat (#faf6ee or #f5ede1), deep moss/sage primary (#5b6f4a or #6b8e4e), terracotta/clay accent (#c97558 or #d97757), warm brown text (#3d2f24).
- Typography: friendly serif for headings.
    - **Korean (ko)**: Gowun Batang or Nanum Myeongjo (warm Korean serifs) FIRST. Heading weight 700, body weight 400-500. Body line-height 1.85 for breathing room.
    - **Japanese (ja)**: Shippori Mincho or Noto Serif JP first.
    - **Chinese (zh-cn/zh-tw)**: Noto Serif SC/TC first.
    - **Latin (en/es)**: @import "Fraunces" (loose tracking) or "Source Serif 4". Body humanist sans (Nunito, Plus Jakarta Sans). Body line-height 1.75.
- Layout: rounded corners everywhere (radius-md 16px, radius-lg 24px). Curved section dividers via SVG wave or border-radius on sections. Imagery shows natural textures (linen, wood, foliage, hands).
- Polish: soft cream-colored cards on cream background, no harsh shadows — warm-tinted shadow-sm: 0 4px 16px rgba(120, 80, 40, 0.08). Buttons radius-full (pill-shaped), terracotta primary with subtle hover scale.
- Hero pattern preference: Pattern C (split) with portrait-style image and warm overlay; OR Pattern A with cream gradient, dark moss heading.
`.trim(),
  luxury: `
# Selected design style: LUXURY PREMIUM
Commit to refined luxury. Black + gold + ivory. Restraint signals quality.
- Palette: ivory background (#f8f5f0) or deep black (#0a0a0a) with high contrast. Antique gold accent (#c9a961 or #b8945f), never bright yellow. Charcoal text (#1a1a1a) on light, ivory text on dark.
- Typography: classical serif for headings.
    - **Korean (ko)**: \`@import Noto+Serif+KR:wght@400;500;600;700;900&Gowun+Batang:wght@400;700&Cormorant+Garamond:wght@400;500;600\`. font-heading stack: \`'Noto Serif KR', 'Gowun Batang', 'Cormorant Garamond', serif\`. Heading weight 600-700 (Korean serif at 400 looks broken). Body weight 400-500.
    - **Japanese (ja)**: Noto Serif JP first (weights 400;500;700). Heading 600-700, body 400-500.
    - **Chinese (zh-cn/zh-tw)**: Noto Serif SC/TC first. Heading 600-700, body 400-500.
    - **Latin only (en/es)**: Cormorant Garamond / Playfair Display first. Heading weight 400-500, body 300-400 (classical luxury restraint OK for Latin glyphs).
    - Subtitles: uppercase tracking 0.1em (Latin only — never uppercase Korean/CJK headlines).
- Layout: centered, symmetric, generous space. Section padding-block clamp(96px, 14vw, 180px). Thin gold hairlines (1px solid #c9a961) as section dividers. 1180px container.
- Polish: gold-accent buttons (1px solid #c9a961, transparent bg, gold text → fills on hover). Cards: ivory bg with thin gold border, no rounded corners or radius-sm only (4px). Imagery: muted, high-contrast B&W or warm-toned product shots.
- Contrast: ivory headings on dark MUST use solid color (#f8f5f0 or #f0e9d8), never opacity/rgba below 1.0. Gold accent for ornaments only — DO NOT make body text gold.
- Hero pattern preference: Pattern A overlay with dark image + ivory headline (weight 600+ for Korean) + thin gold underline + minimal CTA.
`.trim(),
  colorful: `
# Selected design style: VIBRANT COLORFUL
Commit to playful, energetic, vibrant. Saturated colors and bold gradients.
- Palette: vivid primary + secondary + tertiary. Examples: hot-pink #ec4899 + cobalt #2563eb + sun-yellow #facc15, OR coral #f97316 + teal #14b8a6 + plum #a855f7. Background can be off-white or pastel-tinted (#fef9c3, #fce7f3).
- Typography: friendly geometric sans.
    - **Korean (ko)**: Pretendard or Noto Sans KR (weights 500;700;900) FIRST. Heading 800-900, body 500.
    - **Japanese (ja)**: Noto Sans JP first.
    - **Chinese (zh-cn/zh-tw)**: Noto Sans SC/TC first.
    - **Latin (en/es)**: @import "Plus Jakarta Sans", "DM Sans", or "Outfit". Heading 800, body Inter/DM Sans 500.
    - Letter-spacing -0.02em headings (Latin only — keep CJK headings at 0 to -0.005em).
- Layout: bold gradient backgrounds on hero & CTA bands (linear-gradient 135deg, primary → secondary). Rounded corners radius-lg 24px on cards/images. Playful shapes — blob SVGs in corners, oversized circular accents.
- Polish: punchy buttons in solid bright colors, radius-full, bold hover scale 1.04. Cards: soft pastel bg with bright accent border or shadow tinted with color (e.g., shadow: 0 12px 32px rgba(236, 72, 153, 0.18)). Imagery: bright candid lifestyle shots, smiling people, vivid scenes.
- Hero pattern preference: Pattern A overlay with full-bleed gradient + white headline + bright CTA; OR Pattern C split with playful illustration on one side.
`.trim(),
};

function isDesignStyle(v: unknown): v is DesignStyle {
  return (
    v === "auto" ||
    v === "minimal" ||
    v === "editorial" ||
    v === "organic" ||
    v === "luxury" ||
    v === "colorful"
  );
}

interface AIPage {
  title: string;
  slug: string;
  showInMenu?: boolean;
  bodyHtml: string;
}

interface AIResponse {
  siteName?: string;
  cssText?: string;
  headerHtml?: string;
  menuHtml?: string;
  footerHtml?: string;
  pages?: AIPage[];
  error?: string;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI 기능이 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  // Two ingestion paths:
  //   - JSON: legacy text-only flow
  //   - multipart/form-data: text + attached promotional materials
  //     (flyers / brochures / PDFs) → Claude Vision sees them too.
  const contentType = request.headers.get("content-type") || "";
  const isMultipart = contentType.startsWith("multipart/form-data");

  let shopId = "";
  let defaultLanguage = "ko";
  let siteTitle = "";
  let prompt = "";
  let designStyle: DesignStyle = "auto";
  type Attachment = { mediaType: string; data: string; name: string };
  const attachments: Attachment[] = [];
  // Anthropic API caps: ~5MB per image, ~32MB per document, max ~20
  // images per request. We enforce conservatively.
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_FILES = 5;
  const ALLOWED_IMG = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  const ALLOWED_DOC = new Set(["application/pdf"]);

  if (isMultipart) {
    const fd = await request.formData();
    shopId = ((fd.get("shopId") as string) ?? "").trim().toLowerCase();
    defaultLanguage = ((fd.get("defaultLanguage") as string) ?? "ko").toString();
    siteTitle = ((fd.get("siteTitle") as string) ?? "").trim();
    prompt = ((fd.get("prompt") as string) ?? "").trim();
    const ds = (fd.get("designStyle") as string) ?? "";
    if (isDesignStyle(ds)) designStyle = ds;
    const fileEntries = fd.getAll("attachments");
    for (const entry of fileEntries) {
      if (!(entry instanceof File)) continue;
      if (attachments.length >= MAX_FILES) break;
      if (entry.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `파일 크기 초과: ${entry.name} (최대 10MB)` },
          { status: 400 },
        );
      }
      const mt = (entry.type || "").toLowerCase();
      if (!ALLOWED_IMG.has(mt) && !ALLOWED_DOC.has(mt)) {
        return NextResponse.json(
          { error: `허용되지 않는 파일 형식: ${entry.name}` },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await entry.arrayBuffer());
      attachments.push({
        mediaType: mt,
        data: buf.toString("base64"),
        name: entry.name,
      });
    }
  } else {
    const body = await request.json();
    shopId = (body.shopId || "").toString().trim().toLowerCase();
    defaultLanguage = (body.defaultLanguage || "ko").toString();
    siteTitle = (body.siteTitle || "").toString().trim();
    prompt = (body.prompt || "").toString().trim();
    if (isDesignStyle(body.designStyle)) designStyle = body.designStyle;
  }

  if (!shopId) {
    return NextResponse.json({ error: "shopId is required" }, { status: 400 });
  }
  if (!SHOP_ID_REGEX.test(shopId)) {
    return NextResponse.json({ error: "shopId format invalid" }, { status: 400 });
  }
  if (!siteTitle) {
    return NextResponse.json({ error: "siteTitle is required" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  // Per-user site limit — exclude hidden template-storage sites
  const siteCount = await prisma.site.count({
    where: { userId: session.user.id, isTemplateStorage: false },
  });
  if (siteCount >= 5) {
    return NextResponse.json(
      { error: "Maximum sites reached" },
      { status: 409 }
    );
  }

  const existing = await prisma.site.findUnique({ where: { shopId } });
  if (existing) {
    return NextResponse.json(
      { error: "shopId already taken" },
      { status: 409 }
    );
  }

  // ─── Credit check & consumption ───────────────────────────────────────────
  // Consume up-front. Refund on any failure path that isn't the user's fault.
  try {
    await consumeCredits(session.user.id, {
      kind: "AI_SITE_CREATE",
      amount: CREDIT_COSTS.AI_SITE_CREATE,
      aiModel: CLAUDE_MODEL,
      description: `AI 사이트 생성 (${shopId})`,
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        {
          error: `크레딧이 부족합니다. (필요: ${err.required} C, 잔액: ${err.balance} C)`,
          code: "INSUFFICIENT_CREDITS",
          balance: err.balance,
          required: err.required,
        },
        { status: 402 }
      );
    }
    console.error("[credits] consume failed:", err);
    return NextResponse.json({ error: "크레딧 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
  const refundOnError = (reason: string) => {
    refundCredits(session.user.id, CREDIT_COSTS.AI_SITE_CREATE, { reason })
      .catch((e) => console.error("[credits] refund failed:", e));
  };

  const attachNote =
    attachments.length > 0
      ? [
          "",
          `Attached promotional materials (${attachments.length}): ${attachments.map((a) => a.name).join(", ")}`,
          "Extract and use the brand name, services, prices, contact info, address, business hours,",
          "booking links and visual cues from the attached images / PDFs as the source of truth.",
          "Preserve verbatim domain-specific content (prices, phone numbers, official names, addresses).",
          "Translate generic copy into the user's defaultLanguage.",
          "If the user prompt is short or generic, rely heavily on the attachments.",
        ].join("\n")
      : "";

  const styleDirective =
    designStyle !== "auto" ? `\n${DESIGN_STYLE_DIRECTIVES[designStyle]}\n` : "";

  const userMessageText = [
    `defaultLanguage: ${defaultLanguage}`,
    `shopId: ${shopId}`,
    `siteTitle: ${siteTitle}`,
    `designStyle: ${designStyle}`,
    styleDirective,
    attachNote,
    "",
    "User prompt:",
    prompt,
    "",
    "Output the JSON object now.",
  ].join("\n");

  // Build the user message as a content array — text first, then any
  // image/document blocks. Anthropic API spec:
  //   { type: "image",    source: { type: "base64", media_type, data } }
  //   { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
  type ContentBlock =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      }
    | {
        type: "document";
        source: { type: "base64"; media_type: "application/pdf"; data: string };
      };

  const userContent: ContentBlock[] = [{ type: "text", text: userMessageText }];
  for (const a of attachments) {
    if (ALLOWED_IMG.has(a.mediaType)) {
      userContent.push({
        type: "image",
        source: { type: "base64", media_type: a.mediaType, data: a.data },
      });
    } else if (a.mediaType === "application/pdf") {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: a.data },
      });
    }
  }

  console.log("[create-from-ai] start", {
    shopId,
    defaultLanguage,
    designStyle,
    titleLen: siteTitle.length,
    promptLen: prompt.length,
    model: CLAUDE_MODEL,
    maxTokens: MAX_TOKENS,
  });
  const t0 = Date.now();

  let aiResult: AIResponse | null = null;
  let lastError = "";
  let lastStopReason: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          tools: [
            {
              name: "create_site",
              description:
                "Submit the finished homepage as structured data. Use this tool to return your generated site.",
              input_schema: {
                type: "object",
                required: [
                  "siteName",
                  "cssText",
                  "headerHtml",
                  "menuHtml",
                  "footerHtml",
                  "pages",
                ],
                properties: {
                  siteName: { type: "string" },
                  cssText: { type: "string" },
                  headerHtml: { type: "string" },
                  menuHtml: { type: "string" },
                  footerHtml: { type: "string" },
                  pages: {
                    type: "array",
                    minItems: 3,
                    maxItems: 6,
                    items: {
                      type: "object",
                      required: ["title", "slug", "bodyHtml"],
                      properties: {
                        title: { type: "string" },
                        slug: { type: "string" },
                        showInMenu: { type: "boolean" },
                        bodyHtml: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          ],
          tool_choice: { type: "tool", name: "create_site" },
          messages: [{ role: "user", content: userContent }],
        }),
      });

      if (response.status === 529) {
        lastError = "AI 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.";
        continue;
      }
      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic API error", response.status, errText);
        lastError = "AI 처리 중 오류가 발생했습니다.";
        break;
      }

      const data = await response.json();
      const stopReason: string | undefined = data.stop_reason;
      lastStopReason = stopReason;
      const toolBlock = Array.isArray(data.content)
        ? data.content.find(
            (c: { type?: string; name?: string }) =>
              c?.type === "tool_use" && c?.name === "create_site"
          )
        : null;
      if (!toolBlock) {
        console.error("No create_site tool_use in response", {
          stopReason,
          content: data.content,
        });
        lastError =
          stopReason === "max_tokens"
            ? "AI가 디자인을 생성하는 중에 길이 제한에 도달했습니다. 다시 시도해주세요. (계속 실패하면 '더 단순한 디자인으로' 등 짧은 지시를 추가해보세요)"
            : "AI가 올바른 형식으로 응답하지 않았습니다. 다시 시도해주세요.";
        continue;
      }
      aiResult = (toolBlock as { input: AIResponse }).input;
      break;
    } catch (err) {
      console.error("AI generate error", err);
      lastError = "AI 응답을 처리할 수 없습니다.";
    }
  }

  if (!aiResult) {
    refundOnError("AI generation failed");
    return NextResponse.json(
      { error: lastError || "AI 처리 실패" },
      { status: 502 }
    );
  }

  // Validate & sanitize AI response
  const pages = Array.isArray(aiResult.pages) ? aiResult.pages : [];
  if (pages.length === 0) {
    console.error("[create-from-ai] empty pages", {
      stopReason: lastStopReason,
      aiResultKeys: Object.keys(aiResult || {}),
      elapsedMs: Date.now() - t0,
      maxTokens: MAX_TOKENS,
    });
    const msg =
      lastStopReason === "max_tokens"
        ? "AI가 디자인을 생성하는 중에 길이 제한에 도달했습니다. 다시 시도해주세요. (계속 실패하면 '더 단순한 디자인으로' 등 짧은 지시를 추가해보세요)"
        : "AI가 페이지를 생성하지 못했습니다. 다시 시도해주세요.";
    refundOnError("AI returned empty pages");
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Ensure one page has slug "index"
  const hasIndex = pages.some((p) => p?.slug === "index");
  if (!hasIndex && pages[0]) {
    pages[0].slug = "index";
  }

  // Normalize slugs and dedupe
  const seen = new Set<string>();
  const cleanPages: AIPage[] = [];
  for (const p of pages) {
    if (!p || typeof p.bodyHtml !== "string" || !p.title) continue;
    let slug = (p.slug || "")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "page";
    if (seen.has(slug)) {
      let i = 2;
      while (seen.has(`${slug}${i}`)) i++;
      slug = `${slug}${i}`;
    }
    seen.add(slug);
    cleanPages.push({
      title: String(p.title).slice(0, 200),
      slug,
      showInMenu: p.showInMenu !== false,
      bodyHtml: p.bodyHtml,
    });
  }
  if (!cleanPages.some((p) => p.slug === "index")) {
    cleanPages[0].slug = "index";
  }

  const pageData = cleanPages.map((p, index) => ({
    title: p.title,
    slug: p.slug,
    lang: defaultLanguage,
    isHome: p.slug === "index",
    showInMenu: p.showInMenu !== false,
    sortOrder: index,
    content: { html: p.bodyHtml },
  }));

  console.log("[create-from-ai] AI ok", {
    pageCount: pageData.length,
    elapsedMs: Date.now() - t0,
    stopReason: lastStopReason,
    cssKB: Math.round((aiResult.cssText || "").length / 1024),
  });

  try {
    // Stamp the cssText with the modern-template marker so the editor
    // treats the AI-generated site as responsive (atomic-flow inserts,
    // hidden mobile/desktop toggle, etc.). Without it, AI sites end up
    // in legacy "fix" mode where new objects drop with absolute coords
    // — which breaks the AI's flex/grid section CSS.
    const MODERN_MARKER = "/* HNS-MODERN-TEMPLATE */";
    let stampedCss = (aiResult.cssText || "").trim();
    if (stampedCss && !stampedCss.includes(MODERN_MARKER)) {
      stampedCss = `${MODERN_MARKER}\n${stampedCss}`;
    } else if (!stampedCss) {
      stampedCss = MODERN_MARKER;
    }

    const site = await prisma.site.create({
      data: {
        userId: session.user.id,
        shopId,
        name: (aiResult.siteName || siteTitle).toString().slice(0, 200),
        defaultLanguage,
        languages: [defaultLanguage],
        templateId: null,
        templatePath: null,
        headerHtml: aiResult.headerHtml || null,
        menuHtml: aiResult.menuHtml || null,
        footerHtml: aiResult.footerHtml || null,
        cssText: stampedCss,
        ...freeSiteDefaults(),
        pages: { create: pageData },
      },
      include: {
        pages: { orderBy: { sortOrder: "asc" } },
      },
    });

    return NextResponse.json({ site });
  } catch (err) {
    // DB write failed after AI succeeded — refund so user isn't charged for a site they didn't get.
    console.error("[create-from-ai] site.create failed:", err);
    refundOnError("Site DB write failed");
    return NextResponse.json(
      { error: "사이트 저장 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
