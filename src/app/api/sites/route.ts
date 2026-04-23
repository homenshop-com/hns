import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { freeSiteDefaults } from "@/lib/site-expiration";

// GET /api/sites — 현재 사용자의 사이트 조회
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sites);
}

// POST /api/sites — 새 사이트 생성
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  // Check free site limit (max 5) — exclude hidden template-storage sites
  const siteCount = await prisma.site.count({
    where: { userId: session.user.id, isTemplateStorage: false },
  });
  if (siteCount >= 5) {
    return NextResponse.json(
      { error: "무료 계정은 최대 5개까지 생성 가능합니다." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { name, description, shopId, defaultLanguage } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "사이트 이름은 필수입니다." },
      { status: 400 }
    );
  }

  if (!shopId || !/^[a-z0-9][a-z0-9-]{4,12}[a-z0-9]$/.test(shopId)) {
    return NextResponse.json(
      { error: "shopId는 6~14자리 영문/숫자/- 형식이어야 합니다." },
      { status: 400 }
    );
  }

  const existingShop = await prisma.site.findUnique({ where: { shopId } });
  if (existingShop) {
    return NextResponse.json(
      { error: "이미 사용중인 도메인입니다." },
      { status: 409 }
    );
  }

  const site = await prisma.site.create({
    data: {
      userId: session.user.id,
      shopId,
      name: name.trim(),
      description: description?.trim() || null,
      defaultLanguage: defaultLanguage || "ko",
      ...freeSiteDefaults(),
    },
  });

  return NextResponse.json(site, { status: 201 });
}
