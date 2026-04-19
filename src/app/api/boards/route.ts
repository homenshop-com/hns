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
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  if (!site) {
    return NextResponse.json({ boards: [] });
  }

  const boards = await prisma.boardCategory.findMany({
    where: { siteId: site.id },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  });

  return NextResponse.json({ boards });
}

// POST /api/boards — Create a new board (BoardCategory)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 먼저 생성해주세요." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { title, name, lang } = body;
  const boardName = (name ?? title) as string | undefined;

  if (!boardName) {
    return NextResponse.json(
      { error: "게시판 제목은 필수입니다." },
      { status: 400 }
    );
  }

  const board = await prisma.boardCategory.create({
    data: {
      siteId: site.id,
      name: boardName,
      lang: lang || "ko",
    },
  });

  return NextResponse.json({ board }, { status: 201 });
}
