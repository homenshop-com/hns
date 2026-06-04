/**
 * POST /api/dashboard/sites/[id]/clone
 *
 * Self-service "계정 100% 복제" from the member dashboard. Mirrors the admin
 * clone route but authorises through the dashboard MANAGE scope instead of
 * admin access — so a white-label reseller operator can clone any site they
 * manage (their OWN sites AND customer sites attributed to their reseller),
 * with their normal session (no impersonation).
 *
 * Gated to reseller operators only: an ordinary member must not be able to
 * mint a fresh active paid account for free. The clone is owned by the source
 * site's owner (a reseller cloning a customer site keeps it under that
 * customer, preserving reseller attribution).
 *
 * Body: { newShopId, newName? }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getManageScope, manageableSiteWhere } from "@/lib/site-access";
import { cloneSite } from "@/lib/site-clone";
import { copySiteAssets } from "@/lib/site-clone-assets";

export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const scope = await getManageScope();
  if (!scope) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  // Reseller operators only — ordinary members cannot self-clone (billing).
  if (!scope.resellerId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { siteId } = await params;

  const body = (await request.json().catch(() => null)) as {
    newShopId?: string;
    newName?: string;
  } | null;

  const newShopId = (body?.newShopId || "").trim().toLowerCase();
  const newName = body?.newName?.trim() || undefined;

  // Confirm the source exists AND is within this operator's manage scope.
  const source = await prisma.site.findFirst({
    where: { id: siteId, ...manageableSiteWhere(scope) },
    select: { id: true, shopId: true },
  });
  if (!source) {
    return NextResponse.json(
      { error: "원본 사이트를 찾을 수 없거나 권한이 없습니다." },
      { status: 404 },
    );
  }

  const result = await cloneSite({
    sourceSiteId: siteId,
    newShopId,
    newName,
    // Owner defaults to the source site's owner inside cloneSite — keeps a
    // cloned customer site attributed to that customer (and the reseller).
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const assets = await copySiteAssets(source.shopId, newShopId);

  return NextResponse.json({
    site: result.site,
    assetsCopied: assets,
    editUrl: `/dashboard/site/settings?id=${result.site.id}`,
  });
}
