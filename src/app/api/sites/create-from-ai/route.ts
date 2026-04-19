import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
- menuHtml is <ul><li><a href="/{slug}">Title</a></li></ul> — home uses href="/".
- Write ALL content in the user's defaultLanguage.

# Design quality bar (follow these — quality is what matters)
- **Design tokens** at :root — color-primary/accent/bg/surface/text/muted/border, font-heading/body, radius-sm/md/lg, shadow-sm/md/lg, space scale (8pt rhythm), container 1200px.
- **Palette** fits the brand mood: cafe→warm neutrals+terracotta+deep green; tech→indigo+near-black; wellness→sage+cream; luxury→black+gold+ivory; medical→deep blue+white.
- **Typography**: @import Google Fonts at top of cssText. Heading font: Playfair/Fraunces/Space Grotesk (or Noto Serif/Sans KR for Korean). Body: Inter/Noto Sans. Type scale using clamp(): h1 clamp(2.25rem,4vw,3.5rem), h2 clamp(1.75rem,3vw,2.5rem). line-height 1.15 headings / 1.65 body. Letter-spacing −0.02em on headings.
- **Home page MUST have**: (1) Hero w/ bg image + overlay + large heading + CTA (2) 3-col feature grid (3) image+text content section (4) testimonial or stats (5) final CTA band. Other pages: 3-4 varied sections each.
- **Layout**: CSS Grid + Flexbox. Section vertical rhythm padding-block: clamp(48px,8vw,120px).
- **Polish**: Buttons padding 14px 28px, radius md, hover translateY(-2px)+shadow. Cards radius-lg+shadow-sm+padding 32px, hover lift. Images radius-md, object-fit:cover, aspect-ratio enforced. Hero bg w/ linear-gradient overlay. Inline SVG icons (24×24, stroke currentColor) in circular tinted badges — NO emoji icons.
- **Imagery**: https://picsum.photos/seed/{descriptive-keyword}/{w}/{h} matching content. Hero 1920×1080, cards 600×400, team 400×400.
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
}
