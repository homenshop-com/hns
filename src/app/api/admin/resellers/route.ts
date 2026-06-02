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
  const {
    domain,
    siteName,
    logo,
    copyright,
    analytics,
    isActive,
    metaTitle,
    metaDescription,
    metaKeywords,
    revenueSharePercent,
    ownerEmail,
  } = body;

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

  // Revenue-share rate: percent (0–100) → basis points. Defaults to 5000
  // (50%) via the schema when omitted.
  let revenueShareBps: number | undefined;
  if (revenueSharePercent !== undefined && revenueSharePercent !== null && revenueSharePercent !== "") {
    const pct = Number(revenueSharePercent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return NextResponse.json(
        { error: "분배율은 0~100 사이의 값이어야 합니다." },
        { status: 400 }
      );
    }
    revenueShareBps = Math.round(pct * 100);
  }

  // Owner login (by email) — optional. A user can own at most one reseller
  // (Reseller.ownerUserId is unique), so reject reassignment up front with a
  // clear message instead of letting Prisma throw a P2002.
  let ownerUserId: string | null = null;
  if (typeof ownerEmail === "string" && ownerEmail.trim()) {
    const owner = await prisma.user.findUnique({
      where: { email: ownerEmail.trim() },
      select: { id: true, ownedReseller: { select: { domain: true } } },
    });
    if (!owner) {
      return NextResponse.json(
        { error: `운영자 이메일(${ownerEmail.trim()})에 해당하는 계정을 찾을 수 없습니다.` },
        { status: 400 }
      );
    }
    if (owner.ownedReseller) {
      return NextResponse.json(
        {
          error: `이 계정(${ownerEmail.trim()})은 이미 리셀러 "${owner.ownedReseller.domain}"의 운영자입니다. 한 계정은 하나의 리셀러만 운영할 수 있습니다.`,
        },
        { status: 409 }
      );
    }
    ownerUserId = owner.id;
  }

  try {
    const reseller = await prisma.reseller.create({
      data: {
        domain,
        siteName,
        logo: logo || null,
        copyright: copyright || null,
        analytics: analytics || null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        metaKeywords: metaKeywords || null,
        isActive: isActive !== undefined ? isActive : true,
        ...(revenueShareBps !== undefined ? { revenueShareBps } : {}),
        ownerUserId,
      },
    });

    return NextResponse.json(reseller, { status: 201 });
  } catch (err) {
    // P2002 = unique constraint. Map the two unique columns to friendly text;
    // anything else returns a generic JSON error so the client never sees an
    // empty-body 500 ("Unexpected end of JSON input").
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === "P2002") {
      const target = (err as { meta?: { target?: string[] } }).meta?.target;
      const onOwner = Array.isArray(target)
        ? target.some((t) => t.includes("ownerUserId"))
        : String(target ?? "").includes("ownerUserId");
      return NextResponse.json(
        {
          error: onOwner
            ? "이 운영자 이메일은 이미 다른 리셀러에 연결되어 있습니다."
            : "이미 등록된 리셀러 도메인입니다.",
        },
        { status: 409 }
      );
    }
    console.error("[admin/resellers] create failed:", err);
    return NextResponse.json(
      { error: "리셀러 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
