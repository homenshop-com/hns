import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/boards/[id]/posts/[postId]/comments — List comments for a post
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const { id, postId } = await params;

  const post = await prisma.boardPost.findFirst({
    where: { id: postId, categoryId: id },
  });

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comments = await prisma.boardComment.findMany({
    where: { postId, parentId: null },
    orderBy: { createdAt: "asc" },
    include: {
      replies: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ comments });
}

// POST /api/boards/[id]/posts/[postId]/comments — Create a comment
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, postId } = await params;

  const post = await prisma.boardPost.findFirst({
    where: { id: postId, categoryId: id },
  });

  if (!post) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { author, content, parentId } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  // If parentId is provided, verify it exists and belongs to this post
  if (parentId) {
    const parent = await prisma.boardComment.findFirst({
      where: { id: parentId, postId },
    });
    if (!parent) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
    }
  }

  const comment = await prisma.boardComment.create({
    data: {
      postId,
      author: author?.trim() || session.user.name || "익명",
      content: content.trim(),
      parentId: parentId || null,
    },
  });

  return NextResponse.json({ comment }, { status: 201 });
}
