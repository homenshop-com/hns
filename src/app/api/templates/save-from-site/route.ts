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
      cssText: site.cssText ?? null,
      pagesSnapshot: site.pages as unknown as object,
      isPublic: false,
      isActive: true,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
