/**
 * POST /api/sitemap/[siteId]/refresh
 *
 * Sitemap "re-generation" button endpoint. The sitemap itself is already
 * dynamic (generated on every request from the live Pages table), so
 * there's nothing to rebuild server-side. What this endpoint actually
 * does:
 *
 *   1. Counts the URLs that WILL appear in the sitemap right now
 *   2. Computes max(Page.updatedAt) = "last modified"
 *   3. Pings IndexNow-compatible search engines (Bing, Yandex, Naver)
 *      if the site has a custom domain bound and IndexNow is configured
 *   4. Returns the stats so the dashboard can display them
 *
 * Google deprecated sitemap ping in 2023 — users must submit via GSC.
 * This endpoint gives a single click that covers the other major engines
 * and surfaces the live URL count as confidence-building feedback.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// IndexNow endpoints. All accept POST {host, key, keyLocation, urlList}
const INDEXNOW_TARGETS: Array<{ name: string; url: string }> = [
  { name: "Bing",    url: "https://www.bing.com/indexnow" },
  { name: "Yandex",  url: "https://yandex.com/indexnow" },
  { name: "Naver",   url: "https://searchadvisor.naver.com/indexnow" },
];

async function pingIndexNow(host: string, key: string, urls: string[]) {
  const results: Array<{ target: string; ok: boolean; status: number; error?: string }> = [];
  if (!key || urls.length === 0) return results;
  // keyLocation points at a fixed /indexnow-key.txt route served by
  // Next.js (or homenshop.com's public fallback) — search engines fetch
  // it to verify the key before accepting our URL submission.
  const body = JSON.stringify({
    host,
    key,
    keyLocation: `https://${host}/indexnow-key.txt`,
    urlList: urls.slice(0, 10000), // IndexNow caps at 10k per request
  });
  await Promise.all(
    INDEXNOW_TARGETS.map(async (t) => {
      try {
        const res = await fetch(t.url, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          signal: AbortSignal.timeout(8000),
        });
        results.push({ target: t.name, ok: res.ok, status: res.status });
      } catch (e) {
        results.push({ target: t.name, ok: false, status: 0, error: String((e as Error).message || e) });
      }
    }),
  );
  return results;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    select: {
      id: true,
      shopId: true,
      defaultLanguage: true,
      languages: true,
      domains: {
        where: { status: "ACTIVE" },
        select: { domain: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!site) return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });

  /* Count URLs that would appear in sitemap — same logic as the
   * sitemap generators: Pages + Board categories (with posts) +
   * individual BoardPosts + Products. */
  const activeLangs = new Set(site.languages?.length ? site.languages : [site.defaultLanguage]);
  const langsForItems = Array.from(activeLangs);
  const primaryLang = activeLangs.has(site.defaultLanguage) ? site.defaultLanguage : langsForItems[0];
  const skipSlugs = new Set(["empty", "user", "users", "agreement"]);

  const [pages, boardCats, boardPostCount, productCount] = await Promise.all([
    prisma.page.findMany({
      where: { siteId: site.id },
      select: { slug: true, lang: true, updatedAt: true, isHome: true },
    }),
    prisma.boardCategory.findMany({
      where: {
        siteId: site.id,
        lang: primaryLang,
        NOT: { name: { in: ["Default", "New Category"] } },
      },
      select: {
        legacyId: true,
        _count: { select: { posts: { where: { parentId: null } } } },
      },
    }),
    prisma.boardPost.count({
      where: { siteId: site.id, parentId: null, lang: primaryLang },
    }),
    prisma.product.count({ where: { siteId: site.id } }),
  ]);

  const eligiblePages = pages.filter(
    (p) => activeLangs.has(p.lang) && !skipSlugs.has(p.slug.toLowerCase()),
  );
  const eligibleCats = boardCats.filter(
    (c) => c.legacyId && c._count.posts > 0,
  );

  // URL counts: pages (lang-multiplied), + categories × langs,
  // + post × langs + product × langs
  const urlCount =
    eligiblePages.length +
    eligibleCats.length * langsForItems.length +
    boardPostCount * langsForItems.length +
    productCount * langsForItems.length;

  const pageLastMod = eligiblePages.length
    ? Math.max(...eligiblePages.map((p) => p.updatedAt.getTime()))
    : 0;
  const lastModified = pageLastMod ? new Date(pageLastMod).toISOString() : null;

  /* Submit to search engines if we have a custom domain + IndexNow key */
  const activeDomain = site.domains[0]?.domain || null;
  const indexNowKey = process.env.INDEXNOW_KEY || "";
  let submissions: Array<{ target: string; ok: boolean; status: number; error?: string }> = [];

  if (activeDomain && indexNowKey) {
    const baseUrl = `https://${activeDomain}`;
    const urlList: string[] = [];
    // Pages
    for (const p of eligiblePages) {
      const path = p.isHome ? `/${p.lang}/` : `/${p.lang}/${p.slug}.html`;
      urlList.push(`${baseUrl}${path}`);
    }
    // Board category list pages (primary-lang only to keep the submission
    // reasonable; per-lang alternates still appear in the sitemap)
    for (const c of eligibleCats) {
      urlList.push(`${baseUrl}/${primaryLang}/board.html?action=list&category=${c.legacyId}`);
    }
    // Individual board posts (primary-lang only, limited to 500 most recent
    // so large sites don't blow out IndexNow's 10k submission cap on one click)
    const recentPosts = await prisma.boardPost.findMany({
      where: { siteId: site.id, parentId: null, lang: primaryLang },
      select: { legacyId: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    for (const p of recentPosts) {
      if (p.legacyId) urlList.push(`${baseUrl}/${primaryLang}/board.html?action=read&id=${p.legacyId}`);
    }
    submissions = await pingIndexNow(activeDomain, indexNowKey, urlList);
  }

  return NextResponse.json({
    ok: true,
    urlCount,
    lastModified,
    sitemapUrl: activeDomain
      ? `https://${activeDomain}/sitemap.xml`
      : `https://homenshop.com/api/sitemap/${site.id}`,
    activeDomain,
    indexNowConfigured: Boolean(indexNowKey),
    submissions,
    gscSubmitUrl: activeDomain
      ? `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent("https://" + activeDomain + "/")}`
      : null,
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  // GET returns the same shape without pinging — used by the dashboard
  // to render the initial status line.
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { siteId } = await params;
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    select: {
      id: true,
      defaultLanguage: true,
      languages: true,
      domains: {
        where: { status: "ACTIVE" },
        select: { domain: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!site) return NextResponse.json({ error: "not_found_or_forbidden" }, { status: 404 });

  const activeLangs = new Set(site.languages?.length ? site.languages : [site.defaultLanguage]);
  const langsForItems = Array.from(activeLangs);
  const primaryLang = activeLangs.has(site.defaultLanguage) ? site.defaultLanguage : langsForItems[0];
  const skipSlugs = new Set(["empty", "user", "users", "agreement"]);
  const [pages, cats, postCount, productCount] = await Promise.all([
    prisma.page.findMany({
      where: { siteId: site.id },
      select: { slug: true, lang: true, updatedAt: true },
    }),
    prisma.boardCategory.findMany({
      where: {
        siteId: site.id,
        lang: primaryLang,
        NOT: { name: { in: ["Default", "New Category"] } },
      },
      select: { legacyId: true, _count: { select: { posts: { where: { parentId: null } } } } },
    }),
    prisma.boardPost.count({ where: { siteId: site.id, parentId: null, lang: primaryLang } }),
    prisma.product.count({ where: { siteId: site.id } }),
  ]);
  const eligiblePages = pages.filter(
    (p) => activeLangs.has(p.lang) && !skipSlugs.has(p.slug.toLowerCase()),
  );
  const eligibleCats = cats.filter((c) => c.legacyId && c._count.posts > 0);
  const urlCount =
    eligiblePages.length +
    eligibleCats.length * langsForItems.length +
    postCount * langsForItems.length +
    productCount * langsForItems.length;
  return NextResponse.json({
    urlCount,
    lastModified: eligiblePages.length
      ? new Date(Math.max(...eligiblePages.map((p) => p.updatedAt.getTime()))).toISOString()
      : null,
    activeDomain: site.domains[0]?.domain || null,
    indexNowConfigured: Boolean(process.env.INDEXNOW_KEY),
  });
}
