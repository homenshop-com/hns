import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/robots/by-domain — Generate robots.txt based on Host header
export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/^www\./, "") || "";

  if (!host) {
    return new NextResponse("User-agent: *\nAllow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Find site by domain
  const domain = await prisma.domain.findFirst({
    where: { domain: host, status: "ACTIVE" },
    select: { siteId: true },
  });

  const sitemapUrl = domain
    ? `https://${host}/sitemap.xml`
    : null;

  const aiBots = [
    "GPTBot", "ChatGPT-User", "OAI-SearchBot",
    "ClaudeBot", "Claude-Web", "anthropic-ai",
    "PerplexityBot", "Perplexity-User",
    "Google-Extended", "Applebot", "Applebot-Extended",
    "CCBot", "Meta-ExternalAgent", "Meta-ExternalFetcher",
    "Bytespider", "cohere-ai", "DuckAssistBot", "MistralAI-User",
  ];

  const body = [
    "# SEO + GEO policy",
    "User-agent: *",
    "Allow: /",
    "Allow: /api/sitemap/",
    "Allow: /api/robots/",
    "Allow: /api/llms/",
    "Allow: /api/img",
    "Disallow: /api/",
    "Disallow: /dashboard/",
    "Disallow: /admin/",
    "Disallow: /_next/",
    "",
    "# AI / LLM crawlers — explicit allow for Generative Engine Optimization",
    ...aiBots.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]),
  ];

  if (sitemapUrl) {
    body.push(`Sitemap: ${sitemapUrl}`);
  }

  return new NextResponse(body.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
