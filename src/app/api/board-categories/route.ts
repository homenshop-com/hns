import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getSite(userId: string) {
  return prisma.site.findFirst({ where: { userId } });
}

// GET
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const categories = await prisma.boardCategory.findMany({
    where: { siteId: site.id },
    orderBy: { legacyId: "asc" },
    include: { _count: { select: { posts: { where: { parentId: null } } } } },
  });

  const rows = categories.map((c) => ({
    id: c.legacyId ?? 0,
    pgId: c.id,
    lang: c.lang,
    category: c.name,
    post_count: c._count.posts,
    rows: c.rowsPerPage,
    list_style: c.listStyle,
    reply: c.replyMode,
    write: c.writeMode,
    title_len: c.titleLen,
    img_w: c.imgWidth,
    img_h: c.imgHeight,
  }));

  return NextResponse.json({ categories: rows, defaultLanguage: site.defaultLanguage });
}

// POST — create
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { category, lang } = body;
  if (!category || !lang) return NextResponse.json({ error: "category and lang required" }, { status: 400 });

  // Find next legacyId for this site
  const maxCat = await prisma.boardCategory.findFirst({
    where: { siteId: site.id },
    orderBy: { legacyId: "desc" },
    select: { legacyId: true },
  });
  const nextLegacyId = (maxCat?.legacyId ?? 0) + 1;

  await prisma.boardCategory.create({
    data: { siteId: site.id, legacyId: nextLegacyId, lang, name: category },
  });

  return NextResponse.json({ success: true });
}

// PUT — update
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { id, category, rows: numRows, list_style } = body;
  if (!id || !category) return NextResponse.json({ error: "id and category required" }, { status: 400 });

  const legacyId = parseInt(id);
  const cat = await prisma.boardCategory.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { name: category };
  if (numRows !== undefined) data.rowsPerPage = parseInt(numRows) || 20;
  if (list_style !== undefined) data.listStyle = parseInt(list_style) || 0;

  await prisma.boardCategory.update({ where: { id: cat.id }, data });
  return NextResponse.json({ success: true });
}

// DELETE
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const legacyId = parseInt(id);
  const cat = await prisma.boardCategory.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cnt = await prisma.boardPost.count({ where: { categoryId: cat.id } });
  if (cnt > 0) {
    return NextResponse.json({ error: `이 카테고리에 ${cnt}개의 게시물이 있어 삭제할 수 없습니다.` }, { status: 400 });
  }

  await prisma.boardCategory.delete({ where: { id: cat.id } });
  return NextResponse.json({ success: true });
}
