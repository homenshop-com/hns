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

  const board = await prisma.board.findUnique({
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

  const board = await prisma.board.findUnique({
    where: { id },
    include: { site: { select: { userId: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, type } = body;

  const updated = await prisma.board.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(type !== undefined && { type }),
    },
  });

  return NextResponse.json({ board: updated });
}

// DELETE /api/boards/[id] — Delete a board (cascade deletes posts)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const board = await prisma.board.findUnique({
    where: { id },
    include: { site: { select: { userId: true } } },
  });

  if (!board || board.site.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.board.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
