import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/boards/[id] — Get a single board
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const board = await prisma.boardCategory.findUnique({
    where: { id },
    include: {
      site: { select: { userId: true } },
      _count: { select: { posts: true } },
    },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ board });
}

// PUT /api/boards/[id] — Update a board
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const board = await prisma.boardCategory.findUnique({
    where: { id },
    include: { site: { select: { userId: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, name, lang } = body;
  const nextName = (name ?? title) as string | undefined;

  const updated = await prisma.boardCategory.update({
    where: { id },
    data: {
      ...(nextName !== undefined && { name: nextName }),
      ...(lang !== undefined && { lang }),
    },
  });

  return NextResponse.json({ board: updated });
}

// DELETE /api/boards/[id] — Delete a board (cascade deletes posts via onDelete: SetNull on category)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const board = await prisma.boardCategory.findUnique({
    where: { id },
    include: { site: { select: { userId: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.boardCategory.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
