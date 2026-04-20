import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/sites/[id]/sync-menu-visibility
 *
 * Sync `Page.showInMenu` with the slugs actually rendered in the
 * canvas header/menu HTML.
 *
 * Background: pages and the header menu drift. After migration or
 * template reset, a site may have 16 pages (user, users, empty,
 * aggrement, ...) while the canvas <ul><li> only shows 6. Without
 * this sync, toggling "메뉴에 표시" has no visible effect and
 * admins end up tweaking flags for pages that were never going to
 * render.
 *
 * Approach: extract `href` values from every `<a>` in the site's
 * header/menu HTML (per language via SiteHmf; fallback to the
 * Site.menuHtml / headerHtml globals), normalize each href to a
 * slug, and set `showInMenu = true` only for pages whose slug is
 * in that set. Pages with `isHome: true` are kept as showInMenu
 * (they correspond to `/` which has no slug in the href).
 */

// Extract slugs from `<a href="...">` in a chunk of HTML.
// Accepts `/slug`, `/ko/slug`, `./slug`, `slug.html`, absolute URLs.
function extractSlugs(html: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!html) return out;
  // Match any <a ... href="..."> with either quoting.
  const re = /<a\b[^>]*\bhref\s*=\s*(['"])([^'"]+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[2].trim();
    if (!raw || raw.startsWith("#") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) continue;

    // Strip query/hash and leading protocol/host.
    let path = raw.split("#")[0].split("?")[0];
    try {
      if (/^https?:\/\//i.test(path)) {
        path = new URL(path).pathname;
      }
    } catch {
      /* ignore malformed URL */
    }

    // Strip `.html` / `.php` suffix.
    path = path.replace(/\.(html?|php)$/i, "");

    // Remove leading `./` or `/`.
    path = path.replace(/^\.?\//, "");

    // Strip a leading lang segment (ko/en/ja/zh-cn/es) — we match by slug
    // across languages; the menu may link to `/en/contact` for example.
    path = path.replace(/^(ko|en|ja|zh-cn|es)\//i, "");

    // After stripping, take the FIRST path segment as the slug.
    // Nested routes (e.g. `product/123`) still count as "product".
    const seg = path.split("/")[0].trim();
    if (!seg) continue;
    out.add(seg.toLowerCase());
  }
  return out;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: { orderBy: { sortOrder: "asc" } },
      hmfTranslations: true,
    },
  });
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Collect slugs per language — language-scoped sync lets a page
  // hidden in the EN menu stay visible in the KO menu.
  const slugsByLang = new Map<string, Set<string>>();

  // Default/global menu (applies to any language without its own SiteHmf).
  const globalSlugs = new Set<string>([
    ...extractSlugs(site.headerHtml),
    ...extractSlugs(site.menuHtml),
  ]);

  for (const hmf of site.hmfTranslations) {
    const langSlugs = new Set<string>([
      ...extractSlugs(hmf.headerHtml),
      ...extractSlugs(hmf.menuHtml),
    ]);
    // If a per-lang HMF exists but has no menu items (rare but possible),
    // fall back to the global set rather than hiding everything.
    slugsByLang.set(hmf.lang, langSlugs.size > 0 ? langSlugs : globalSlugs);
  }

  // Decide which slug set to apply per page.
  const updates: { id: string; showInMenu: boolean }[] = [];
  for (const page of site.pages) {
    // Home pages always stay visible — their href is `/`, not a slug.
    if (page.isHome) {
      if (!page.showInMenu) updates.push({ id: page.id, showInMenu: true });
      continue;
    }
    // External-only menu items (no corresponding page slug to match)
    // — respect the existing flag, we can't verify them from HTML.
    if (page.externalUrl) continue;

    const langSet = slugsByLang.get(page.lang) ?? globalSlugs;
    const shouldShow = langSet.has(page.slug.toLowerCase());
    if (page.showInMenu !== shouldShow) {
      updates.push({ id: page.id, showInMenu: shouldShow });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({
      synced: 0,
      total: site.pages.length,
      message: "모든 페이지의 메뉴 표시 상태가 이미 캔버스와 동기화되어 있습니다.",
    });
  }

  // Apply in a single transaction so the UI sees a consistent result.
  await prisma.$transaction(
    updates.map((u) =>
      prisma.page.update({
        where: { id: u.id },
        data: { showInMenu: u.showInMenu },
      }),
    ),
  );

  return NextResponse.json({
    synced: updates.length,
    total: site.pages.length,
    hiddenCount: updates.filter((u) => !u.showInMenu).length,
    shownCount: updates.filter((u) => u.showInMenu).length,
  });
}
