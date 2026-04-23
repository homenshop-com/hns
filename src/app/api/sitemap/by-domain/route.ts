import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// GET /api/sitemap/by-domain — Generate sitemap.xml based on Host header (for custom domains)
export async function GET(request: NextRequest) {
  const host = request.headers.get("host")?.replace(/^www\./, "") || "";

  if (!host) {
    return NextResponse.json({ error: "No host" }, { status: 400 });
  }

  // Find site by domain
  const domain = await prisma.domain.findFirst({
    where: { domain: host, status: "ACTIVE" },
    select: { siteId: true },
  });

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Redirect internally to the siteId-based sitemap
  const site = await prisma.site.findUnique({
    where: { id: domain.siteId },
    include: {
      pages: {
        select: { slug: true, lang: true, updatedAt: true, isHome: true, content: true },
        orderBy: [{ lang: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const baseUrl = `https://${host}`;
  const activeLangsList = site.languages && site.languages.length > 0 ? site.languages : [site.defaultLanguage];
  const activeLangs = new Set(activeLangsList);
  const skipSlugs = new Set(["empty", "user", "users", "agreement"]);

  const urls: string[] = [];

  // Group pages by slug so we can emit hreflang alternates
  const pagesBySlug = new Map<string, typeof site.pages>();
  for (const p of site.pages) {
    if (skipSlugs.has(p.slug.toLowerCase())) continue;
    if (!activeLangs.has(p.lang)) continue;
    const arr = pagesBySlug.get(p.slug) || [];
    arr.push(p);
    pagesBySlug.set(p.slug, arr);
  }

  for (const page of site.pages) {
    if (skipSlugs.has(page.slug.toLowerCase())) continue;
    if (!activeLangs.has(page.lang)) continue;

    const lastmod = page.updatedAt.toISOString().split("T")[0];
    const isIndex = page.slug === "index" || page.isHome;
    const priority = isIndex ? "1.0" : "0.8";
    const changefreq = isIndex ? "daily" : "weekly";

    const loc = `${baseUrl}/${page.lang}/${page.slug}.html`;

    // Emit hreflang alternates for sibling pages with same slug in other languages
    const siblings = pagesBySlug.get(page.slug) || [];
    const alternates = siblings.map((s) =>
      `    <xhtml:link rel="alternate" hreflang="${s.lang}" href="${escapeXml(`${baseUrl}/${s.lang}/${s.slug}.html`)}" />`
    ).join("\n");
    const xDefault = siblings.find((s) => s.lang === site.defaultLanguage) || siblings[0];
    const xDefaultLink = xDefault
      ? `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(`${baseUrl}/${xDefault.lang}/${xDefault.slug}.html`)}" />`
      : "";

    urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}${xDefaultLink}
  </url>`);
  }

  // Extract downloadable file links from page content (xlsx, pdf, doc, etc.)
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

  // Product & Board individual item URLs from PostgreSQL.
  //
  // Emit these regardless of whether the site has a dedicated Page row
  // with slug="product" / "goods" / "board" — every homenshop site serves
  // these pseudo-pages through /api/published/{shopId}/{lang}/... even
  // without a matching Page, so they're always part of the crawlable
  // surface area when the underlying data exists.
  const langsForItems = Array.from(activeLangs);
  const primaryLang = activeLangs.has(site.defaultLanguage) ? site.defaultLanguage : langsForItems[0];

  // Products → /{lang}/goods.html?action=read&id=N
  const products = await prisma.product.findMany({
    where: { siteId: site.id },
    select: { legacyId: true, updatedAt: true },
    orderBy: { legacyId: "desc" },
  });
  for (const prod of products) {
    const lastmod = prod.updatedAt.toISOString().split("T")[0];
    for (const lang of langsForItems) {
      const loc = `${baseUrl}/${lang}/goods.html?action=read&id=${prod.legacyId}`;
      urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }
  }

  // Board category list URLs → /{lang}/board.html?action=list&category=N
  // (one per non-hidden, non-duplicate category that has posts)
  const categories = await prisma.boardCategory.findMany({
    where: {
      siteId: site.id,
      lang: primaryLang,
      NOT: { name: { in: ["Default", "New Category"] } },
    },
    select: {
      legacyId: true, name: true,
      _count: { select: { posts: { where: { parentId: null } } } },
    },
    orderBy: { legacyId: "asc" },
  });
  const todayStr = new Date().toISOString().split("T")[0];
  for (const cat of categories) {
    if (!cat.legacyId || cat._count.posts === 0) continue;
    const lastmod = todayStr;
    for (const lang of langsForItems) {
      const loc = `${baseUrl}/${lang}/board.html?action=list&category=${cat.legacyId}`;
      urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
    }
  }

  // Individual board post read URLs → /{lang}/board.html?action=read&id=N
  const posts = await prisma.boardPost.findMany({
    where: { siteId: site.id, parentId: null, lang: primaryLang },
    select: { legacyId: true, regdate: true, updatedAt: true },
    orderBy: { legacyId: "desc" },
  });
  for (const post of posts) {
    if (!post.legacyId) continue;
    const lastmod = post.regdate && /^\d{4}-\d{2}-\d{2}/.test(post.regdate)
      ? post.regdate.substring(0, 10)
      : post.updatedAt.toISOString().split("T")[0];
    for (const lang of langsForItems) {
      const loc = `${baseUrl}/${lang}/board.html?action=read&id=${post.legacyId}`;
      urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
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
