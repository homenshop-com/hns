import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { cancelSubscription, PayPalError } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/paypal/cancel
 * Body: { siteId: string }
 *
 * Cancels the active PayPal subscription for the given site.
 * Access continues until the current billing period ends (cancelAtPeriodEnd).
 * The cron job (expire-sites) handles flipping accountType to expired once
 * currentPeriodEnd passes.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { siteId?: string };
  const { siteId } = body;
  if (!siteId) {
    return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  }

  // Verify site ownership
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id },
    select: { id: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Find the active subscription
  const sub = await prisma.subscription.findFirst({
    where: {
      siteId,
      userId: session.user.id,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) {
    return NextResponse.json(
      { error: "No active PayPal subscription found for this site" },
      { status: 404 },
    );
  }

  if (sub.cancelAtPeriodEnd) {
    // Already scheduled for cancellation — return current expiry
    return NextResponse.json({
      ok: true,
      alreadyCancelled: true,
      expiresAt: sub.currentPeriodEnd?.toISOString() ?? null,
    });
  }

  // Call PayPal to cancel immediately (user won't be charged next cycle)
  try {
    await cancelSubscription(sub.paypalSubscriptionId, "User requested cancellation");
  } catch (err) {
    if (err instanceof PayPalError) {
      console.error(
        `[paypal/cancel] PayPal API error for ${sub.paypalSubscriptionId}:`,
        err.message,
      );
      // If PayPal already has it cancelled, proceed with DB update
      if (err.status !== 422) {
        return NextResponse.json(
          { error: `PayPal error: ${err.message}` },
          { status: 502 },
        );
      }
    } else {
      throw err;
    }
  }

  // Mark cancelled in DB — site stays paid until currentPeriodEnd
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "CANCELLED",
      cancelAtPeriodEnd: true,
    },
  });

  console.log(
    `[paypal/cancel] Subscription ${sub.paypalSubscriptionId} cancelled. ` +
      `Site=${siteId} access until ${sub.currentPeriodEnd?.toISOString() ?? "unknown"}`,
  );

  return NextResponse.json({
    ok: true,
    expiresAt: sub.currentPeriodEnd?.toISOString() ?? null,
  });
}
