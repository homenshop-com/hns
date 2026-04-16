import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePageParam } from "@/lib/pagination";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const page = parsePageParam(searchParams.get("page"));
  const search = searchParams.get("search") || "";

  const where = search
    ? {
        OR: [
          { domain: { contains: search, mode: "insensitive" as const } },
          { siteName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [resellers, totalCount] = await Promise.all([
    prisma.reseller.findMany({
      where,
      orderBy: { domain: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.reseller.count({ where }),
  ]);

  return NextResponse.json({
    resellers,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { domain, siteName, logo, copyright, analytics, isActive } = body;

  if (!domain || !siteName) {
    return NextResponse.json(
      { error: "도메인과 사이트명은 필수입니다." },
      { status: 400 }
    );
  }

  // Check uniqueness
  const existing = await prisma.reseller.findUnique({
    where: { domain },
  });

  if (existing) {
    return NextResponse.json(
      { error: "이미 등록된 리셀러 도메인입니다." },
      { status: 409 }
    );
  }

  const reseller = await prisma.reseller.create({
    data: {
      domain,
      siteName,
      logo: logo || null,
      copyright: copyright || null,
      analytics: analytics || null,
      isActive: isActive !== undefined ? isActive : true,
    },
  });

  return NextResponse.json(reseller, { status: 201 });
}
