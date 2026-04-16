import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { indexPost } from "@/lib/search";

// GET /api/boards/[id]/posts — List posts (public, paginated)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const board = await prisma.boardCategory.findUnique({
    where: { id },
  });

  if (!board) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "10", 10)));

  const [posts, totalCount] = await Promise.all([
    prisma.boardPost.findMany({
      where: { categoryId: id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.boardPost.count({ where: { categoryId: id } }),
  ]);

  return NextResponse.json({
    posts,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
}

// POST /api/boards/[id]/posts — Create a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify the board belongs to user's site
  const board = await prisma.boardCategory.findUnique({
    where: { id },
    include: { site: { select: { id: true, userId: true, name: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, content, author } = body;

  if (!title || !content) {
    return NextResponse.json(
      { error: "제목과 내용은 필수입니다." },
      { status: 400 }
    );
  }

  const post = await prisma.boardPost.create({
    data: {
      siteId: board.site.id,
      categoryId: id,
      title,
      content,
      author: author || session.user.name || "익명",
    },
  });

  // Fire-and-forget: index post in search
  try {
    indexPost({
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      boardId: board.id,
      boardTitle: board.name,
      siteId: board.site.id,
      siteName: board.site.name,
      views: post.views,
      createdAt: post.createdAt.toISOString(),
    }).catch((err) => console.error("Search index error:", err));
  } catch (err) {
    console.error("Search index error:", err);
  }

  return NextResponse.json({ post }, { status: 201 });
}
