import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface ReorderItem {
  id: string;
  sortOrder: number;
  parentId: string | null;
}

// PUT /api/sites/[id]/pages/reorder — 메뉴 순서 일괄 변경
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({ where: { id } });

  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = await request.json();
  const { items } = body as { items: ReorderItem[] };

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "items 배열이 필요합니다." }, { status: 400 });
  }

  // 2depth 제한 검증: parentId가 있는 항목의 parent가 다시 parent를 가지면 안 됨
  const parentIds = items.filter((i) => i.parentId).map((i) => i.parentId!);
  const childOfParent = items.filter(
    (i) => i.parentId && parentIds.includes(i.id)
  );
  if (childOfParent.length > 0) {
    return NextResponse.json(
      { error: "2단계까지만 지원됩니다." },
      { status: 400 }
    );
  }

  // 트랜잭션으로 일괄 업데이트
  await prisma.$transaction(
    items.map((item) =>
      prisma.page.update({
        where: { id: item.id },
        data: {
          sortOrder: item.sortOrder,
          parentId: item.parentId,
        },
      })
    )
  );

  return NextResponse.json({ message: "순서가 변경되었습니다." });
}
