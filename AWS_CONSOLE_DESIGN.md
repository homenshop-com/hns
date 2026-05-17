# AWS Console (Cloudscape) Design Reference — for Claude Code

Reference distilled from Amazon's **Cloudscape Design System** (https://cloudscape.design),
the public design system behind AWS Console. Use this when adapting `.dv2-app`
(homeNshop dashboard) typography & density so Korean ops users get the same
"information-dense yet readable" feel as AWS Console.

This is a typography + density reference. The brand accent stays **Toss Blue**
(see DESIGN.md) — we do **not** adopt Cloudscape's orange/dark theme. Only the
**reading mechanics** (font stack, sizes, weights, line-height, density) are
mirrored.

---

## 1. Font Stack

Cloudscape uses **Amazon Ember** (proprietary) with a graceful fallback chain.
We can't ship Ember, but we mirror the **fallback chain + Korean priority**:

```css
font-family:
  "Open Sans",                            /* Cloudscape Ember-like */
  "Helvetica Neue",
  Roboto,
  Arial,
  "Pretendard Variable", Pretendard,      /* Korean primary */
  "Apple SD Gothic Neo",
  "Noto Sans KR",
  -apple-system, BlinkMacSystemFont,
  "Segoe UI", sans-serif;
font-feature-settings: "kern" 1, "calt" 1, "ss03";
text-rendering: optimizeLegibility;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

**Why:** Korean glyphs come from Pretendard (already in repo), Latin fallback
mirrors Cloudscape (Open Sans → system sans). `optimizeLegibility` enables
ligatures and kerning the way AWS does.

---

## 2. Type Scale (Cloudscape v3)

| Token | Use | Size | Line | Weight |
|---|---|---|---|---|
| `display-l-text` | Hero numbers (KPI big value) | 32px | 36px | 400 |
| `heading-xl-text` | H1 page title | 28px | 36px | 400 |
| `heading-l-text` | H2 section title | 24px | 30px | 400 |
| `heading-m-text` | H3 panel title | 18px | 22px | 700 |
| `heading-s-text` | H4 card title | 16px | 20px | 700 |
| `heading-xs-text` | H5 subtitle | 14px | 18px | 700 |
| `body-m-text` | **Body default** | **14px** | **20px** | 400 |
| `body-s-text` | Small body / labels | 12px | 16px | 400 |

**Key rule:** body default is **14px / line-height 1.43**. Never go below 12px
for any human-read text (badge counts and timestamps may dip to 11px in tight
table cells). Our current `.dv2-app` was 13.5px / 1.5 — bump to 14px and slightly
tighter line-height for AWS-like density.

---

## 3. Weight Discipline

AWS rarely uses 800-weight. Stick to:
- **400** — body, large headings (H1/H2 are 400, not bold)
- **500** — labels, small headings on subtle backgrounds
- **600** — meta labels, button text, callout chips
- **700** — H3/H4/H5 panel/card titles, big KPI values

Avoid 800/900 except for monogram avatars and brand mark. The current dashboard
overuses 800 on `.dv2-page-title` (24px 800) — Cloudscape would render this
as 28px 400 + tight letter-spacing.

---

## 4. Density Tokens

| Token | Value | Where |
|---|---|---|
| `--space-xs` | 4px | inline gaps |
| `--space-s` | 8px | tight stack |
| `--space-m` | 12px | default gap |
| `--space-l` | 16px | section gap |
| `--space-xl` | 24px | block padding |
| `--space-xxl` | 32px | section margin |
| Table row min-height | 36px (compact) / 44px (comfortable) | data tables |
| Form input height | 32px | text/select/button |
| Tab bar height | 40px | nav tabs |

AWS Console is more compact than typical SaaS — 36px row height vs Notion's 48px.
We match the **compact** mode for ops users (most homeNshop users are SME owners
who scan lots of orders/posts).

---

## 5. Color & Contrast

Cloudscape:
- Body text on white: **#16191f** (near-black)
- Secondary text: **#5f6b7a** (slate-600)
- Disabled / dim: **#879596**
- Border hairline: **#eaeded** (cool gray-100)
- Border strong: **#aab7b8** (cool gray-300)
- Panel background: **#ffffff**
- App background: **#fafafa**
- Status: blue **#0972d3** (info/link), green **#037f0c**, red **#d91515**, orange **#cc5f21**

Our Toss palette stays intact (`--ink-0..4`, `--accent` Toss Blue). The **contrast
ratios** are similar to AWS — no change needed there. The action is:
- Treat **#191f28** as the AWS-equivalent of `#16191f` (same readability)
- Match AWS's "near-black on white" weight by going 14px / 1.43 / 400 base

---

## 6. Iconography

AWS uses Cloudscape's own icon set (16/20px), all single-stroke ~1.5px. Our
project already standardized on **Font Awesome 6 Free** — keep that. AWS-like
sizing convention:
- Inline-with-text icon: **14px** (matches 14px body x-height)
- Standalone button icon: **16px**
- Section header icon: **18–20px**

Avoid Font Awesome's solid 14px filled icons inside dense tables — they read
"loud" vs AWS's airy line icons. Prefer `fa-regular` where available; in our
project that means using `fa-solid` only for *true* action emphasis (primary
button, brand mark).

---

## 7. Tables & Lists

AWS Console table conventions:
- 14px text in cells
- 12px column header (uppercase, weight 700, color `--ink-2`)
- 1px `--line` between rows, no zebra
- Hover state: subtle `#f7f8fa` row background
- Action column on the right, icon-button compact (height 24px in compact mode)
- Sort indicator: small caret right after header text

Our `.dv2-site-row` already follows this pattern. The improvements to align with
AWS:
- Column header: `font-size: 12px; text-transform: uppercase; letter-spacing: .04em;`
- Cell text: `font-size: 14px;`
- Action button: keep our current 32px height (Toss-influenced, taller than AWS)
  unless density forces 28px

---

## 8. Layout / Shell

AWS Console shell:
- Fixed top bar: 40px (dark navy `#232f3e` — we keep our white topbar)
- Left side nav: collapsible, 240px expanded / 60px collapsed
- Content max-width: **1280px** (not full-width on huge monitors)
- Section gutter: 24px

Our `.dv2-app` matches this almost exactly (240px sidebar, white topbar). Keep
as-is.

---

## 9. Application Checklist (this repo)

When updating `.dv2-app` styles to mirror AWS readability:

1. **Base typography**
   - [x] font-family: add Open Sans + extended Korean fallback
   - [x] font-size: 13.5px → **14px**
   - [x] line-height: 1.5 → **1.43**
   - [x] add `text-rendering: optimizeLegibility`

2. **Headings**
   - `.dv2-page-title`: 24px 800 → **28px 700** (less compressed letter-spacing)
   - `.dv2-panel-head h2`: keep 16px but weight 700
   - `.dv2-stat .lbl` (KPI label): 11.5px → **12px**
   - `.dv2-stat .val` (KPI big number): keep 28px, weight 700

3. **Body / table**
   - `.dv2-site-name`: 13.5px → **14px**
   - `.dv2-site-meta`: 11.5px → **12px** (don't go below)
   - `.dv2-since`, `.dv2-stat-mini`: 12px → **12.5px**
   - `.dv2-crumbs`: 12.5px → **13px**

4. **Buttons**
   - Primary/secondary stays at 12px in compact mode, 14px in standard
   - Min hit target 32px (already met)

5. **Code / numeric**
   - Keep "JetBrains Mono" for `.mono` & numeric — AWS uses Roboto Mono, ours is
     close enough

---

## 10. What we explicitly do NOT copy

- Cloudscape's orange accent → we stay Toss Blue `#3182f6`
- Dark top bar → we stay white topbar
- "Service header" with breadcrumb + tabs combo → our breadcrumb is enough
- Cloudscape's expandable rows → we use modal/drawer pattern
- AWS region/account switcher chrome → not applicable

---

## References

- Cloudscape Design System: https://cloudscape.design
- Type tokens: https://cloudscape.design/foundation/visual-foundation/typography/
- Density modes: https://cloudscape.design/foundation/visual-foundation/density/
- Color: https://cloudscape.design/foundation/visual-foundation/colors/
