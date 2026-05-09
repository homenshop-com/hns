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
const MAX_TOKENS = 4000;

export const SEO_AUDIT_VERSION = 1;

export interface AuditFinding {
  severity: "critical" | "major" | "minor" | "info";
  issue: string;
  recommendation: string;
  /** Optional structured fix the UI can apply with one click. */
  autofix?:
    | { type: "seoMeta"; key: string; value: string }
    | { type: "site"; field: "publicEmail" | "publicPhone" | "publicAddress" | "logoUrl"; value: string };
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
    content: Array<{ type: string; name?: string; input?: ToolInput }>;
    usage?: { input_tokens: number; output_tokens: number };
  };
  const toolBlock = data.content?.find((c) => c.type === "tool_use" && c.name === "submit_audit");
  if (!toolBlock?.input) {
    throw new SeoAuditError("ai_failed", "AI 응답이 올바른 형식이 아닙니다.");
  }

  const input = toolBlock.input;
  const result: AuditResult = {
    version: SEO_AUDIT_VERSION,
    overallScore: clamp(input.overallScore, 0, 100),
    summary: input.summary,
    categories: input.categories.map((c) => ({
      key: c.key,
      label: c.label,
      score: clamp(c.score, 0, 100),
      findings: (c.findings || []).map((f) => ({
        severity: f.severity,
        issue: f.issue,
        recommendation: f.recommendation,
        autofix: f.autofix,
      })),
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
