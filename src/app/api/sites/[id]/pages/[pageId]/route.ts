import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncTemplateFromSiteIfLinked } from "@/lib/template-sync";

// GET /api/sites/[id]/pages/[pageId] — 페이지 상세 조회
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id, pageId } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { children: { orderBy: { sortOrder: "asc" } } },
  });

  if (!page || page.siteId !== id) {
    return NextResponse.json(
      { error: "페이지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json(page);
}

// PUT /api/sites/[id]/pages/[pageId] — 페이지 수정
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id, pageId } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const page = await prisma.page.findUnique({ where: { id: pageId } });

  if (!page || page.siteId !== id) {
    return NextResponse.json(
      { error: "페이지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const body = await request.json();
  const {
    title,
    slug,
    content,
    css,
    isHome,
    sortOrder,
    parentId,
    showInMenu,
    menuTitle,
    externalUrl,
  } = body;

  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return NextResponse.json(
      { error: "페이지 제목은 필수입니다." },
      { status: 400 }
    );
  }

  // parentId 유효성: 2depth 제한
  if (parentId !== undefined && parentId !== null) {
    const parent = await prisma.page.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.siteId !== id) {
      return NextResponse.json(
        { error: "부모 페이지를 찾을 수 없습니다." },
        { status: 400 }
      );
    }
    if (parent.parentId) {
      return NextResponse.json(
        { error: "2단계까지만 지원됩니다." },
        { status: 400 }
      );
    }
    // 자기 자신을 부모로 설정 불가
    if (parentId === pageId) {
      return NextResponse.json(
        { error: "자기 자신을 부모로 설정할 수 없습니다." },
        { status: 400 }
      );
    }
  }

  // slug 변경 시 중복 확인
  if (slug !== undefined && slug !== page.slug) {
    const existingPage = await prisma.page.findUnique({
      where: {
        siteId_slug_lang: { siteId: id, slug: slug.trim(), lang: page.lang },
      },
    });
    if (existingPage) {
      return NextResponse.json(
        { error: "이미 같은 슬러그의 페이지가 존재합니다." },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.page.update({
    where: { id: pageId },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(slug !== undefined && { slug: slug.trim() }),
      ...(content !== undefined && { content }),
      ...(css !== undefined && { css: css?.trim() || null }),
      ...(isHome !== undefined && { isHome }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(showInMenu !== undefined && { showInMenu }),
      ...(menuTitle !== undefined && { menuTitle: menuTitle?.trim() || null }),
      ...(externalUrl !== undefined && { externalUrl: externalUrl?.trim() || null }),
    },
  });

  // Auto-sync: if this page belongs to a template-storage site, push the
  // latest state back to the owning Template row so new sites created
  // from the template pick up the edit. No-op for regular user sites
  // and for callers not allowed to edit the linked template (enforced
  // inside the helper).
  let templateSync: Awaited<ReturnType<typeof syncTemplateFromSiteIfLinked>> = null;
  try {
    templateSync = await syncTemplateFromSiteIfLinked(id, session.user.email);
  } catch (e) {
    // Don't block the page save on a sync failure — just log and move on.
    console.error("[template-sync] page save auto-sync failed:", e);
  }

  return NextResponse.json({ ...updated, templateSync });
}

// DELETE /api/sites/[id]/pages/[pageId] — 페이지 삭제
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id, pageId } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: { children: true },
  });

  if (!page || page.siteId !== id) {
    return NextResponse.json(
      { error: "페이지를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // 하위 페이지가 있으면 상위로 올림 (parentId = null)
  if (page.children.length > 0) {
    await prisma.page.updateMany({
      where: { parentId: pageId },
      data: { parentId: null },
    });
  }

  await prisma.page.delete({ where: { id: pageId } });

  return NextResponse.json({ message: "페이지가 삭제되었습니다." });
}
