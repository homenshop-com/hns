import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/pages?siteId=xxx&lang=xx - List pages for a site
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const where: Record<string, unknown> = { siteId };
  const lang = searchParams.get("lang");
  if (lang) where.lang = lang;

  const pages = await prisma.page.findMany({
    where,
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

  return NextResponse.json({ pages });
}

// POST /api/pages - Create a new page
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { siteId, title, slug, lang, parentId, menuType, externalUrl, showInMenu } = body;

  if (!siteId || !title || !slug) {
    return NextResponse.json({ error: "siteId, title, slug required" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pageLang = lang || "ko";
  const cleanSlug = slug.replace(/\.html$/, "");

  // Check slug uniqueness within site+lang
  const existing = await prisma.page.findUnique({
    where: { siteId_slug_lang: { siteId, slug: cleanSlug, lang: pageLang } },
  });
  if (existing) {
    return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
  }

  // Validate parentId if provided (must exist, must be top-level, same lang)
  if (parentId) {
    const parent = await prisma.page.findUnique({ where: { id: parentId } });
    if (!parent || parent.siteId !== siteId || parent.lang !== pageLang) {
      return NextResponse.json({ error: "Invalid parent" }, { status: 400 });
    }
    if (parent.parentId) {
      return NextResponse.json({ error: "Maximum 2-depth exceeded" }, { status: 400 });
    }
  }

  // Get max sortOrder
  const maxPage = await prisma.page.findFirst({
    where: { siteId, lang: pageLang },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const page = await prisma.page.create({
    data: {
      siteId,
      title,
      slug: cleanSlug,
      lang: pageLang,
      sortOrder: (maxPage?.sortOrder ?? -1) + 1,
      parentId: parentId || null,
      menuType: menuType || "page",
      externalUrl: externalUrl || null,
      showInMenu: showInMenu !== undefined ? showInMenu : true,
      content: { html: "" },
    },
  });

  return NextResponse.json({ page }, { status: 201 });
}

// PUT /api/pages - Batch update sort orders
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, pages } = await request.json();
  if (!siteId || !Array.isArray(pages)) {
    return NextResponse.json({ error: "siteId and pages[] required" }, { status: 400 });
  }

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction(
    pages.map((p: { id: string; sortOrder: number; parentId?: string | null }) => {
      const data: Record<string, unknown> = { sortOrder: p.sortOrder };
      if (p.parentId !== undefined) data.parentId = p.parentId;
      return prisma.page.update({
        where: { id: p.id },
        data,
      });
    })
  );

  return NextResponse.json({ ok: true });
}
