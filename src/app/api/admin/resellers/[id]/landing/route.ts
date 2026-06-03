import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getLandingState,
  linkResellerLanding,
  unlinkResellerLanding,
} from "@/lib/reseller-landing";

/**
 * Platform-admin landing-page link for an arbitrary reseller.
 *
 * Full-admin only. Links a Site owned by the reseller's OWNER account
 * (reseller.ownerUserId) — an admin can't attach a random user's site, and a
 * reseller with no owner yet has nothing to link.
 */

async function requireFullAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const adminUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (adminUser?.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireFullAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const state = await getLandingState(id);
  if (!state) {
    return NextResponse.json({ error: "리셀러를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireFullAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (!siteId) {
    return NextResponse.json({ error: "사이트를 선택해주세요." }, { status: 400 });
  }

  const reseller = await prisma.reseller.findUnique({
    where: { id },
    select: { ownerUserId: true },
  });
  if (!reseller) {
    return NextResponse.json({ error: "리셀러를 찾을 수 없습니다." }, { status: 404 });
  }

  const result = await linkResellerLanding(id, siteId, reseller.ownerUserId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ landingSite: result.landingSite });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireFullAdmin();
  if ("error" in guard) return guard.error;

  const { id } = await params;
  const result = await unlinkResellerLanding(id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
