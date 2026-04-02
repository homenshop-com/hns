import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { execSync } from "child_process";

const LEGACY_DATA_ROOT = "/var/www/legacy-data/userdata";

function sqliteQuery(dbPath: string, sql: string): Record<string, string>[] {
  try {
    const result = execSync(
      `python3 /var/www/homenshop-next/scripts/sqlite-query.py "${dbPath}"`,
      { timeout: 5000, encoding: "utf-8", input: sql, maxBuffer: 2 * 1024 * 1024 }
    );
    if (!result.trim()) return [];
    return JSON.parse(result);
  } catch {
    return [];
  }
}

function getDbPath(shopId: string): string | null {
  const safeId = shopId.replace(/[^a-zA-Z0-9_-]/g, "");
  const p = `${LEGACY_DATA_ROOT}/${safeId}/db/.sqlite3`;
  try {
    execSync(`test -f "${p}"`, { timeout: 1000 });
    return p;
  } catch {
    return null;
  }
}

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

  // Product & Board individual item URLs from SQLite
  const dbPath = getDbPath(site.shopId);
  if (dbPath) {
    const productPages = site.pages.filter(p => activeLangs.has(p.lang) && (p.slug === "product" || p.slug === "goods"));
    const boardPages = site.pages.filter(p => activeLangs.has(p.lang) && p.slug === "board");

    if (productPages.length > 0) {
      const products = sqliteQuery(dbPath, `SELECT id, pname, regdate FROM Product ORDER BY id DESC`);
      for (const prod of products) {
        for (const pp of productPages) {
          const loc = `${baseUrl}/${pp.lang}/${pp.slug}.html?action=read&id=${prod.id}`;
          const lastmod = prod.regdate ? prod.regdate.substring(0, 10) : pp.updatedAt.toISOString().split("T")[0];
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
      const posts = sqliteQuery(dbPath, `SELECT id, title, regdate FROM Board WHERE parent = 0 ORDER BY id DESC`);
      for (const post of posts) {
        for (const bp of boardPages) {
          const loc = `${baseUrl}/${bp.lang}/board.html?action=read&id=${post.id}`;
          const lastmod = post.regdate ? post.regdate.substring(0, 10) : bp.updatedAt.toISOString().split("T")[0];
          urls.push(`  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
        }
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
