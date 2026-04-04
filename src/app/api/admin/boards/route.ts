import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function checkAdmin() {
  const session = await auth();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") return null;
  return session;
}

// DELETE — bulk delete posts
export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  // Delete replies first, then the posts
  await prisma.boardPost.deleteMany({ where: { parentId: { in: ids } } });
  const result = await prisma.boardPost.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ deleted: result.count });
}

// PUT — update a single post
export async function PUT(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, title, author, content, isNotice, isPublic } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "No id provided" }, { status: 400 });
  }

  const updated = await prisma.boardPost.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(author !== undefined && { author }),
      ...(content !== undefined && { content }),
      ...(isNotice !== undefined && { isNotice }),
      ...(isPublic !== undefined && { isPublic }),
    },
  });

  return NextResponse.json({ post: updated });
}
