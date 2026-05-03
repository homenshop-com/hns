import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { trialExpiryFromNow } from "@/lib/site-expiration";

/**
 * Claim a prospect site. Two source patterns are supported:
 *
 *   (A) Site.prospectPhone is set — the preferred pattern. The site can
 *       be owned by anyone (typically the master admin account holding
 *       many prospect sites). On claim, we transfer Site.userId to the
 *       caller, clear prospectPhone/prospectNote, reset expiresAt to
 *       +30 days, and leave the previous owner intact.
 *
 *   (B) Site is owned by a User.isProspect=true placeholder — the legacy
 *       pattern from /admin/prospects/new. On claim, we additionally move
 *       User-scoped relations (Domain, Customer, Marketplace, Order,
 *       Template) to the caller and delete the placeholder user.
 *
 * The caller must be a real (non-prospect) user with an OTP-verified
 * phone matching the site's reserved phone. Idempotent at the boundary:
 * if the site is already claimed (no prospect phone, owner not a
 * placeholder) we return 410 with a friendly message.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      phone: true,
      phoneVerifiedAt: true,
      isProspect: true,
      shopId: true,
    },
  });
  if (!me || me.isProspect) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!me.phone || !me.phoneVerifiedAt) {
    return NextResponse.json(
      { error: "핸드폰 인증이 완료된 계정만 인계받을 수 있습니다." },
      { status: 400 },
    );
  }

  const { siteId } = (await req.json().catch(() => ({}))) as { siteId?: string };
  if (!siteId) {
    return NextResponse.json({ error: "siteId가 필요합니다." }, { status: 400 });
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      user: {
        select: {
          id: true,
          phone: true,
          isProspect: true,
        },
      },
    },
  });

  if (!site) {
    return NextResponse.json(
      { error: "이미 인계되었거나 존재하지 않는 사이트입니다." },
      { status: 410 },
    );
  }

  // Determine which pattern this site uses.
  const isPlaceholderOwner = site.user.isProspect;
  const hasProspectPhone = !!site.prospectPhone;

  if (!isPlaceholderOwner && !hasProspectPhone) {
    return NextResponse.json(
      { error: "이미 인계되었거나 잠재고객 사이트가 아닙니다." },
      { status: 410 },
    );
  }

  // Phone match check — for pattern (A) compare against Site.prospectPhone,
  // for pattern (B) compare against the placeholder user's phone.
  const reservedPhone = site.prospectPhone ?? site.user.phone;
  if (reservedPhone !== me.phone) {
    return NextResponse.json(
      { error: "핸드폰 번호가 일치하지 않습니다." },
      { status: 403 },
    );
  }

  const realUserId = me.id;
  const newExpiresAt = trialExpiryFromNow(30);

  if (isPlaceholderOwner) {
    // Pattern (B) — legacy placeholder user. Move everything off the
    // placeholder so the User row can be deleted without cascading.
    const prospectId = site.user.id;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: prospectId },
        data: { shopId: null },
      });
      await tx.site.update({
        where: { id: site.id },
        data: {
          userId: realUserId,
          expiresAt: newExpiresAt,
          lastReminderDay: null,
          prospectPhone: null,
          prospectNote: null,
        },
      });
      await tx.domain.updateMany({
        where: { userId: prospectId },
        data: { userId: realUserId },
      });
      await tx.customer.updateMany({
        where: { userId: prospectId },
        data: { userId: realUserId },
      });
      await tx.marketplaceIntegration.updateMany({
        where: { userId: prospectId },
        data: { userId: realUserId },
      });
      await tx.order.updateMany({
        where: { userId: prospectId },
        data: { userId: realUserId },
      });
      await tx.template.updateMany({
        where: { userId: prospectId },
        data: { userId: realUserId },
      });
      // Adopt the shopId on the real user only if they don't already
      // hold one — preserves their existing primary site if any.
      await tx.user.update({
        where: { id: realUserId },
        data: {
          shopId: me.shopId ?? site.shopId,
          claimedAt: new Date(),
        },
      });
      await tx.user.delete({ where: { id: prospectId } });
    });
  } else {
    // Pattern (A) — site lives under a real admin account (master). Just
    // move the site over and clear the prospect markers; do NOT touch
    // the previous owner or its other relations, since master typically
    // holds many other prospect sites that should remain.
    await prisma.$transaction(async (tx) => {
      await tx.site.update({
        where: { id: site.id },
        data: {
          userId: realUserId,
          expiresAt: newExpiresAt,
          lastReminderDay: null,
          prospectPhone: null,
          prospectNote: null,
        },
      });
      await tx.user.update({
        where: { id: realUserId },
        data: {
          shopId: me.shopId ?? site.shopId,
          claimedAt: new Date(),
        },
      });
    });
  }

  return NextResponse.json({
    ok: true,
    siteId: site.id,
    shopId: site.shopId,
    expiresAt: newExpiresAt,
  });
}
