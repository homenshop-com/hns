import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCron } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/expire-sites
 *
 * Once per day — handles two expiry scenarios:
 *
 * 1. Free-trial sites (accountType="0"):
 *    If expiresAt < now → unpublish. accountType unchanged (stays "0").
 *
 * 2. Paid sites (accountType="1") with expiresAt < now:
 *    a. Active PayPal subscription (status=ACTIVE, cancelAtPeriodEnd=false):
 *       → SKIP. PayPal is still billing; next payment will extend expiresAt.
 *    b. PayPal subscription with PAYMENT_FAILED:
 *       → 3-day grace period. Unpublish only if expiresAt < (now - 3 days).
 *    c. PayPal subscription CANCELLED or period ended:
 *       → Unpublish. Site access ends when currentPeriodEnd passes.
 *    d. No active subscription (Toss / bank-transfer one-time):
 *       → Unpublish immediately once expiresAt passes.
 *
 * accountType is NOT mutated to "9" automatically; only published is flipped.
 * Admins can hard-disable by setting accountType="9" manually.
 *
 * Template storage sites (isTemplateStorage=true) are always excluded.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` OR localhost.
 */
export async function GET(request: NextRequest) {
  const unauthorized = assertCron(request);
  if (unauthorized) return unauthorized;

  const now = new Date();
  const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days for PAYMENT_FAILED
  const graceCutoff = new Date(now.getTime() - GRACE_MS);

  const unpublishedIds: string[] = [];
  const skippedActivePaypal: string[] = [];
  const skippedGrace: string[] = [];

  // ── 1. Free-trial sites ──────────────────────────────────────────────────
  const expiredFree = await prisma.site.findMany({
    where: {
      accountType: "0",
      isTemplateStorage: false,
      published: true,
      expiresAt: { lt: now },
    },
    select: { id: true, shopId: true, expiresAt: true },
  });

  for (const site of expiredFree) {
    unpublishedIds.push(site.id);
  }

  // ── 2. Paid sites past their expiresAt ───────────────────────────────────
  const expiredPaid = await prisma.site.findMany({
    where: {
      accountType: "1",
      isTemplateStorage: false,
      published: true,
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      shopId: true,
      expiresAt: true,
      subscriptions: {
        where: { status: { in: ["ACTIVE", "CANCELLED", "PAYMENT_FAILED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          cancelAtPeriodEnd: true,
          currentPeriodEnd: true,
        },
      },
    },
  });

  for (const site of expiredPaid) {
    const sub = site.subscriptions[0] ?? null;

    if (sub) {
      if (sub.status === "ACTIVE" && !sub.cancelAtPeriodEnd) {
        // PayPal is still billing — don't expire. The webhook will extend expiresAt.
        skippedActivePaypal.push(site.shopId);
        continue;
      }

      if (sub.status === "PAYMENT_FAILED") {
        // Grace period: give 3 days from expiresAt before unpublishing.
        if (site.expiresAt && site.expiresAt.getTime() > graceCutoff.getTime()) {
          skippedGrace.push(site.shopId);
          continue;
        }
        // Grace period elapsed — fall through to unpublish.
      }

      // CANCELLED or PAYMENT_FAILED past grace: unpublish.
    }
    // No subscription (Toss/bank one-time) or expired grace: unpublish.
    unpublishedIds.push(site.id);
  }

  // ── Apply unpublish ──────────────────────────────────────────────────────
  let unpublishedCount = 0;
  if (unpublishedIds.length > 0) {
    const result = await prisma.site.updateMany({
      where: { id: { in: unpublishedIds } },
      data: { published: false },
    });
    unpublishedCount = result.count;
  }

  const allShopIds = [...expiredFree, ...expiredPaid]
    .filter((s) => unpublishedIds.includes(s.id))
    .map((s) => s.shopId);

  if (unpublishedCount > 0) {
    console.log(`[expire-sites] unpublished ${unpublishedCount} sites:`, allShopIds.join(", "));
  }
  if (skippedActivePaypal.length > 0) {
    console.log(`[expire-sites] skipped (active PayPal):`, skippedActivePaypal.join(", "));
  }
  if (skippedGrace.length > 0) {
    console.log(`[expire-sites] skipped (grace period):`, skippedGrace.join(", "));
  }

  return NextResponse.json({
    ok: true,
    expired: unpublishedCount,
    skippedActivePaypal: skippedActivePaypal.length,
    skippedGrace: skippedGrace.length,
    now,
  });
}
