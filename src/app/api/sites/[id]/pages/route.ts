import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/sites/[id]/pages — 사이트 페이지 목록
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const lang = searchParams.get("lang");

  const pages = await prisma.page.findMany({
    where: {
      siteId: id,
      ...(lang ? { lang } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      children: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  return NextResponse.json(pages);
}

// POST /api/sites/[id]/pages — 새 페이지 생성
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    slug,
    content,
    css,
    isHome,
    lang,
    parentId,
    showInMenu,
    menuTitle,
    externalUrl,
  } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "페이지 제목은 필수입니다." },
      { status: 400 }
    );
  }

  // 외부 링크가 아닌 경우 slug 필수
  if (!externalUrl) {
    if (!slug || typeof slug !== "string" || slug.trim().length === 0) {
      return NextResponse.json(
        { error: "페이지 슬러그는 필수입니다." },
        { status: 400 }
      );
    }
  }

  const pageLang = lang || site.defaultLanguage;
  const pageSlug = externalUrl
    ? `ext-${Date.now()}`
    : slug.trim();

  // slug 중복 확인
  const existingPage = await prisma.page.findUnique({
    where: {
      siteId_slug_lang: { siteId: id, slug: pageSlug, lang: pageLang },
    },
  });

  if (existingPage) {
    return NextResponse.json(
      { error: "이미 같은 슬러그의 페이지가 존재합니다." },
      { status: 400 }
    );
  }

  // parentId 유효성: 2depth 제한
  if (parentId) {
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
  }

  // 최대 sortOrder 가져오기
  const maxOrder = await prisma.page.findFirst({
    where: { siteId: id, lang: pageLang },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const page = await prisma.page.create({
    data: {
      siteId: id,
      title: title.trim(),
      slug: pageSlug,
      lang: pageLang,
      content: content || null,
      css: css?.trim() || null,
      isHome: isHome || false,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      parentId: parentId || null,
      showInMenu: showInMenu !== false,
      menuTitle: menuTitle?.trim() || null,
      externalUrl: externalUrl?.trim() || null,
    },
  });

  return NextResponse.json(page, { status: 201 });
}
