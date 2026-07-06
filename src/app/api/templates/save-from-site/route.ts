import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canManageSite } from "@/lib/site-access";
import { rewriteAssetUrls } from "@/lib/template-parser";
import { randomBytes } from "crypto";
import { Prisma } from "@/generated/prisma/client";

/**
 * POST /api/templates/save-from-site
 *
 * Snapshots a site the user owns into a new private Template.
 *
 * Instead of pointing demoSiteId at the source site (which would tie the
 * template's future "디자인 수정" to the user's live account), we create a
 * dedicated hidden Site marked `isTemplateStorage = true` that is a full
 * clone of the source at snapshot time. The template owns that site; all
 * future edits to the template happen there, completely isolated from
 * the source.
 *
 * Request body: { siteId, name, description?, category?, thumbnailUrl? }
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

  // Ownership check + full page read
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
      // The REAL header/menu/footer live here (per lang, PC/tablet/mobile), not
      // in the Site.headerHtml columns (which are only a stale fallback). Must
      // be cloned or the template's header/footer come out empty/default.
      hmfTranslations: true,
    },
  });

  // Access via the manage scope, not strict owner: a reseller operator
  // managing this customer (their attributed member) must be able to save the
  // managed site as a template too — previously this threw "Not found" for
  // resellers. The new template + its hidden clone are created under
  // session.user.id below, so it lands in the acting user's own library
  // ("나의 템플릿"). canManageSite scopes a reseller to their own customers.
  if (!site || !(await canManageSite(siteId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (site.isTemplateStorage) {
    return NextResponse.json(
      { error: "템플릿 저장용 사이트는 다시 템플릿으로 저장할 수 없습니다." },
      { status: 400 }
    );
  }

  /**
   * Freeze relative `url(…)` assets against the source site's templatePath
   * so the clone (which will get its own `user-templates/…` path) still
   * resolves images and fonts correctly.
   */
  function assetBase(tplPath: string | null): string | null {
    if (!tplPath) return null;
    if (tplPath.startsWith("user-templates/")) {
      const tplId = tplPath.slice("user-templates/".length);
      return `/uploads/templates/${tplId}/files`;
    }
    return `/tpl/${tplPath}/files`;
  }
  function rewriteCssUrls(
    css: string | null,
    base: string | null
  ): string | null {
    if (!css || !base) return css ?? null;
    return css.replace(
      /url\(\s*['"]?(?!\/|https?:|data:)([^'")]+?)['"]?\s*\)/g,
      (_, filename: string) => `url(${base}/${filename})`
    );
  }

  const base = assetBase(site.templatePath);
  const frozenCss = rewriteCssUrls(site.cssText, base);

  // Freeze HMF (SiteHmf) HTML assets against the SOURCE templatePath so the
  // clone (which gets a NEW templatePath) still resolves the logo/images.
  // rewriteAssetUrls only rewrites relative `../files/` refs → absolute; paths
  // that are already absolute pass through unchanged and stay valid.
  const freezeHtml = (html: string | null): string | null =>
    html && site.templatePath ? rewriteAssetUrls(html, site.templatePath) : (html ?? null);
  const clonedHmf = site.hmfTranslations.map((h) => ({
    lang: h.lang,
    headerHtml: freezeHtml(h.headerHtml),
    menuHtml: freezeHtml(h.menuHtml),
    footerHtml: freezeHtml(h.footerHtml),
    tabletHeaderHtml: freezeHtml(h.tabletHeaderHtml),
    tabletMenuHtml: freezeHtml(h.tabletMenuHtml),
    tabletFooterHtml: freezeHtml(h.tabletFooterHtml),
    mobileHeaderHtml: freezeHtml(h.mobileHeaderHtml),
    mobileMenuHtml: freezeHtml(h.mobileMenuHtml),
    mobileFooterHtml: freezeHtml(h.mobileFooterHtml),
  }));
  // Default-lang HMF → the legacy Site.* + Template.* fallback columns (instead
  // of the stale site.headerHtml which is what caused the empty header/footer).
  const defHmf =
    site.hmfTranslations.find((h) => h.lang === site.defaultLanguage) ??
    site.hmfTranslations[0];
  const fbHeader = freezeHtml(defHmf?.headerHtml ?? site.headerHtml ?? null);
  const fbMenu = freezeHtml(defHmf?.menuHtml ?? site.menuHtml ?? null);
  const fbFooter = freezeHtml(defHmf?.footerHtml ?? site.footerHtml ?? null);

  // Unique paths/ids. shopId must be [a-z0-9-]{6..14} (NO server validation
  // on internal Prisma creates, but we keep the naming predictable).
  const tplToken = randomBytes(6).toString("hex"); // 12 hex chars
  const storageShopId = `tpl-${tplToken}`.slice(0, 20);
  const tplPath = `user-templates/u_${session.user.id}_${Date.now()}`;

  // Build the storage site's pages (clones) with CSS rewritten
  const clonedPages: Prisma.PageCreateWithoutSiteInput[] = site.pages.map(
    (p) => ({
      title: p.title,
      slug: p.slug,
      lang: p.lang,
      content: (p.content ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      css: rewriteCssUrls(p.css, base),
      sortOrder: p.sortOrder,
      isHome: p.isHome,
      parentId: p.parentId,
      depth: p.depth,
      showInMenu: p.showInMenu,
      menuTitle: p.menuTitle,
      menuType: p.menuType,
      externalUrl: p.externalUrl,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      seoKeywords: p.seoKeywords,
      ogImage: p.ogImage,
    })
  );

  // Also keep a JSON snapshot (used when other users instantiate this template)
  const pagesSnapshotForTemplate = site.pages.map((p) => ({
    title: p.title,
    slug: p.slug,
    content: p.content,
    css: rewriteCssUrls(p.css, base),
    lang: p.lang,
    sortOrder: p.sortOrder,
    isHome: p.isHome,
    showInMenu: p.showInMenu,
  }));

  // Create storage site + Template atomically
  const [storageSite, template] = await prisma.$transaction(async (tx) => {
    const storage = await tx.site.create({
      data: {
        userId: session.user.id,
        shopId: storageShopId,
        name: name.trim(),
        description: description?.trim() || null,
        defaultLanguage: site.defaultLanguage,
        languages: site.languages,
        templateId: null,
        templatePath: tplPath,
        headerHtml: fbHeader,
        menuHtml: fbMenu,
        footerHtml: fbFooter,
        cssText: frozenCss ?? null,
        published: false,
        accountType: site.accountType,
        isTemplateStorage: true,
        pages: { create: clonedPages },
        // Clone the per-lang SiteHmf rows — the actual header/menu/footer the
        // editor & publisher read (site.hmfTranslations, not Site.headerHtml).
        hmfTranslations: { create: clonedHmf },
      },
    });

    const tpl = await tx.template.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        path: tplPath,
        description: description?.trim() || null,
        category: (category?.trim() || "custom").slice(0, 50),
        thumbnailUrl: thumbnailUrl?.trim() || null,
        headerHtml: fbHeader,
        menuHtml: fbMenu,
        footerHtml: fbFooter,
        cssText: frozenCss ?? null,
        pagesSnapshot: pagesSnapshotForTemplate as unknown as object,
        demoSiteId: storage.id,
        isPublic: false,
        isActive: true,
      },
    });

    return [storage, tpl];
  });

  return NextResponse.json(
    { template, storageSiteId: storageSite.id },
    { status: 201 }
  );
}
