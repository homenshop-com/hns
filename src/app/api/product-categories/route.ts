import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getSite(userId: string) {
  return prisma.site.findFirst({ where: { userId } });
}

// GET — list categories
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const lang = request.nextUrl.searchParams.get("lang") || "";
  const where: Record<string, unknown> = { siteId: site.id };
  if (lang) where.lang = lang;

  const categories = await prisma.productCategory.findMany({
    where,
    orderBy: [{ lang: "asc" }, { legacyId: "asc" }],
  });

  const rows = categories.map((c) => ({
    id: c.legacyId ?? 0,
    pgId: c.id,
    lang: c.lang,
    category: c.name,
    defaultkey: c.defaultKey,
    parent: c.parentLegacyId ?? 0,
    depth: c.depth,
    liststyle: c.listStyle,
    rows: c.rows,
    img_w: c.imgWidth,
    img_h: c.imgHeight,
    titlelen: c.titleLen,
    textlen: c.textLen,
  }));

  return NextResponse.json({ categories: rows, shopId: site.shopId, defaultLanguage: site.defaultLanguage });
}

// POST — create category
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { category, lang, parent, liststyle, rows: numRows, img_w, img_h } = body;
  if (!category || !lang) return NextResponse.json({ error: "category and lang required" }, { status: 400 });

  const maxCat = await prisma.productCategory.findFirst({
    where: { siteId: site.id },
    orderBy: { legacyId: "desc" },
    select: { legacyId: true },
  });
  const nextLegacyId = (maxCat?.legacyId ?? 0) + 1;

  await prisma.productCategory.create({
    data: {
      siteId: site.id,
      legacyId: nextLegacyId,
      lang,
      name: category,
      parentLegacyId: parseInt(parent) || null,
      listStyle: parseInt(liststyle) || 0,
      rows: parseInt(numRows) || 9,
      imgWidth: parseInt(img_w) || 80,
      imgHeight: parseInt(img_h) || 80,
    },
  });

  return NextResponse.json({ success: true });
}

// PUT — update category
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { id, category, liststyle, rows: numRows, img_w, img_h } = body;
  if (!id || !category) return NextResponse.json({ error: "id and category required" }, { status: 400 });

  const legacyId = parseInt(id);
  const cat = await prisma.productCategory.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = { name: category };
  if (liststyle !== undefined) data.listStyle = parseInt(liststyle) || 0;
  if (numRows !== undefined) data.rows = parseInt(numRows) || 9;
  if (img_w !== undefined) data.imgWidth = parseInt(img_w) || 80;
  if (img_h !== undefined) data.imgHeight = parseInt(img_h) || 80;

  await prisma.productCategory.update({ where: { id: cat.id }, data });
  return NextResponse.json({ success: true });
}

// DELETE — delete category
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSite(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const legacyId = parseInt(id);
  const cat = await prisma.productCategory.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cnt = await prisma.product.count({ where: { siteId: site.id, category: String(legacyId) } });
  if (cnt > 0) {
    return NextResponse.json({ error: `이 카테고리에 ${cnt}개의 상품이 있어 삭제할 수 없습니다.` }, { status: 400 });
  }

  await prisma.productCategory.delete({ where: { id: cat.id } });
  return NextResponse.json({ success: true });
}
