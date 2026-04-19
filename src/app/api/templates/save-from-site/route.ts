import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/templates/save-from-site
 *
 * Snapshots a site the user owns into a new private Template ("나의 템플릿").
 * Captures header/menu/footer HTML, CSS, and a JSON snapshot of all pages.
 *
 * Request body: { siteId: string, name: string, description?: string, category?: string, thumbnailUrl?: string }
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    siteId?: string;
    name?: string;
    description?: string;
    category?: string;
    thumbnailUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { siteId, name, description, category, thumbnailUrl } = body;

  if (!siteId || typeof siteId !== "string") {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "템플릿 이름은 필수입니다." },
      { status: 400 }
    );
  }
  if (name.trim().length > 100) {
    return NextResponse.json(
      { error: "템플릿 이름은 100자 이하여야 합니다." },
      { status: 400 }
    );
  }

  // Ownership check
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
        select: {
          slug: true,
          title: true,
          content: true,
          css: true,
          lang: true,
          sortOrder: true,
          isHome: true,
          showInMenu: true,
        },
      },
    },
  });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  /**
   * CSS `url(hero-bg.png)` etc. are stored as bare filenames in Site.cssText.
   * The published renderer and editor both resolve those at display time
   * against the site's own `templatePath` (e.g. `/tpl/personal/.../files/`).
   *
   * When we snapshot into a new Template, the resulting sites get a
   * different templatePath (`user-templates/...`) where those assets don't
   * exist — background images silently break.
   *
   * Fix: bake the ORIGINAL templatePath into the CSS so snapshotted copies
   * continue to point at the source template's assets.
   */
  function assetBase(tplPath: string | null): string | null {
    if (!tplPath) return null;
    if (tplPath.startsWith("user-templates/")) {
      const tplId = tplPath.slice("user-templates/".length);
      return `/uploads/templates/${tplId}/files`;
    }
    return `/tpl/${tplPath}/files`;
  }

  function rewriteCssUrls(css: string | null, base: string | null): string | null {
    if (!css || !base) return css ?? null;
    return css.replace(
      /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
      (_, filename: string) => `url(${base}/${filename})`
    );
  }

  const base = assetBase(site.templatePath);
  const frozenCss = rewriteCssUrls(site.cssText, base);
  const frozenPages = site.pages.map((p) => ({
    ...p,
    css: rewriteCssUrls(p.css, base),
  }));

  // Generate unique template path (owner-scoped)
  const tplPath = `user-templates/u_${session.user.id}_${Date.now()}`;

  const template = await prisma.template.create({
    data: {
      userId: session.user.id,
      name: name.trim(),
      path: tplPath,
      description: description?.trim() || null,
      category: (category?.trim() || "custom").slice(0, 50),
      thumbnailUrl: thumbnailUrl?.trim() || null,
      headerHtml: site.headerHtml ?? null,
      menuHtml: site.menuHtml ?? null,
      footerHtml: site.footerHtml ?? null,
      cssText: frozenCss ?? null,
      pagesSnapshot: frozenPages as unknown as object,
      // Remember which site this was snapshotted from so "디자인 수정" can
      // open the live editor for it.
      demoSiteId: site.id,
      isPublic: false,
      isActive: true,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
