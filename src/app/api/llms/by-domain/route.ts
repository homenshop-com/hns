import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/llms/by-domain — Generate llms.txt for a site based on Host header.
 * llms.txt is an emerging standard (proposed by Answer.AI) that gives AI systems
 * a curated, plain-English summary of a site's purpose and key pages.
 * Spec: https://llmstxt.org/
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/^www\./, "") || "";
  if (!host) {
    return new NextResponse("# Unknown host\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const domain = await prisma.domain.findFirst({
    where: { domain: host, status: "ACTIVE" },
    select: { siteId: true },
  });
  if (!domain) {
    return new NextResponse(`# ${host}\n\n> Site not registered.\n`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const site = await prisma.site.findUnique({
    where: { id: domain.siteId },
    include: {
      pages: {
        select: { slug: true, title: true, lang: true, isHome: true, showInMenu: true, sortOrder: true },
        orderBy: [{ lang: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!site) {
    return new NextResponse(`# ${host}\n\n> Site not found.\n`, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const base = `https://${host}`;
  const primaryLang = site.defaultLanguage;
  const primaryPages = site.pages.filter(
    (p) => p.lang === primaryLang && p.showInMenu && !["empty", "user", "users", "agreement"].includes(p.slug.toLowerCase())
  );

  const pageLines = primaryPages.map((p) => {
    const url = p.isHome ? `${base}/${primaryLang}/` : `${base}/${primaryLang}/${p.slug}.html`;
    return `- [${p.title}](${url})`;
  });

  const langNames: Record<string, string> = {
    ko: "Korean", en: "English", ja: "Japanese",
    "zh-cn": "Chinese (Simplified)", "zh-tw": "Chinese (Traditional)", es: "Spanish",
  };
  const langLabels = (site.languages || [primaryLang]).map((l) => langNames[l] || l);

  const body = [
    `# ${site.name}`,
    "",
    `> ${site.description || `${site.name} — multilingual website published via homeNshop.`}`,
    "",
    "## Languages",
    "",
    langLabels.map((l) => `- ${l}`).join("\n"),
    "",
    "## Key Pages",
    "",
    pageLines.length > 0 ? pageLines.join("\n") : `- [Home](${base}/${primaryLang}/)`,
    "",
    "## Metadata",
    "",
    `- Sitemap: ${base}/sitemap.xml`,
    `- Canonical domain: ${host}`,
    `- Published via: homeNshop (https://homenshop.com)`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
