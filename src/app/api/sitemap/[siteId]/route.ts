import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/sitemap/[siteId] — Generate sitemap.xml for a site
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        select: { slug: true, lang: true, updatedAt: true, isHome: true, content: true },
        orderBy: [{ lang: "asc" }, { sortOrder: "asc" }],
      },
      domains: {
        where: { status: "ACTIVE" },
        select: { domain: true },
        take: 1,
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const customDomain = site.domains.length > 0 ? site.domains[0].domain : null;
  const baseUrl = customDomain
    ? `https://${customDomain}`
    : `https://home.homenshop.com/${site.shopId}`;

  const activeLangs = new Set(site.languages || [site.defaultLanguage]);
  const skipSlugs = new Set(["empty", "user", "users", "agreement"]);

  const urls: string[] = [];

  for (const page of site.pages) {
    if (skipSlugs.has(page.slug.toLowerCase())) continue;
    if (!activeLangs.has(page.lang)) continue;

    const lastmod = page.updatedAt.toISOString().split("T")[0];
    const isIndex = page.slug === "index" || page.isHome;
    const priority = isIndex ? "1.0" : "0.8";
    const changefreq = isIndex ? "daily" : "weekly";
    const loc = `${baseUrl}/${page.lang}/${page.slug}.html`;

    urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`);
  }

  // Extract downloadable file links from page content
  const seenFiles = new Set<string>();
  for (const page of site.pages) {
    if (!activeLangs.has(page.lang)) continue;
    const content = page.content as { html?: string } | null;
    if (!content?.html) continue;
    const fileRegex = /href="[^"]*\/([\w/-]+\.(xlsx|pdf|docx?|csv|zip))/gi;
    let match;
    while ((match = fileRegex.exec(content.html)) !== null) {
      const fullMatch = match[0].replace('href="', '');
      let fileUrl = fullMatch;
      if (fileUrl.startsWith("http")) {
        try {
          const u = new URL(fileUrl);
          fileUrl = `${baseUrl}${u.pathname}`;
        } catch { continue; }
      } else if (fileUrl.startsWith("/")) {
        fileUrl = `${baseUrl}${fileUrl}`;
      } else {
        continue;
      }
      if (seenFiles.has(fileUrl)) continue;
      seenFiles.add(fileUrl);
      const lastmod = page.updatedAt.toISOString().split("T")[0];
      urls.push(`  <url>
    <loc>${escapeXml(fileUrl)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`);
    }
  }

  // Product & Board URLs from PostgreSQL
  const productPages = site.pages.filter(p => activeLangs.has(p.lang) && (p.slug === "product" || p.slug === "goods"));
  const boardPages = site.pages.filter(p => activeLangs.has(p.lang) && p.slug === "board");

  if (productPages.length > 0) {
    const products = await prisma.product.findMany({
      where: { siteId },
      select: { legacyId: true, createdAt: true },
      orderBy: { legacyId: "desc" },
    });
    for (const prod of products) {
      for (const pp of productPages) {
        const loc = `${baseUrl}/${pp.lang}/${pp.slug}.html?action=read&id=${prod.legacyId}`;
        const lastmod = prod.createdAt.toISOString().split("T")[0];
        urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
      }
    }
  }

  if (boardPages.length > 0) {
    const posts = await prisma.boardPost.findMany({
      where: { siteId, parentId: null },
      select: { legacyId: true, regdate: true, createdAt: true },
      orderBy: { legacyId: "desc" },
    });
    for (const post of posts) {
      for (const bp of boardPages) {
        const loc = `${baseUrl}/${bp.lang}/board.html?action=read&id=${post.legacyId}`;
        const lastmod = post.regdate ? post.regdate.substring(0, 10) : post.createdAt.toISOString().split("T")[0];
        urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
      }
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
