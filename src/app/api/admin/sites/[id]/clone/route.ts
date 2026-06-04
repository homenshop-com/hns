/**
 * POST /api/admin/sites/[id]/clone
 *
 * "계정 100% 복제" — duplicate the site at [id] into a fresh shopId. Copies
 * every design + content row (see lib/site-clone) and then best-effort copies
 * the site's upload folders on the server so the clone renders self-contained.
 *
 * Body: { newShopId, newName?, targetUserId? }
 *
 * Auth: getAdminAccess(). Reseller operators may only clone sites attributed
 * to their reseller, and only into a target user within that reseller.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess, scopeResellerId } from "@/lib/admin-access";
import { cloneSite } from "@/lib/site-clone";
import { copySiteAssets } from "@/lib/site-clone-assets";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rid = scopeResellerId(access);

  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    newShopId?: string;
    newName?: string;
    targetUserId?: string;
  } | null;

  const newShopId = (body?.newShopId || "").trim().toLowerCase();
  const newName = body?.newName?.trim() || undefined;
  const targetUserId = body?.targetUserId?.trim() || undefined;

  // Load source for auth scoping (and confirm it exists).
  const source = await prisma.site.findUnique({
    where: { id },
    select: { id: true, shopId: true, userId: true, user: { select: { resellerId: true } } },
  });
  if (!source) {
    return NextResponse.json({ error: "원본 사이트를 찾을 수 없습니다." }, { status: 404 });
  }

  // Reseller scoping: source must belong to the reseller's members…
  if (rid && source.user.resellerId !== rid) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  // …and any explicit target owner must too.
  if (rid && targetUserId) {
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { resellerId: true },
    });
    if (!target || target.resellerId !== rid) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  const result = await cloneSite({
    sourceSiteId: id,
    newShopId,
    newName,
    targetUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Best-effort: copy upload folders so the clone is self-contained. Failure
  // here never undoes the DB clone — images can be re-copied later.
  const assets = await copySiteAssets(source.shopId, newShopId);

  return NextResponse.json({
    site: result.site,
    assetsCopied: assets,
    editUrl: `/admin/sites/${result.site.id}`,
  });
}
