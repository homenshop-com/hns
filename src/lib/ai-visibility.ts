/**
 * AI 언급률(GEO Visibility) 측정 엔진.
 *
 * 생성형 AI가 우리 사이트를 얼마나 인용·추천하는지 측정한다:
 *   1) 사이트 업종/설명 기반으로 잠재 고객이 AI에게 물어볼 법한 질문 세트를
 *      Claude로 생성(브랜드명을 넣지 않은 '발견형' 질문).
 *   2) 각 질문을 웹검색이 켜진 Claude에 질의하고, 응답 본문/인용 URL에
 *      우리 도메인 또는 브랜드명이 등장하는지 검사.
 *   3) 언급률 = 언급된 질문 수 / 전체 질문 수 (%).
 *
 * 호출 패턴(원시 fetch + tool_use)은 src/lib/seo-audit.ts 와 동일.
 * 결과는 AiVisibilityRun 테이블에 1행으로 저장(results = JSON 배열).
 */

import { prisma } from "@/lib/db";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VISIBILITY_MODEL = process.env.AI_VISIBILITY_MODEL || "claude-sonnet-4-6";

/** 기본 질문 개수. 너무 많으면 측정이 느리고 크레딧 소모가 큼. */
const DEFAULT_QUESTION_COUNT = 8;
/** 동시 질의 수 (웹검색 호출은 느리므로 풀로 제한). */
const PROBE_CONCURRENCY = 3;
/** 질문 1건당 웹검색 최대 횟수. */
const MAX_SEARCHES_PER_PROBE = 3;

export class VisibilityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VisibilityError";
    this.code = code;
  }
}

export interface VisibilityResultItem {
  query: string;
  mentioned: boolean;
  /** 인용된 호스트 중 우리 사이트의 순위(1-base). 없으면 null. */
  position: number | null;
  /** 함께 인용된 경쟁/타 사이트 호스트(중복 제거, 최대 6). */
  competitors: string[];
  /** 인용된 전체 URL(최대 10). */
  citations: string[];
  /** 응답 본문 발췌(최대 280자). */
  answerExcerpt: string;
}

export interface VisibilityRunResult {
  id: string;
  engine: string;
  model: string;
  brandName: string | null;
  domain: string | null;
  totalQueries: number;
  mentionedCount: number;
  mentionRate: number;
  creditsCharged: number;
  results: VisibilityResultItem[];
  createdAt: string;
}

interface SiteContext {
  siteId: string;
  brandName: string;
  description: string;
  lang: string;
  businessType: string;
  keywords: string;
  areaServed: string;
  /** 커스텀 도메인 호스트(있으면). 매칭 우선순위 1. */
  customHost: string | null;
  /** 임시 도메인 호스트(home.homenshop.com 등). */
  tempHost: string;
  shopId: string;
  pageTitles: string[];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

async function gatherContext(siteId: string): Promise<SiteContext> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      domains: { where: { status: "ACTIVE" }, take: 1 },
      pages: { select: { title: true }, orderBy: { sortOrder: "asc" }, take: 12 },
    },
  });
  if (!site) throw new VisibilityError("not_found", "사이트를 찾을 수 없습니다.");

  const seo = (site.seoMeta as Record<string, unknown> | null) ?? {};
  const asArr = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join(", ") : typeof v === "string" ? v : "");

  return {
    siteId: site.id,
    brandName: site.name || site.shopId,
    description: site.description || "",
    lang: site.defaultLanguage || "ko",
    businessType: typeof seo.businessType === "string" ? seo.businessType : "",
    keywords: asArr(seo.keywords),
    areaServed: asArr(seo.areaServed),
    customHost: site.domains[0]?.domain ? hostOf(`https://${site.domains[0].domain}`) : null,
    tempHost: hostOf(`https://${site.tempDomain || "home.homenshop.com"}`) || "home.homenshop.com",
    shopId: site.shopId,
    pageTitles: site.pages.map((p) => p.title).filter(Boolean),
  };
}

async function callAnthropic(body: unknown): Promise<{
  content: Array<{
    type: string;
    name?: string;
    text?: string;
    input?: Record<string, unknown>;
    citations?: Array<{ url?: string }>;
    content?: Array<{ type: string; url?: string }>;
  }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}> {
  if (!ANTHROPIC_API_KEY) {
    throw new VisibilityError("no_api_key", "AI 측정이 구성되지 않았습니다. (ANTHROPIC_API_KEY 누락)");
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("[ai-visibility] anthropic error", res.status, text.slice(0, 500));
    throw new VisibilityError("ai_failed", "AI 호출에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  return res.json();
}

/** 발견형 질문 세트 생성 (브랜드명 미포함). */
async function generateQuestions(ctx: SiteContext, count: number): Promise<string[]> {
  const ctxText = [
    `브랜드명: ${ctx.brandName}`,
    ctx.businessType && `업종: ${ctx.businessType}`,
    ctx.description && `설명: ${ctx.description}`,
    ctx.keywords && `키워드: ${ctx.keywords}`,
    ctx.areaServed && `지역: ${ctx.areaServed}`,
    ctx.pageTitles.length ? `페이지: ${ctx.pageTitles.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const data = await callAnthropic({
    model: VISIBILITY_MODEL,
    max_tokens: 1024,
    tools: [
      {
        name: "submit_questions",
        description: "Return the generated discovery questions.",
        input_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: { type: "string" },
              description: "Natural end-user questions, no brand names.",
            },
          },
          required: ["questions"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "submit_questions" },
    messages: [
      {
        role: "user",
        content:
          `다음 비즈니스가 생성형 AI 답변에 추천될 수 있는지 측정하려고 합니다. ` +
          `잠재 고객이 ChatGPT·Claude 같은 AI에게 물어볼 법한 자연스러운 질문 ${count}개를 만들어 주세요. ` +
          `규칙: (1) 브랜드명("${ctx.brandName}")을 절대 포함하지 말 것 — 무명 상태에서의 발견 가능성을 측정합니다. ` +
          `(2) "어디서/추천/best/어떤 업체" 같은 추천 유도형으로. (3) ${ctx.lang} 언어로. ` +
          `(4) 업종·지역·용도를 다양하게.\n\n--- 비즈니스 정보 ---\n${ctxText}`,
      },
    ],
  });

  const block = data.content?.find((c) => c.type === "tool_use" && c.name === "submit_questions");
  const qs = (block?.input?.questions as unknown) as string[] | undefined;
  if (!Array.isArray(qs) || qs.length === 0) {
    throw new VisibilityError("ai_failed", "질문 세트 생성에 실패했습니다.");
  }
  return qs.map((q) => String(q).trim()).filter(Boolean).slice(0, count);
}

/** 한 질문을 웹검색 켠 Claude에 질의하고 언급 여부를 판정. */
async function probe(ctx: SiteContext, query: string): Promise<VisibilityResultItem> {
  let data;
  try {
    data = await callAnthropic({
      model: VISIBILITY_MODEL,
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: MAX_SEARCHES_PER_PROBE }],
      system:
        "You are a helpful assistant answering an end user's question. Search the web when useful. " +
        "When relevant, recommend specific real companies, products, or websites and name their domains.",
      messages: [{ role: "user", content: query }],
    });
  } catch (err) {
    // 개별 질문 실패는 '미언급'으로 기록(전체 실행을 중단하지 않음).
    console.error("[ai-visibility] probe failed:", query, err);
    return { query, mentioned: false, position: null, competitors: [], citations: [], answerExcerpt: "" };
  }

  // 본문 텍스트 + 인용 URL 수집
  let answerText = "";
  const citedHosts: string[] = [];
  const citedUrls: string[] = [];
  const pushUrl = (url?: string) => {
    if (!url) return;
    const h = hostOf(url);
    if (!h) return;
    if (!citedUrls.includes(url) && citedUrls.length < 10) citedUrls.push(url);
    if (!citedHosts.includes(h)) citedHosts.push(h);
  };

  for (const block of data.content || []) {
    if (block.type === "text" && block.text) {
      answerText += block.text + "\n";
      for (const cit of block.citations || []) pushUrl(cit.url);
    }
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result") pushUrl(r.url);
    }
  }

  // 우리 사이트 매칭: 커스텀 도메인 호스트 일치, 또는 임시 호스트+shopId 경로,
  // 또는 본문에 브랜드명 등장(3자 이상).
  const brand = ctx.brandName.trim();
  const brandHit = brand.length >= 3 && answerText.toLowerCase().includes(brand.toLowerCase());

  let position: number | null = null;
  const isOurHost = (host: string, url: string) => {
    if (ctx.customHost && host === ctx.customHost) return true;
    if (host === ctx.tempHost && url.includes(`/${ctx.shopId}`)) return true;
    return false;
  };
  citedUrls.forEach((url) => {
    const h = hostOf(url);
    if (h && position === null && isOurHost(h, url)) {
      position = citedHosts.indexOf(h) + 1;
    }
  });
  const hostHit = position !== null;
  const mentioned = hostHit || brandHit;

  const ourHostSet = new Set(
    [ctx.customHost, ctx.tempHost].filter(Boolean).map((h) => h as string),
  );
  const competitors = citedHosts.filter((h) => !ourHostSet.has(h)).slice(0, 6);

  return {
    query,
    mentioned,
    position,
    competitors,
    citations: citedUrls,
    answerExcerpt: answerText.trim().replace(/\s+/g, " ").slice(0, 280),
  };
}

/** 풀 제한 동시 실행. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      out[cur] = await fn(items[cur]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export interface RunOptions {
  creditsCharged: number;
  questionCount?: number;
}

/** 측정 1회 실행 + AiVisibilityRun 저장. */
export async function runVisibilityCheck(siteId: string, opts: RunOptions): Promise<VisibilityRunResult> {
  const ctx = await gatherContext(siteId);
  const count = opts.questionCount ?? DEFAULT_QUESTION_COUNT;

  const questions = await generateQuestions(ctx, count);
  const results = await mapPool(questions, PROBE_CONCURRENCY, (q) => probe(ctx, q));

  const mentionedCount = results.filter((r) => r.mentioned).length;
  const mentionRate = results.length ? Math.round((mentionedCount / results.length) * 1000) / 10 : 0;
  const domain = ctx.customHost || `${ctx.tempHost}/${ctx.shopId}`;

  const run = await prisma.aiVisibilityRun.create({
    data: {
      siteId,
      engine: "claude",
      model: VISIBILITY_MODEL,
      brandName: ctx.brandName,
      domain,
      totalQueries: results.length,
      mentionedCount,
      mentionRate,
      creditsCharged: opts.creditsCharged,
      results: results as unknown as object,
    },
  });

  return {
    id: run.id,
    engine: run.engine,
    model: run.model,
    brandName: run.brandName,
    domain: run.domain,
    totalQueries: run.totalQueries,
    mentionedCount: run.mentionedCount,
    mentionRate: run.mentionRate,
    creditsCharged: run.creditsCharged,
    results,
    createdAt: run.createdAt.toISOString(),
  };
}

/** 사이트의 최근 측정 결과(없으면 null). */
export async function getLatestVisibilityRun(siteId: string): Promise<VisibilityRunResult | null> {
  const run = await prisma.aiVisibilityRun.findFirst({
    where: { siteId },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;
  return {
    id: run.id,
    engine: run.engine,
    model: run.model,
    brandName: run.brandName,
    domain: run.domain,
    totalQueries: run.totalQueries,
    mentionedCount: run.mentionedCount,
    mentionRate: run.mentionRate,
    creditsCharged: run.creditsCharged,
    results: (run.results as unknown as VisibilityResultItem[]) ?? [],
    createdAt: run.createdAt.toISOString(),
  };
}
