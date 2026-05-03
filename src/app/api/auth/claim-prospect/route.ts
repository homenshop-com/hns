import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { trialExpiryFromNow } from "@/lib/site-expiration";

/**
 * Claim a prospect placeholder. The current session must be a real user
 * whose phone matches a single isProspect=true placeholder. The site,
 * shopId, and User-level relations move from the placeholder to the
 * caller, expiresAt is reset to +30 days from claim time, and the
 * placeholder row is deleted.
 *
 * This is intentionally idempotent at the boundary: if the placeholder
 * is already gone (raced or already claimed) we return 410 instead of
 * 500 so the UI can show "이미 인계되었습니다" cleanly.
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
  if (me.shopId) {
    return NextResponse.json(
      { error: "이미 사이트가 있는 계정은 인계받을 수 없습니다." },
      { status: 409 },
    );
  }

  const { siteId } = (await req.json().catch(() => ({}))) as { siteId?: string };
  if (!siteId) {
    return NextResponse.json({ error: "siteId가 필요합니다." }, { status: 400 });
  }

  // Resolve the prospect via the site rather than via phone-only — that
  // lets us return useful errors when the user navigated back to a stale
  // claim URL.
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
  if (!site.user.isProspect) {
    return NextResponse.json(
      { error: "이미 인계되었거나 잠재고객 사이트가 아닙니다." },
      { status: 410 },
    );
  }
  if (site.user.phone !== me.phone) {
    return NextResponse.json(
      { error: "핸드폰 번호가 일치하지 않습니다." },
      { status: 403 },
    );
  }

  const prospectId = site.user.id;
  const realUserId = me.id;
  const newExpiresAt = trialExpiryFromNow(30);

  // The transaction order matters:
  //   1. Free shopId on placeholder (User.shopId is @unique).
  //   2. Move Site ownership and reset expiry/reminder state.
  //   3. Move other User-scoped relations (Domain/Customer/Marketplace/
  //      Order/Template) so the placeholder has nothing left blocking
  //      its delete.
  //   4. Adopt shopId on the real user, mark claimedAt.
  //   5. Delete placeholder. Site is already detached, so cascade is a
  //      no-op for it; SupportThread (1:1, cascade) is the only thing
  //      we deliberately drop — it would have been empty for a freshly
  //      created placeholder.
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

    await tx.user.update({
      where: { id: realUserId },
      data: {
        shopId: site.shopId,
        claimedAt: new Date(),
      },
    });

    await tx.user.delete({ where: { id: prospectId } });
  });

  return NextResponse.json({
    ok: true,
    siteId: site.id,
    shopId: site.shopId,
    expiresAt: newExpiresAt,
  });
}
