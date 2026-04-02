import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { indexPost, removePost } from "@/lib/search";

// GET /api/boards/[id]/posts/[postId] — Get a single post (public, increments views)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const { id, postId } = await params;

  const post = await prisma.boardPost.findFirst({
    where: { id: postId, boardId: id },
  });

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Increment views
  const updated = await prisma.boardPost.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  });

  return NextResponse.json({ post: updated });
}

// PUT /api/boards/[id]/posts/[postId] — Update a post
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, postId } = await params;

  // Ownership check: board -> site -> user
  const post = await prisma.boardPost.findFirst({
    where: { id: postId, boardId: id },
    include: {
      board: {
        include: { site: { select: { id: true, userId: true, name: true } } },
      },
    },
  });

  if (!post || post.board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, content, author } = body;

  const updated = await prisma.boardPost.update({
    where: { id: postId },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(author !== undefined && { author }),
    },
  });

  // Fire-and-forget: update search index
  try {
    indexPost({
      id: updated.id,
      title: updated.title,
      content: updated.content,
      author: updated.author,
      boardId: post.board.id,
      boardTitle: post.board.title,
      siteId: post.board.site.id,
      siteName: post.board.site.name,
      views: updated.views,
      createdAt: updated.createdAt.toISOString(),
    }).catch((err) => console.error("Search index error:", err));
  } catch (err) {
    console.error("Search index error:", err);
  }

  return NextResponse.json({ post: updated });
}

// DELETE /api/boards/[id]/posts/[postId] — Delete a post
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, postId } = await params;

  // Ownership check
  const post = await prisma.boardPost.findFirst({
    where: { id: postId, boardId: id },
    include: {
      board: {
        include: { site: { select: { userId: true } } },
      },
    },
  });

  if (!post || post.board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.boardPost.delete({ where: { id: postId } });

  // Fire-and-forget: remove from search index
  try {
    removePost(postId).catch((err) =>
      console.error("Search index error:", err)
    );
  } catch (err) {
    console.error("Search index error:", err);
  }

  return NextResponse.json({ success: true });
}
