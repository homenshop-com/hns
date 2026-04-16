import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePageParam, parseLimitParam } from "@/lib/pagination";

async function getSiteForUser(userId: string) {
  return prisma.site.findFirst({ where: { userId } });
}

// GET — list board posts
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSiteForUser(session.user.id);
  if (!site) return NextResponse.json({ posts: [], categories: [] });

  const sp = request.nextUrl.searchParams;
  const categoryParam = sp.get("category") || "";
  const page = parsePageParam(sp.get("page"));
  const limit = parseLimitParam(sp.get("limit"), 20, 50);
  const postId = sp.get("id") || "";

  // Single post detail
  if (postId) {
    const legacyId = parseInt(postId);
    const post = await prisma.boardPost.findFirst({
      where: { siteId: site.id, legacyId },
      include: { category: { select: { name: true, legacyId: true } } },
    });
    if (!post) return NextResponse.json({ post: null });
    return NextResponse.json({
      post: {
        id: post.legacyId,
        lang: post.lang,
        category: post.category?.legacyId ?? 0,
        title: post.title,
        contents: post.content,
        username: post.author,
        regdate: post.regdate,
        click: post.views,
        photos: post.photos || "",
        notice: post.isNotice ? 1 : 0,
      },
    });
  }

  // Categories with post counts
  const categories = await prisma.boardCategory.findMany({
    where: { siteId: site.id },
    orderBy: { legacyId: "asc" },
    include: { _count: { select: { posts: { where: { parentId: null } } } } },
  });
  const catRows = categories.map((c) => ({
    id: c.legacyId ?? 0,
    lang: c.lang,
    category: c.name,
    cnt: c._count.posts,
  }));

  // Find category PG id for filtering
  let catFilter: Record<string, unknown> = { siteId: site.id, parentId: null };
  if (categoryParam) {
    const catLegacyId = parseInt(categoryParam);
    const cat = await prisma.boardCategory.findFirst({
      where: { siteId: site.id, legacyId: catLegacyId },
    });
    if (cat) catFilter.categoryId = cat.id;
  }

  const total = await prisma.boardPost.count({ where: catFilter });
  const offset = (page - 1) * limit;

  const posts = await prisma.boardPost.findMany({
    where: catFilter,
    orderBy: { legacyId: "desc" },
    skip: offset,
    take: limit,
    include: { category: { select: { name: true, legacyId: true } } },
  });

  const postRows = posts.map((p) => ({
    id: p.legacyId,
    title: p.title,
    username: p.author,
    regdate: p.regdate,
    click: p.views,
    category: p.category?.legacyId ?? 0,
    photos: p.photos || "",
    notice: p.isNotice ? 1 : 0,
    categoryName: p.category?.name || "",
  }));

  return NextResponse.json({ posts: postRows, categories: catRows, total, page, limit });
}

// POST — create board post
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSiteForUser(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { title, contents, username, category, lang } = body;
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

  // Find next legacyId
  const maxPost = await prisma.boardPost.findFirst({
    where: { siteId: site.id },
    orderBy: { legacyId: "desc" },
    select: { legacyId: true },
  });
  const nextLegacyId = (maxPost?.legacyId ?? 0) + 1;

  // Find category
  const catLegacyId = parseInt(category) || 2;
  const cat = await prisma.boardCategory.findFirst({
    where: { siteId: site.id, legacyId: catLegacyId },
  });

  const now = new Date().toISOString().slice(0, 10);
  await prisma.boardPost.create({
    data: {
      siteId: site.id,
      legacyId: nextLegacyId,
      lang: lang || "en",
      categoryId: cat?.id || null,
      author: username || session.user.name || "admin",
      title,
      content: contents || "",
      regdate: now,
    },
  });

  return NextResponse.json({ success: true });
}

// PUT — update board post
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSiteForUser(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const body = await request.json();
  const { id, title, contents, username, category } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const legacyId = parseInt(id);
  const post = await prisma.boardPost.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (contents !== undefined) data.content = contents;
  if (username !== undefined) data.author = username;
  if (category !== undefined) {
    const cat = await prisma.boardCategory.findFirst({
      where: { siteId: site.id, legacyId: parseInt(category) || 0 },
    });
    data.categoryId = cat?.id || null;
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  await prisma.boardPost.update({ where: { id: post.id }, data });
  return NextResponse.json({ success: true });
}

// DELETE — delete board post
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const site = await getSiteForUser(session.user.id);
  if (!site) return NextResponse.json({ error: "No site" }, { status: 404 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const legacyId = parseInt(id);
  const post = await prisma.boardPost.findFirst({
    where: { siteId: site.id, legacyId },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // Delete replies too
  await prisma.boardPost.deleteMany({ where: { parentId: post.id } });
  await prisma.boardPost.delete({ where: { id: post.id } });
  return NextResponse.json({ success: true });
}
