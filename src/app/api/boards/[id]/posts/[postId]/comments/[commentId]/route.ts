import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageScope, canManage } from "@/lib/site-access";

// DELETE /api/boards/[id]/posts/[postId]/comments/[commentId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; postId: string; commentId: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, postId, commentId } = await params;

  // Ownership check: board -> site -> user
  const post = await prisma.boardPost.findFirst({
    where: { id: postId, categoryId: id },
    include: {
      category: {
        include: { site: { select: { userId: true, user: { select: { resellerId: true } } } } },
      },
    },
  });

  const scope = await getManageScope();
  if (!post || !post.category || !scope || !canManage(scope, { userId: post.category.site.userId, ownerResellerId: post.category.site.user.resellerId })) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const comment = await prisma.boardComment.findFirst({
    where: { id: commentId, postId },
  });

  if (!comment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.boardComment.delete({ where: { id: commentId } });

  return NextResponse.json({ success: true });
}
