import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import {
  parseTemplatePages,
  readTemplateCss,
  rewriteAssetUrls,
} from "@/lib/template-parser";
import { freeSiteDefaults } from "@/lib/site-expiration";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId, shopId, defaultLanguage } = await request.json();
  if (!templateId) {
    return NextResponse.json(
      { error: "templateId is required" },
      { status: 400 }
    );
  }
  if (!shopId) {
    return NextResponse.json(
      { error: "shopId is required" },
      { status: 400 }
    );
  }

  // Validate shopId format: 6-14 chars, start/end with alphanumeric, allow hyphens
  if (!/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId)) {
    return NextResponse.json(
      { error: "shopId format invalid" },
      { status: 400 }
    );
  }

  // Check free site limit (max 5) — exclude hidden template-storage sites
  const siteCount = await prisma.site.count({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  if (siteCount >= 5) {
    return NextResponse.json(
      { error: "Maximum 5 free sites allowed" },
      { status: 409 }
    );
  }

  // Check if shopId is already taken
  const existingShop = await prisma.site.findUnique({
    where: { shopId },
  });

  if (existingShop) {
    return NextResponse.json(
      { error: "shopId already taken" },
      { status: 409 }
    );
  }

  // Get the template
  const template = await prisma.template.findUnique({
    where: { id: templateId },
  });

  if (!template || !template.isActive) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // DB-backed content takes precedence over disk. This covers:
  //   - Custom (user-made) templates — cssText populated by save-from-site
  //   - System templates authored directly in the DB (no disk files)
  // Fall back to reading the legacy tpl/*/files/default.css when the
  // template has no DB cssText (factory templates from the PHP era).
  const hasDbCss = !!(template.cssText && template.cssText.length > 0);
  const templateCss = hasDbCss
    ? (template.cssText as string)
    : readTemplateCss(template.path);

  // Prefer pagesSnapshot (DB snapshot of another site) when present; fall
  // back to disk-based template parsing for legacy / system templates.
  type SnapshotPage = {
    slug: string;
    title: string;
    content: unknown;
    css?: string | null;
    lang?: string;
    sortOrder?: number;
    isHome?: boolean;
    showInMenu?: boolean;
  };
  const snapshot = Array.isArray(template.pagesSnapshot)
    ? (template.pagesSnapshot as unknown as SnapshotPage[])
    : null;

  const targetLang: string = (defaultLanguage as string) || "ko";

  let pageData: Prisma.PageCreateWithoutSiteInput[];

  if (snapshot && snapshot.length > 0) {
    // Languages actually present in the snapshot.
    const snapshotLangs = new Set<string>();
    for (const p of snapshot) {
      const l = typeof p.lang === "string" ? p.lang : null;
      if (l) snapshotLangs.add(l);
    }

    const targetInSnapshot = snapshotLangs.has(targetLang);

    if (targetInSnapshot) {
      // Keep snapshot pages as-is (their lang already matches the user's
      // pick, or this is a multi-language snapshot — copy everything).
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
      // The user picked a language the template wasn't authored in.
      // Relabel the template's primary-language pages to the requested
      // language so the new site has a working set of pages to translate
      // (instead of an empty `/{targetLang}/` namespace).
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
    pageData = templatePages.map((page, index) => {
      const bodyHtml = rewriteAssetUrls(page.bodyHtml, template.path);
      return {
        title: page.title,
        slug: page.slug,
        lang: targetLang,
        isHome: page.slug === "index",
        showInMenu: page.showInMenu !== false,
        sortOrder: index,
        content: { html: bodyHtml } as Prisma.InputJsonValue,
      };
    });
  }

  // Compute the languages array for the Site row from what we actually
  // created (so the URL router knows which prefixes are valid).
  const siteLanguages = Array.from(new Set(pageData.map((p) => p.lang ?? targetLang)));

  // Create site with template content
  const site = await prisma.site.create({
    data: {
      userId: session.user.id,
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
      pages: {
        create: pageData,
      },
    },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  // Seed sample data from the template's demoSite (if any). This carries
  // over the curated demo Products / BoardCategories / BoardPosts that
  // make the new site immediately useful — otherwise the user lands on a
  // beautifully styled but empty catalog & board. The user can delete or
  // replace any of it from the dashboard. We only copy when the demoSite
  // has data; silent no-op otherwise.
  const demoSiteId = template.demoSiteId;
  if (demoSiteId) {
    try {
      const [demoCats, demoPosts, demoProducts] = await Promise.all([
        prisma.boardCategory.findMany({ where: { siteId: demoSiteId } }),
        prisma.boardPost.findMany({ where: { siteId: demoSiteId } }),
        prisma.product.findMany({ where: { siteId: demoSiteId } }),
      ]);

      // Categories first — keep map of demo→new id so posts can be
      // re-pointed at the new site's categories.
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
      // Don't bail the whole instantiation if seed-from-demo fails — log
      // and continue. Site + Pages are already committed.
      console.error("[create-from-template] demo seed failed:", e);
    }
  }

  // Increment template click count
  await prisma.template.update({
    where: { id: templateId },
    data: { clicks: { increment: 1 } },
  });

  return NextResponse.json({ site });
}
