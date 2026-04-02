import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/sites/[id]/sync-pages
 *
 * 기본 언어 페이지를 다른 활성 언어에 동기화합니다.
 * - 기본 언어에 있지만 대상 언어에 없는 페이지를 자동 생성
 * - slug 기준으로 매칭하여 이미 존재하는 페이지는 건너뜀
 * - parentId 관계도 slug 기준으로 매핑하여 유지
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const siteLanguages = site.languages || ["ko"];
  const defaultLang = site.defaultLanguage || "ko";
  const defaultPages = site.pages
    .filter((p) => p.lang === defaultLang)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (defaultPages.length === 0) {
    return NextResponse.json({ synced: 0, message: "No default language pages to sync" });
  }

  let totalSynced = 0;

  for (const targetLang of siteLanguages) {
    if (targetLang === defaultLang) continue;

    const existingTargetPages = site.pages.filter((p) => p.lang === targetLang);
    const existingSlugs = new Set(existingTargetPages.map((p) => p.slug));

    const pagesToCreate = defaultPages.filter((p) => !existingSlugs.has(p.slug));
    if (pagesToCreate.length === 0) continue;

    // Build slug→id map for existing target lang pages (for parentId mapping)
    const targetSlugToId = new Map<string, string>();
    for (const p of existingTargetPages) {
      targetSlugToId.set(p.slug, p.id);
    }

    // Build default page id→slug map (for parentId resolution)
    const defaultIdToSlug = new Map<string, string>();
    for (const p of defaultPages) {
      defaultIdToSlug.set(p.id, p.slug);
    }

    // First pass: create top-level pages (no parent)
    const topLevel = pagesToCreate.filter((p) => !p.parentId);
    for (const p of topLevel) {
      const created = await prisma.page.create({
        data: {
          siteId: site.id,
          title: p.title,
          slug: p.slug,
          lang: targetLang,
          sortOrder: p.sortOrder,
          isHome: p.isHome,
          showInMenu: p.showInMenu,
          menuTitle: p.menuTitle,
          menuType: p.menuType,
          externalUrl: p.externalUrl,
          content: p.content ?? { html: "" },
          css: p.css,
        },
      });
      targetSlugToId.set(p.slug, created.id);
      totalSynced++;
    }

    // Second pass: create child pages with mapped parentId
    const children = pagesToCreate.filter((p) => p.parentId);
    for (const p of children) {
      const parentSlug = p.parentId ? defaultIdToSlug.get(p.parentId) : null;
      const mappedParentId = parentSlug ? targetSlugToId.get(parentSlug) || null : null;

      const created = await prisma.page.create({
        data: {
          siteId: site.id,
          title: p.title,
          slug: p.slug,
          lang: targetLang,
          sortOrder: p.sortOrder,
          isHome: p.isHome,
          parentId: mappedParentId,
          showInMenu: p.showInMenu,
          menuTitle: p.menuTitle,
          menuType: p.menuType,
          externalUrl: p.externalUrl,
          content: p.content ?? { html: "" },
          css: p.css,
        },
      });
      targetSlugToId.set(p.slug, created.id);
      totalSynced++;
    }
  }

  // Return updated pages list
  const updatedPages = await prisma.page.findMany({
    where: { siteId: site.id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      slug: true,
      lang: true,
      sortOrder: true,
      isHome: true,
      parentId: true,
      showInMenu: true,
      menuTitle: true,
      menuType: true,
      externalUrl: true,
      seoTitle: true,
      seoDescription: true,
      seoKeywords: true,
      ogImage: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ synced: totalSynced, pages: updatedPages });
}
