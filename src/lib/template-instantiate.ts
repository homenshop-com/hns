/**
 * Core "create a Site from a Template" logic, shared by:
 *   - POST /api/sites/create-from-template        (member self-serve)
 *   - POST /api/admin/sites/create-from-template  (admin creates for a member)
 *
 * Auth, ownership, and quota policy live in the routes (they differ:
 * members are capped at 5 free sites, admins aren't). This function owns
 * the shopId validation, template load, page-building, Site.create, and
 * demo-data seeding so both paths stay byte-for-byte identical.
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  parseTemplatePages,
  readTemplateCss,
  rewriteAssetUrls,
} from "@/lib/template-parser";
import { freeSiteDefaults } from "@/lib/site-expiration";

export type InstantiateResult =
  | { ok: true; site: Awaited<ReturnType<typeof prisma.site.create>> }
  | { ok: false; status: number; error: string };

interface SnapshotPage {
  slug: string;
  title: string;
  content: unknown;
  css?: string | null;
  lang?: string;
  sortOrder?: number;
  isHome?: boolean;
  showInMenu?: boolean;
}

export async function instantiateSiteFromTemplate(opts: {
  userId: string;
  templateId: string;
  shopId: string;
  defaultLanguage?: string;
  /** Admin callers may instantiate any template (including another user's
   *  private one). User-facing callers MUST leave this false/undefined. */
  allowPrivate?: boolean;
}): Promise<InstantiateResult> {
  const { userId, templateId, shopId } = opts;

  if (!templateId) return { ok: false, status: 400, error: "templateId is required" };
  if (!shopId) return { ok: false, status: 400, error: "shopId is required" };

  // shopId: 6-14 chars, start/end alphanumeric, hyphens allowed in between.
  if (!/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId)) {
    return { ok: false, status: 400, error: "shopId format invalid" };
  }

  const existingShop = await prisma.site.findUnique({ where: { shopId } });
  if (existingShop) {
    return { ok: false, status: 409, error: "shopId already taken" };
  }

  const template = await prisma.template.findUnique({ where: { id: templateId } });
  if (!template || !template.isActive) {
    return { ok: false, status: 404, error: "Template not found" };
  }
  // Access control: only PUBLIC (system/marketplace) templates or the caller's
  // OWN template may be instantiated. Without this, any authenticated user could
  // clone another account's PRIVATE save-from-site template — which snapshots
  // that site's full page HTML/CSS plus linked board/product rows. Admin route
  // passes allowPrivate for legitimate cross-account use.
  if (!opts.allowPrivate && !template.isPublic && template.userId !== userId) {
    return { ok: false, status: 403, error: "이 템플릿을 사용할 권한이 없습니다." };
  }

  // DB-backed CSS wins; fall back to legacy disk default.css for factory templates.
  const hasDbCss = !!(template.cssText && template.cssText.length > 0);
  const templateCss = hasDbCss
    ? (template.cssText as string)
    : readTemplateCss(template.path);

  const snapshot = Array.isArray(template.pagesSnapshot)
    ? (template.pagesSnapshot as unknown as SnapshotPage[])
    : null;

  const targetLang: string = opts.defaultLanguage || "ko";

  let pageData: Prisma.PageCreateWithoutSiteInput[];

  if (snapshot && snapshot.length > 0) {
    const snapshotLangs = new Set<string>();
    for (const p of snapshot) {
      const l = typeof p.lang === "string" ? p.lang : null;
      if (l) snapshotLangs.add(l);
    }
    const targetInSnapshot = snapshotLangs.has(targetLang);

    if (targetInSnapshot) {
      pageData = snapshot.map((p, index) => ({
        title: p.title,
        slug: p.slug,
        lang: p.lang ?? targetLang,
        isHome: p.isHome ?? p.slug === "index",
        showInMenu: p.showInMenu ?? true,
        sortOrder: p.sortOrder ?? index,
        content: (p.content ?? { html: "" }) as Prisma.InputJsonValue,
        css: p.css ?? null,
      }));
    } else {
      const sourceLang = Array.from(snapshotLangs)[0] ?? targetLang;
      const sourcePages = snapshot.filter((p) => (p.lang ?? sourceLang) === sourceLang);
      pageData = sourcePages.map((p, index) => ({
        title: p.title,
        slug: p.slug,
        lang: targetLang,
        isHome: p.isHome ?? p.slug === "index",
        showInMenu: p.showInMenu ?? true,
        sortOrder: p.sortOrder ?? index,
        content: (p.content ?? { html: "" }) as Prisma.InputJsonValue,
        css: p.css ?? null,
      }));
    }
  } else {
    const templatePages = parseTemplatePages(template.path);
    pageData = templatePages.map((page, index) => ({
      title: page.title,
      slug: page.slug,
      lang: targetLang,
      isHome: page.slug === "index",
      showInMenu: page.showInMenu !== false,
      sortOrder: index,
      content: { html: rewriteAssetUrls(page.bodyHtml, template.path) } as Prisma.InputJsonValue,
    }));
  }

  const siteLanguages = Array.from(new Set(pageData.map((p) => p.lang ?? targetLang)));

  const site = await prisma.site.create({
    data: {
      userId,
      shopId,
      name: template.name,
      defaultLanguage: targetLang,
      languages: siteLanguages,
      templateId: template.id,
      templatePath: template.path,
      headerHtml: template.headerHtml || null,
      menuHtml: template.menuHtml || null,
      footerHtml: template.footerHtml || null,
      cssText: templateCss || null,
      ...freeSiteDefaults(),
      pages: { create: pageData },
    },
    include: { pages: { orderBy: { sortOrder: "asc" } } },
  });

  // Seed curated demo data from the template's storage site, if any.
  const demoSiteId = template.demoSiteId;
  if (demoSiteId) {
    try {
      const [demoCats, demoPosts, demoProducts] = await Promise.all([
        prisma.boardCategory.findMany({ where: { siteId: demoSiteId } }),
        prisma.boardPost.findMany({ where: { siteId: demoSiteId } }),
        prisma.product.findMany({ where: { siteId: demoSiteId } }),
      ]);

      const catIdMap = new Map<string, string>();
      for (const c of demoCats) {
        const created = await prisma.boardCategory.create({
          data: {
            siteId: site.id,
            legacyId: c.legacyId,
            lang: c.lang,
            name: c.name,
            defaultKey: c.defaultKey,
            replyMode: c.replyMode,
            writeMode: c.writeMode,
            rowsPerPage: c.rowsPerPage,
            titleLen: c.titleLen,
            imgWidth: c.imgWidth,
            imgHeight: c.imgHeight,
            listStyle: c.listStyle,
          },
          select: { id: true },
        });
        catIdMap.set(c.id, created.id);
      }

      if (demoPosts.length > 0) {
        await prisma.boardPost.createMany({
          data: demoPosts.map((p) => ({
            siteId: site.id,
            categoryId: p.categoryId ? catIdMap.get(p.categoryId) || null : null,
            legacyId: p.legacyId,
            lang: p.lang,
            author: p.author,
            title: p.title,
            content: p.content,
            photos: p.photos,
            views: p.views,
            isNotice: p.isNotice,
            isPublic: p.isPublic,
            regdate: p.regdate,
          })),
          skipDuplicates: true,
        });
      }

      if (demoProducts.length > 0) {
        await prisma.product.createMany({
          data: demoProducts.map((p) => ({
            siteId: site.id,
            legacyId: p.legacyId,
            lang: p.lang,
            name: p.name,
            description: p.description,
            price: p.price,
            salePrice: p.salePrice,
            stock: p.stock,
            category: p.category,
            images: p.images === null ? Prisma.JsonNull : (p.images as Prisma.InputJsonValue),
            photos: p.photos,
            specification: p.specification,
            status: p.status,
            sortOrder: p.sortOrder,
          })),
          skipDuplicates: true,
        });
      }
    } catch (e) {
      console.error("[instantiate-from-template] demo seed failed:", e);
    }
  }

  await prisma.template.update({
    where: { id: templateId },
    data: { clicks: { increment: 1 } },
  });

  return { ok: true, site };
}
