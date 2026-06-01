import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CANONICAL_HOST } from "@/lib/reseller";
import { getSummary } from "@/lib/reseller-revenue";

/**
 * Resolve a revenue-share rate from a percent input (0–100) to basis points
 * (0–10000). Returns undefined when the input is absent/blank, null-coerced to
 * an out-of-range error by the caller. Accepts numbers or numeric strings.
 */
function parseSharePercent(raw: unknown): { ok: true; bps: number } | { ok: false } | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const pct = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return { ok: false };
  return { ok: true, bps: Math.round(pct * 100) };
}

/** Resolve an owner login by email → userId, or explicit clear. */
async function resolveOwnerUserId(
  raw: unknown
): Promise<{ ok: true; ownerUserId: string | null } | { ok: false; error: string } | null> {
  if (raw === undefined) return null; // field not submitted → leave unchanged
  const email = typeof raw === "string" ? raw.trim() : "";
  if (!email) return { ok: true, ownerUserId: null }; // explicit clear
  const owner = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!owner) {
    return { ok: false, error: `운영자 이메일(${email})에 해당하는 계정을 찾을 수 없습니다.` };
  }
  return { ok: true, ownerUserId: owner.id };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const reseller = await prisma.reseller.findUnique({
    where: { id },
    include: { owner: { select: { email: true } } },
  });

  if (!reseller) {
    return NextResponse.json(
      { error: "리셀러를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const summary = await getSummary(id);

  return NextResponse.json({
    ...reseller,
    ownerEmail: reseller.owner?.email ?? null,
    settlementSummary: summary,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
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

  // The canonical homenshop.com row is editable, but its domain must stay put
  // — renaming it would orphan the default brand resolution.
  const current = await prisma.reseller.findUnique({
    where: { id },
    select: { domain: true },
  });
  if (
    current?.domain === CANONICAL_HOST &&
    domain &&
    domain !== CANONICAL_HOST
  ) {
    return NextResponse.json(
      { error: "기본 도메인(homenshop.com)은 변경할 수 없습니다." },
      { status: 400 }
    );
  }

  // If domain changed, check uniqueness
  if (domain) {
    const existing = await prisma.reseller.findUnique({
      where: { domain },
    });
    if (existing && existing.id !== id) {
      return NextResponse.json(
        { error: "이미 사용 중인 도메인입니다." },
        { status: 409 }
      );
    }
  }

  const updateData: Record<string, unknown> = {};
  if (domain !== undefined) updateData.domain = domain;
  if (siteName !== undefined) updateData.siteName = siteName;
  if (logo !== undefined) updateData.logo = logo || null;
  if (copyright !== undefined) updateData.copyright = copyright || null;
  if (analytics !== undefined) updateData.analytics = analytics || null;
  if (metaTitle !== undefined) updateData.metaTitle = metaTitle || null;
  if (metaDescription !== undefined)
    updateData.metaDescription = metaDescription || null;
  if (metaKeywords !== undefined)
    updateData.metaKeywords = metaKeywords || null;
  if (typeof isActive === "boolean") updateData.isActive = isActive;

  const share = parseSharePercent(revenueSharePercent);
  if (share) {
    if (!share.ok) {
      return NextResponse.json(
        { error: "분배율은 0~100 사이의 값이어야 합니다." },
        { status: 400 }
      );
    }
    updateData.revenueShareBps = share.bps;
  }

  const owner = await resolveOwnerUserId(ownerEmail);
  if (owner) {
    if (!owner.ok) {
      return NextResponse.json({ error: owner.error }, { status: 400 });
    }
    updateData.ownerUserId = owner.ownerUserId;
  }

  const updated = await prisma.reseller.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (adminUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const target = await prisma.reseller.findUnique({
    where: { id },
    select: { domain: true },
  });
  if (target?.domain === CANONICAL_HOST) {
    return NextResponse.json(
      { error: "기본 도메인(homenshop.com)은 삭제할 수 없습니다." },
      { status: 400 }
    );
  }

  await prisma.reseller.delete({ where: { id } });

  return NextResponse.json({ message: "리셀러가 삭제되었습니다." });
}
