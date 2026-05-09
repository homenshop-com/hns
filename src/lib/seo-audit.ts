/**
 * SEO/GEO audit — fetch a site's published homepage, ask Claude to score
 * it across SEO + AI-readability dimensions, and return a structured
 * diagnosis. Result is persisted to Site.seoAuditResult so the dashboard
 * doesn't re-charge users to re-view the same report.
 *
 * Caller responsibilities:
 *   · Authorize the user / admin (this lib does NOT check perms)
 *   · For paid path: consume credits BEFORE calling runSeoAudit, refund
 *     on thrown error. See /api/seo-audit for the canonical pattern.
 *   · For admin path: call runSeoAudit directly; no credit interaction.
 *
 * Why fetch then re-prompt instead of feeding the DB content directly:
 * the DB content is templated HTML fragments; what AI crawlers actually
 * see is the rendered output (after JSON-LD injection, hreflang, etc).
 * Auditing the rendered HTML catches issues invisible at the DB layer.
 */

import { prisma } from "@/lib/db";
import { getTempDomain } from "@/lib/temp-domains";
import type { Prisma } from "@/generated/prisma/client";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Sonnet is the right tier here — Haiku misses subtle GEO issues
// (entity coverage, FAQ schema gaps), Opus is overkill for the rubric.
const AUDIT_MODEL = process.env.SEO_AUDIT_MODEL || "claude-sonnet-4-6";
const MAX_HTML_BYTES = 80_000; // ~20K tokens worst case; trims long pages
// 8 categories × ~5 findings × Korean (≈1.5x English token density) +
// summary; 4000 was getting truncated at the categories array.
const MAX_TOKENS = 8000;

export const SEO_AUDIT_VERSION = 1;

export interface AuditFinding {
  severity: "critical" | "major" | "minor" | "info";
  issue: string;
  recommendation: string;
  /** Optional structured fix the UI can apply with one click. */
  autofix?:
    | { type: "seoMeta"; key: string; value: string }
    | { type: "site"; field: "publicEmail" | "publicPhone" | "publicAddress" | "logoUrl"; value: string };
  /** Set when the autofix has been applied. Persisted in
   *  Site.seoAuditResult so the UI shows ✓ on reload. */
  appliedAt?: string;
}

export interface AuditCategory {
  key: string;
  label: string;
  /** 0..100 */
  score: number;
  findings: AuditFinding[];
}

export interface AuditResult {
  version: number;
  /** 0..100 weighted average across categories. */
  overallScore: number;
  /** Two-sentence executive summary in Korean. */
  summary: string;
  categories: AuditCategory[];
  /** Diagnostics for support / debugging — never shown verbatim. */
  meta: {
    model: string;
    auditedUrl: string;
    htmlBytes: number;
    truncated: boolean;
    tokensIn: number;
    tokensOut: number;
    creditsCharged: number;
    runAt: string;
  };
}

const SYSTEM_PROMPT = `You are a senior SEO/GEO consultant auditing a published business homepage. GEO = Generative Engine Optimization (visibility in AI assistants like ChatGPT/Claude/Perplexity).

You will be given the FULL rendered HTML of the homepage (server-rendered, including JSON-LD).

Audit it across these categories. For each category produce an integer 0–100 score and a list of findings. Each finding is one issue with a concrete recommendation. Korean output for issue/recommendation/summary.

Categories (use these exact keys):
1. "title_meta" — <title>, meta description, OpenGraph, canonical
2. "headings" — H1 presence/uniqueness, heading hierarchy, semantic clarity
3. "structured_data" — JSON-LD Organization/WebSite/Product/Article/Breadcrumb/FAQ — coverage and validity
4. "images_alt" — alt-text presence, descriptiveness, image filename quality
5. "hreflang" — hreflang tags for multi-language sites; xhtml:link in sitemap
6. "internal_links" — anchor text quality, navigation discoverability, broken patterns
7. "ai_readability" — content depth, factual specificity, entity richness, llms.txt presence — what GPT/Claude/Perplexity need
8. "eeat" — Experience/Expertise/Authoritativeness/Trust signals (author, contact, address, sameAs)

Severity rubric:
- "critical" — blocks indexing or AI citation entirely (no <title>, no Organization JSON-LD, robots noindex)
- "major" — measurable ranking/visibility loss (missing meta description, no H1, alt text on every image is empty)
- "minor" — incremental improvement (slogan missing, areaServed not set)
- "info" — observation, not actionable (e.g. score breakdown explanation)

Autofix rules — only set "autofix" when the fix is a simple data write the platform can do automatically. Examples:
- recommend a missing meta description → autofix: { type: "seoMeta", key: "description", value: "<concrete suggested text>" }
- recommend a public phone → autofix: { type: "site", field: "publicPhone", value: "<extracted from page>" }
Do NOT set autofix for HTML/CSS-level fixes (heading restructure, alt text on individual images) — leave those as text recommendations only.

Output ONLY by calling the submit_audit tool. No prose, no questions.`;

interface ToolInput {
  overallScore: number;
  summary: string;
  categories: Array<{
    key: string;
    label: string;
    score: number;
    findings: AuditFinding[];
  }>;
}

const AUDIT_TOOL = {
  name: "submit_audit",
  description: "Submit the SEO/GEO audit as structured data.",
  input_schema: {
    type: "object",
    required: ["overallScore", "summary", "categories"],
    properties: {
      overallScore: { type: "integer", minimum: 0, maximum: 100 },
      summary: { type: "string" },
      categories: {
        type: "array",
        minItems: 8,
        maxItems: 8,
        items: {
          type: "object",
          required: ["key", "label", "score", "findings"],
          properties: {
            key: { type: "string" },
            label: { type: "string" },
            score: { type: "integer", minimum: 0, maximum: 100 },
            findings: {
              type: "array",
              items: {
                type: "object",
                required: ["severity", "issue", "recommendation"],
                properties: {
                  severity: { type: "string", enum: ["critical", "major", "minor", "info"] },
                  issue: { type: "string" },
                  recommendation: { type: "string" },
                  autofix: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["seoMeta", "site"] },
                      key: { type: "string" },
                      field: { type: "string", enum: ["publicEmail", "publicPhone", "publicAddress", "logoUrl"] },
                      value: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

export class SeoAuditError extends Error {
  readonly code: "no_homepage" | "fetch_failed" | "no_api_key" | "ai_failed";
  constructor(code: SeoAuditError["code"], message: string) {
    super(message);
    this.name = "SeoAuditError";
    this.code = code;
  }
}

interface SiteForAudit {
  id: string;
  shopId: string;
  defaultLanguage: string;
  tempDomain: string;
  domains: { domain: string; status: string }[];
}

/**
 * Build the public-facing homepage URL we'll fetch. Prefer an ACTIVE
 * custom domain (that's what AI crawlers actually see); fall back to
 * the temp domain. Always lang-prefixed so we hit the rendered page,
 * not a redirect chain.
 */
export function getAuditUrl(site: SiteForAudit): string {
  const active = site.domains.find((d) => d.status === "ACTIVE");
  if (active) return `https://${active.domain}/${site.defaultLanguage}/index.html`;
  const temp = getTempDomain(site as Parameters<typeof getTempDomain>[0]);
  return `https://${temp}/${site.shopId}/${site.defaultLanguage}/index.html`;
}

async function fetchRenderedHtml(url: string): Promise<{ html: string; truncated: boolean }> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "follow",
      headers: {
        // Identify as a real crawler so server-side branching (if any)
        // gives us the same HTML real bots get.
        "User-Agent": "homeNshop-SEO-Audit/1.0 (+https://homenshop.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err) {
    throw new SeoAuditError("fetch_failed", `홈페이지를 가져올 수 없습니다: ${(err as Error).message}`);
  }
  if (!res.ok) {
    throw new SeoAuditError("fetch_failed", `홈페이지 응답 오류 (HTTP ${res.status}). 사이트가 퍼블리싱되었는지 확인해주세요.`);
  }
  let html = await res.text();
  const truncated = html.length > MAX_HTML_BYTES;
  if (truncated) html = html.slice(0, MAX_HTML_BYTES) + "\n<!-- [truncated for audit] -->";
  return { html, truncated };
}

interface RunAuditOptions {
  /** Credits charged for this run (0 for admin). Stored in result.meta. */
  creditsCharged: number;
}

export async function runSeoAudit(siteId: string, opts: RunAuditOptions): Promise<AuditResult> {
  if (!ANTHROPIC_API_KEY) {
    throw new SeoAuditError("no_api_key", "AI 기능이 설정되지 않았습니다 (ANTHROPIC_API_KEY 누락).");
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      shopId: true,
      defaultLanguage: true,
      tempDomain: true,
      domains: { select: { domain: true, status: true } },
    },
  });
  if (!site) throw new SeoAuditError("no_homepage", "사이트를 찾을 수 없습니다.");

  const url = getAuditUrl(site);
  const { html, truncated } = await fetchRenderedHtml(url);

  const userContent = `Audit this homepage. URL: ${url}\nLanguage: ${site.defaultLanguage}\n\n--- HTML START ---\n${html}\n--- HTML END ---`;

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: AUDIT_MODEL,
      max_tokens: MAX_TOKENS,
      // Cache the long, stable system prompt — cuts 60–70% off the
      // input cost of repeat audits within the 5-min cache window.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [AUDIT_TOOL],
      tool_choice: { type: "tool", name: "submit_audit" },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("[seo-audit] anthropic error", apiRes.status, errText);
    throw new SeoAuditError("ai_failed", "AI 진단 호출에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  const data = (await apiRes.json()) as {
    content: Array<{ type: string; name?: string; input?: Partial<ToolInput> }>;
    stop_reason?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const toolBlock = data.content?.find((c) => c.type === "tool_use" && c.name === "submit_audit");
  if (!toolBlock?.input) {
    console.error("[seo-audit] no tool_use block", { stop_reason: data.stop_reason, content: data.content });
    throw new SeoAuditError("ai_failed", "AI 응답이 올바른 형식이 아닙니다.");
  }

  const input = toolBlock.input;

  // Defensive parsing: if Claude truncated mid-array (max_tokens) or
  // omitted a field, fail with a useful message instead of a TypeError.
  if (!Array.isArray(input.categories) || input.categories.length === 0) {
    console.error("[seo-audit] missing categories", {
      stop_reason: data.stop_reason,
      keys: Object.keys(input),
      tokensOut: data.usage?.output_tokens,
    });
    const why = data.stop_reason === "max_tokens"
      ? "응답이 길이 제한에 도달했습니다."
      : "AI가 카테고리를 반환하지 않았습니다.";
    throw new SeoAuditError("ai_failed", `${why} 다시 시도해주세요.`);
  }

  const result: AuditResult = {
    version: SEO_AUDIT_VERSION,
    overallScore: clamp(input.overallScore ?? 0, 0, 100),
    summary: input.summary ?? "",
    categories: input.categories.map((c) => ({
      key: c.key ?? "unknown",
      label: c.label ?? c.key ?? "unknown",
      score: clamp(c.score ?? 0, 0, 100),
      findings: Array.isArray(c.findings)
        ? c.findings.map((f) => ({
            severity: f.severity,
            issue: f.issue,
            recommendation: f.recommendation,
            autofix: f.autofix,
          }))
        : [],
    })),
    meta: {
      model: AUDIT_MODEL,
      auditedUrl: url,
      htmlBytes: html.length,
      truncated,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      creditsCharged: opts.creditsCharged,
      runAt: new Date().toISOString(),
    },
  };

  await prisma.site.update({
    where: { id: siteId },
    data: {
      seoAuditAt: new Date(),
      seoAuditResult: result as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

function clamp(n: number, min: number, max: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/* ───────── Tier 1 — Auto-apply data-field fixes (free) ───────── */

export interface FixRef {
  /** The category.key from the audit result (e.g. "title_meta"). */
  categoryKey: string;
  /** Index into category.findings. */
  findingIndex: number;
}

export interface ApplyAutofixResult {
  applied: number;
  skipped: number;
  errors: string[];
  /** Updated audit result with appliedAt set on each successfully-applied finding. */
  result: AuditResult;
}

/** Whitelist of seoMeta keys that may be written via autofix. Anything
 *  outside this list is silently dropped — defends against a model that
 *  invents new keys. Mirrors the keys documented on the schema's seoMeta
 *  comment plus a couple of common SEO essentials. */
const ALLOWED_SEOMETA_KEYS = new Set([
  "alternateName",
  "slogan",
  "foundingDate",
  "areaServed",
  "sameAs",
  "keywords",
  "businessType",
  "description",
  "title",
]);

const ALLOWED_SITE_FIELDS = new Set(["publicEmail", "publicPhone", "publicAddress", "logoUrl"]);

/**
 * Apply one or more autofix-tagged findings from a stored audit. Each
 * finding is looked up by (categoryKey, findingIndex), validated, and
 * written either to a Site column or merged into Site.seoMeta JSON.
 * Findings without an autofix are silently skipped.
 *
 * Free path — no credit interaction. Caller verifies authorization.
 */
export async function applyAutofixes(
  siteId: string,
  refs: FixRef[],
): Promise<ApplyAutofixResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      seoAuditResult: true,
      seoMeta: true,
      publicEmail: true,
      publicPhone: true,
      publicAddress: true,
      logoUrl: true,
    },
  });
  if (!site) throw new SeoAuditError("no_homepage", "사이트를 찾을 수 없습니다.");
  const stored = site.seoAuditResult as unknown as AuditResult | null;
  if (!stored || !Array.isArray(stored.categories)) {
    throw new SeoAuditError("ai_failed", "먼저 진단을 실행해주세요.");
  }

  const errors: string[] = [];
  let applied = 0;
  let skipped = 0;

  // Build the update payload incrementally so we apply everything in one
  // Site.update — avoids partial-failure surprises if the DB hiccups.
  const seoMetaPatch: Record<string, unknown> = {
    ...(typeof site.seoMeta === "object" && site.seoMeta !== null ? (site.seoMeta as Record<string, unknown>) : {}),
  };
  const siteFieldPatch: Partial<{
    publicEmail: string;
    publicPhone: string;
    publicAddress: string;
    logoUrl: string;
  }> = {};

  // Clone stored result so we can mark applied without mutating the
  // shared reference. Cheap — JSON serialization on small object.
  const updated: AuditResult = JSON.parse(JSON.stringify(stored));

  for (const ref of refs) {
    const cat = updated.categories.find((c) => c.key === ref.categoryKey);
    if (!cat) {
      errors.push(`알 수 없는 카테고리: ${ref.categoryKey}`);
      skipped++;
      continue;
    }
    const finding = cat.findings[ref.findingIndex];
    if (!finding) {
      errors.push(`${ref.categoryKey}[${ref.findingIndex}] 항목 없음`);
      skipped++;
      continue;
    }
    if (!finding.autofix) {
      skipped++;
      continue;
    }
    if (finding.appliedAt) {
      // Already applied — idempotent skip.
      skipped++;
      continue;
    }
    const fix = finding.autofix;
    const value = String(fix.value ?? "").trim();
    if (!value) {
      errors.push(`${ref.categoryKey}[${ref.findingIndex}] 값이 비어있음`);
      skipped++;
      continue;
    }
    if (fix.type === "site") {
      if (!ALLOWED_SITE_FIELDS.has(fix.field)) {
        errors.push(`허용되지 않은 필드: ${fix.field}`);
        skipped++;
        continue;
      }
      siteFieldPatch[fix.field] = value;
    } else if (fix.type === "seoMeta") {
      if (!ALLOWED_SEOMETA_KEYS.has(fix.key)) {
        errors.push(`허용되지 않은 seoMeta 키: ${fix.key}`);
        skipped++;
        continue;
      }
      seoMetaPatch[fix.key] = value;
    } else {
      errors.push(`알 수 없는 autofix type`);
      skipped++;
      continue;
    }
    finding.appliedAt = new Date().toISOString();
    applied++;
  }

  if (applied > 0) {
    await prisma.site.update({
      where: { id: siteId },
      data: {
        ...siteFieldPatch,
        ...(Object.keys(seoMetaPatch).length > 0
          ? { seoMeta: seoMetaPatch as Prisma.InputJsonValue }
          : {}),
        seoAuditResult: updated as unknown as Prisma.InputJsonValue,
      },
    });
  }

  return { applied, skipped, errors, result: updated };
}

/* ───────── Tier 2 — Claude-driven HTML rewrite (10C) ───────── */

const OPTIMIZE_MODEL = process.env.SEO_OPTIMIZE_MODEL || "claude-sonnet-4-6";
// Patched HTML can be larger than input (added JSON-LD, alt texts, FAQ).
// Real-world: 23K input → ~28K output. 8K was running out at stop_reason=max_tokens.
const OPTIMIZE_MAX_TOKENS = 16000;
const OPTIMIZE_MAX_HTML_BYTES = 60_000; // ~15K tokens — leaves headroom for output

const OPTIMIZE_SYSTEM_PROMPT = `You are an SEO/GEO HTML editor. You receive:
1. A homepage HTML body (rendered <body> innerHTML / Page.content)
2. A list of audit findings WITHOUT structured autofix — these need HTML/CSS/content changes

Rewrite the HTML to address as many findings as possible while obeying every rule below.

CRITICAL RULES:
- Preserve the EXISTING structure: every \`class="dragable"\` element must keep the same id and outer wrapper. Position styles (top/left/width/height inline) MUST be preserved bit-for-bit.
- You may modify text content, add/improve alt= on <img>, add hidden semantic tags (<h1> if missing, <h2>/<h3> hierarchy), inject a hidden "AI-readability" block at the END of the body (a <section style="position:relative; ..." class="ai-context" with key facts/FAQ — but ONLY if findings call for it).
- You may add JSON-LD <script type="application/ld+json"> blocks at the end of the body for FAQ, BreadcrumbList, etc. Use schema.org formats. Use realistic content extracted from the page.
- DO NOT change layout (no new positioned absolutes, no resizing existing elements).
- DO NOT remove any existing element — only modify text/attributes or APPEND new elements at the end.
- Korean output for new text content unless original is non-Korean.
- Preserve all existing href= and src= URLs.

Submit by calling submit_optimization with:
- patchedHtml: the FULL rewritten body HTML (must be valid; existing dragable elements retained)
- changes: 1-line Korean descriptions of each change ("alt 텍스트 5개 추가", "FAQ JSON-LD 주입" 등)
- addressedFindings: array of {categoryKey, findingIndex} for each finding actually addressed
`;

const OPTIMIZE_TOOL = {
  name: "submit_optimization",
  description: "Submit the optimized HTML and a list of changes.",
  input_schema: {
    type: "object",
    required: ["patchedHtml", "changes", "addressedFindings"],
    properties: {
      patchedHtml: { type: "string" },
      changes: { type: "array", items: { type: "string" } },
      addressedFindings: {
        type: "array",
        items: {
          type: "object",
          required: ["categoryKey", "findingIndex"],
          properties: {
            categoryKey: { type: "string" },
            findingIndex: { type: "integer", minimum: 0 },
          },
        },
      },
    },
  },
};

export interface OptimizePreview {
  pageId: string;
  pageSlug: string;
  before: string;
  after: string;
  changes: string[];
  addressedFindings: FixRef[];
  meta: {
    model: string;
    tokensIn: number;
    tokensOut: number;
    creditsCharged: number;
    runAt: string;
  };
}

/**
 * Tier 2 — Claude rewrites the home page HTML using the audit findings
 * as guidance. Returns a preview; the caller is expected to either
 * commit (commitOptimization) or discard. Credits are charged at this
 * step (the Claude call is what costs money), not at commit time.
 */
export async function optimizeHomepageHtml(
  siteId: string,
  opts: { creditsCharged: number },
): Promise<OptimizePreview> {
  if (!ANTHROPIC_API_KEY) {
    throw new SeoAuditError("no_api_key", "AI 기능이 설정되지 않았습니다.");
  }
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, defaultLanguage: true, seoAuditResult: true },
  });
  if (!site) throw new SeoAuditError("no_homepage", "사이트를 찾을 수 없습니다.");
  const stored = site.seoAuditResult as unknown as AuditResult | null;
  if (!stored) throw new SeoAuditError("ai_failed", "먼저 진단을 실행해주세요.");

  const homePage = await prisma.page.findFirst({
    where: { siteId, isHome: true, lang: site.defaultLanguage },
    select: { id: true, slug: true, content: true },
  });
  if (!homePage) {
    throw new SeoAuditError("no_homepage", "홈페이지를 찾을 수 없습니다.");
  }
  // Page.content is Json `{ html?: string, ...other }` — see published renderer.
  const homeContent = (homePage.content ?? {}) as { html?: string; [k: string]: unknown };
  const homeBodyHtml = typeof homeContent.html === "string" ? homeContent.html : "";

  // Filter findings: severity ≥ minor, no autofix (Tier 1 handles those),
  // not already applied. Critical/major first so a tight cap still hits
  // the highest-value items. Capped at 15 to keep output budget healthy.
  const targets: Array<{ categoryKey: string; findingIndex: number; finding: AuditFinding }> = [];
  for (const cat of stored.categories) {
    cat.findings.forEach((f, idx) => {
      if (f.autofix) return;
      if (f.appliedAt) return;
      if (f.severity === "info") return;
      targets.push({ categoryKey: cat.key, findingIndex: idx, finding: f });
    });
  }
  const sevRank = { critical: 0, major: 1, minor: 2, info: 3 } as const;
  targets.sort((a, b) => sevRank[a.finding.severity] - sevRank[b.finding.severity]);
  const focused = targets.slice(0, 15);
  if (focused.length === 0) {
    throw new SeoAuditError(
      "ai_failed",
      "HTML 수정이 필요한 항목이 없습니다. (자동 적용 후 남은 권고가 모두 콘텐츠/이미지 외의 큰 변경입니다.)",
    );
  }

  const findingsBlock = focused
    .map((t, i) => `[${i}] (${t.categoryKey}/${t.finding.severity}) ${t.finding.issue}\n     → ${t.finding.recommendation}`)
    .join("\n");

  // If HTML is too long, send only the head portion to Claude and append
  // the untouched tail back after patching. The tail tends to be footer/
  // trailing sections — losing edits there is acceptable; sending the
  // whole thing risks blowing the output budget.
  let htmlForPrompt = homeBodyHtml;
  let untouchedTail = "";
  if (htmlForPrompt.length > OPTIMIZE_MAX_HTML_BYTES) {
    const cutAt = htmlForPrompt.lastIndexOf("</div>", OPTIMIZE_MAX_HTML_BYTES);
    const split = cutAt > 0 ? cutAt + 6 : OPTIMIZE_MAX_HTML_BYTES;
    untouchedTail = htmlForPrompt.slice(split);
    htmlForPrompt = htmlForPrompt.slice(0, split);
  }
  const userContent = `Findings to address:\n${findingsBlock}\n\n--- HOMEPAGE BODY HTML START ---\n${htmlForPrompt}\n--- HOMEPAGE BODY HTML END ---${untouchedTail ? "\n\n[NOTE: HTML was truncated for budget. Patch only what's shown — server will re-append the rest verbatim.]" : ""}`;

  const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: OPTIMIZE_MODEL,
      max_tokens: OPTIMIZE_MAX_TOKENS,
      system: [{ type: "text", text: OPTIMIZE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [OPTIMIZE_TOOL],
      tool_choice: { type: "tool", name: "submit_optimization" },
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text();
    console.error("[seo-optimize] anthropic error", apiRes.status, errText);
    throw new SeoAuditError("ai_failed", "AI 최적화 호출에 실패했습니다.");
  }

  const data = (await apiRes.json()) as {
    content: Array<{ type: string; name?: string; input?: {
      patchedHtml?: string;
      changes?: string[];
      addressedFindings?: FixRef[];
    } }>;
    stop_reason?: string;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const tool = data.content?.find((c) => c.type === "tool_use" && c.name === "submit_optimization");
  if (!tool?.input?.patchedHtml) {
    console.error("[seo-optimize] no tool_use", { stop_reason: data.stop_reason });
    const why = data.stop_reason === "max_tokens"
      ? "응답이 길이 제한에 도달했습니다."
      : "AI 응답이 올바른 형식이 아닙니다.";
    throw new SeoAuditError("ai_failed", why);
  }

  return {
    pageId: homePage.id,
    pageSlug: homePage.slug,
    before: homeBodyHtml,
    after: tool.input.patchedHtml + untouchedTail,
    changes: Array.isArray(tool.input.changes) ? tool.input.changes : [],
    addressedFindings: Array.isArray(tool.input.addressedFindings) ? tool.input.addressedFindings : [],
    meta: {
      model: OPTIMIZE_MODEL,
      tokensIn: data.usage?.input_tokens ?? 0,
      tokensOut: data.usage?.output_tokens ?? 0,
      creditsCharged: opts.creditsCharged,
      runAt: new Date().toISOString(),
    },
  };
}

/**
 * Save the previewed optimization to Page.content and mark addressed
 * findings as applied. Free — credits were charged at preview time.
 */
export async function commitOptimization(
  siteId: string,
  pageId: string,
  patchedHtml: string,
  addressed: FixRef[],
): Promise<{ ok: true }> {
  // Verify pageId belongs to siteId AND read existing content so we
  // preserve other keys (e.g. css, scripts) when overwriting html.
  const page = await prisma.page.findFirst({
    where: { id: pageId, siteId },
    select: { id: true, content: true },
  });
  if (!page) throw new SeoAuditError("no_homepage", "페이지를 찾을 수 없습니다.");

  const existingContent =
    typeof page.content === "object" && page.content !== null && !Array.isArray(page.content)
      ? (page.content as Record<string, unknown>)
      : {};
  const newContent: Record<string, unknown> = { ...existingContent, html: patchedHtml };

  // Mark addressed findings as applied in the audit result.
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { seoAuditResult: true },
  });
  let updatedAudit: AuditResult | null = null;
  if (site?.seoAuditResult) {
    const stored = site.seoAuditResult as unknown as AuditResult;
    const cloned: AuditResult = JSON.parse(JSON.stringify(stored));
    const nowIso = new Date().toISOString();
    for (const ref of addressed) {
      const cat = cloned.categories.find((c) => c.key === ref.categoryKey);
      if (!cat) continue;
      const finding = cat.findings[ref.findingIndex];
      if (finding && !finding.appliedAt) finding.appliedAt = nowIso;
    }
    updatedAudit = cloned;
  }

  await prisma.$transaction([
    prisma.page.update({
      where: { id: pageId },
      data: { content: newContent as Prisma.InputJsonValue },
    }),
    ...(updatedAudit
      ? [prisma.site.update({
          where: { id: siteId },
          data: { seoAuditResult: updatedAudit as unknown as Prisma.InputJsonValue },
        })]
      : []),
  ]);

  return { ok: true };
}
