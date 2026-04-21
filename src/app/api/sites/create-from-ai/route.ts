import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  consumeCredits,
  refundCredits,
  CREDIT_COSTS,
  InsufficientCreditsError,
} from "@/lib/credits";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const CLAUDE_MODEL = process.env.AI_GENERATE_MODEL || "claude-sonnet-4-6";
const MAX_TOKENS = Number(process.env.AI_GENERATE_MAX_TOKENS) || 20000;

export const maxDuration = 180;

const SYSTEM_PROMPT = `You are a senior web designer. Return the finished site by invoking the create_site tool. No prose.

# Hard structural rules (editor depends on these)
- Exactly one page has slug "index". Other slugs: lowercase alphanumeric only.
- bodyHtml is INNER HTML of <div id="hns_body"> — no wrapper.
- Wrap every section in <div class="dragable" id="obj_{unique}">…</div>, unique ids.
- Flow layout only inside dragables (no position:absolute).
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
- Flow layout ONLY. No inline position:absolute, no top/left. Use normal
  block/flex/grid layout in CSS classes.
- Don't over-nest. A hero section is fine as: section > 4 leaves (bg img,
  title, subtitle, CTA). A 3-col feature grid is: section > 3 card groups >
  3 leaves each. Avoid 5-level deep wrappers.
- Section background image: apply via CSS on the section's class (e.g.
  ".hero { background: url(https://homenshop.com/api/img?q=…) center/cover; }")
  — do NOT create a separate absolutely-positioned <img> child. Backgrounds
  are stylistic (CSS), content images are atomic (dragable children).

# Design quality bar (follow these — quality is what matters)
- **Design tokens** at :root — color-primary/accent/bg/surface/text/muted/border, font-heading/body, radius-sm/md/lg, shadow-sm/md/lg, space scale (8pt rhythm), container 1200px.
- **Palette** fits the brand mood: cafe→warm neutrals+terracotta+deep green; tech→indigo+near-black; wellness→sage+cream; luxury→black+gold+ivory; medical→deep blue+white.
- **Typography**: @import Google Fonts at top of cssText. Heading font: Playfair/Fraunces/Space Grotesk (or Noto Serif/Sans KR for Korean). Body: Inter/Noto Sans. Type scale using clamp(): h1 clamp(2.25rem,4vw,3.5rem), h2 clamp(1.75rem,3vw,2.5rem). line-height 1.15 headings / 1.65 body. Letter-spacing −0.02em on headings.
- **Home page MUST have**: (1) Hero w/ bg image + overlay + large heading + CTA (2) 3-col feature grid (3) image+text content section (4) testimonial or stats (5) final CTA band. Other pages: 3-4 varied sections each.
- **Layout**: CSS Grid + Flexbox. Section vertical rhythm padding-block: clamp(48px,8vw,120px).
- **Polish**: Buttons padding 14px 28px, radius md, hover translateY(-2px)+shadow. Cards radius-lg+shadow-sm+padding 32px, hover lift. Images radius-md, object-fit:cover, aspect-ratio enforced. Hero bg w/ linear-gradient overlay. Inline SVG icons (24×24, stroke currentColor) in circular tinted badges — NO emoji icons.
- **Imagery**: https://homenshop.com/api/img?q={english-keywords}&w={w}&h={h} — semantic image search (Pexels-backed). ALWAYS use the absolute https://homenshop.com prefix (relative /api/img breaks on custom domains).
    q MUST be English keywords describing the image content. Translate Korean/other languages first.
    Examples: cafe interior → q=cafe+interior · ocean sunset → q=ocean+sunset · team meeting → q=team+meeting · happy family → q=happy+family
    Use 1-3 specific words, lowercase, joined with "+". NEVER use picsum.photos or other random placeholders.
    Hero 1920×1080, cards 600×400, team portraits 400×400. Use orientation-appropriate dimensions.
- **Header**: brand + inline nav, sticky w/ shadow + backdrop-filter. Menu underline-on-hover via pseudo-element.
- **Footer**: 4 columns (About/Links/Contact/Social), dark bg, light text, small copyright row.
- **Responsive**: @media (max-width:768px) stack menu, collapse grids to 1 col, touch targets ≥44px.
- **A11y**: WCAG AA contrast, alt on every img, focus outlines 2px var(--color-primary).

# Size budget (stay within limits)
- cssText ~5-7KB; each bodyHtml ~2-3.5KB; total ≤28KB.
- Prefer reusable CSS classes over repeated rules. 3-5 pages, not more.

# Forbidden
- Lorem ipsum; emoji as icons; bare div soup (use semantic section/article/nav/header/footer); inline style attributes (except where truly required).
- Always invoke create_site — never respond with prose.`;

const SHOP_ID_REGEX = /^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/;

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

  const body = await request.json();
  const shopId = (body.shopId || "").toString().trim().toLowerCase();
  const defaultLanguage = (body.defaultLanguage || "ko").toString();
  const siteTitle = (body.siteTitle || "").toString().trim();
  const prompt = (body.prompt || "").toString().trim();

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

  const userMessage = [
    `defaultLanguage: ${defaultLanguage}`,
    `shopId: ${shopId}`,
    `siteTitle: ${siteTitle}`,
    "",
    "User prompt:",
    prompt,
    "",
    "Output the JSON object now.",
  ].join("\n");

  console.log("[create-from-ai] start", {
    shopId,
    defaultLanguage,
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
          messages: [{ role: "user", content: userMessage }],
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
            ? "AI 응답이 너무 길어 잘렸습니다. 더 간결한 설명으로 재시도해주세요."
            : "AI가 올바른 형식으로 응답하지 않았습니다.";
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
        ? "AI 응답이 길이 제한에 도달해 페이지 생성이 중단됐습니다. 설명을 더 간결히 다시 시도해주세요."
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
        cssText: aiResult.cssText || null,
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
