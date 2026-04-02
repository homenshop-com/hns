import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/pages/[pageId]
export async function GET(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await params;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { site: { select: { userId: true } } },
  });

  if (!page || page.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ page });
}

// PUT /api/pages/[pageId] - Update page details
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await params;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { site: { select: { userId: true, id: true } } },
  });

  if (!page || page.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const updateData: Record<string, unknown> = {};

  if (body.title !== undefined) updateData.title = body.title;
  if (body.slug !== undefined) {
    const newSlug = body.slug.replace(/\.html$/, "");
    const existing = await prisma.page.findUnique({
      where: { siteId_slug_lang: { siteId: page.siteId, slug: newSlug, lang: page.lang } },
    });
    if (existing && existing.id !== pageId) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    updateData.slug = newSlug;
  }
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;
  if (body.isHome !== undefined) updateData.isHome = body.isHome;

  // Menu fields
  if (body.showInMenu !== undefined) updateData.showInMenu = body.showInMenu;
  if (body.menuTitle !== undefined) updateData.menuTitle = body.menuTitle;
  if (body.menuType !== undefined) updateData.menuType = body.menuType;
  if (body.externalUrl !== undefined) updateData.externalUrl = body.externalUrl;

  // Parent/hierarchy
  if (body.parentId !== undefined) {
    if (body.parentId && body.parentId !== "") {
      // Validate: not self, parent must be top-level
      if (body.parentId === pageId) {
        return NextResponse.json({ error: "Cannot be own parent" }, { status: 400 });
      }
      const parent = await prisma.page.findUnique({ where: { id: body.parentId } });
      if (!parent || parent.parentId) {
        return NextResponse.json({ error: "Invalid parent (max 2-depth)" }, { status: 400 });
      }
      updateData.parentId = body.parentId;
    } else {
      updateData.parentId = null;
    }
  }

  // SEO fields
  if (body.seoTitle !== undefined) updateData.seoTitle = body.seoTitle || null;
  if (body.seoDescription !== undefined) updateData.seoDescription = body.seoDescription || null;
  if (body.seoKeywords !== undefined) updateData.seoKeywords = body.seoKeywords || null;
  if (body.ogImage !== undefined) updateData.ogImage = body.ogImage || null;

  const updated = await prisma.page.update({
    where: { id: pageId },
    data: updateData,
  });

  return NextResponse.json({ page: updated });
}

// DELETE /api/pages/[pageId]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pageId } = await params;
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { site: { select: { userId: true } } },
  });

  if (!page || page.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (page.isHome) {
    return NextResponse.json({ error: "Cannot delete home page" }, { status: 400 });
  }

  // Promote children to top-level before deleting
  await prisma.page.updateMany({
    where: { parentId: pageId },
    data: { parentId: null },
  });

  await prisma.page.delete({ where: { id: pageId } });

  return NextResponse.json({ ok: true });
}
