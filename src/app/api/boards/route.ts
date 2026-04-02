import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/boards — List all boards for user's site
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  if (!site) {
    return NextResponse.json({ boards: [] });
  }

  const boards = await prisma.board.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });

  return NextResponse.json({ boards });
}

// POST /api/boards — Create a new board
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 먼저 생성해주세요." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { title, type } = body;

  if (!title) {
    return NextResponse.json(
      { error: "게시판 제목은 필수입니다." },
      { status: 400 }
    );
  }

  const board = await prisma.board.create({
    data: {
      siteId: site.id,
      title,
      type: type || "board",
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
