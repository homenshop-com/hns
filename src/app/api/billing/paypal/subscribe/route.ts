import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSubscription } from "@/lib/paypal";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/paypal/subscribe
 * Body: { siteId: string, plan: "monthly" | "yearly" }
 *
 * Creates a PayPal subscription for the given site and billing plan.
 * Persists a PENDING Subscription record in the DB, then returns the
 * PayPal approval URL so the client can redirect the user there.
 *
 * After the user approves on PayPal, they land back at:
 *   /dashboard/site/{siteId}/extend?success=1&channel=paypal
 * The site is NOT activated here — that happens via the webhook
 * (BILLING.SUBSCRIPTION.ACTIVATED event).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    siteId?: string;
    plan?: string;
  };
  const { siteId, plan } = body;

  if (!siteId || (plan !== "monthly" && plan !== "yearly")) {
    return NextResponse.json(
      { error: "siteId and plan (monthly|yearly) are required" },
      { status: 400 },
    );
  }

  // Resolve billing plan ID from env
  const planEnvKey = plan === "monthly" ? "PAYPAL_PLAN_MONTHLY" : "PAYPAL_PLAN_YEARLY";
  const planId = process.env[planEnvKey];
  if (!planId) {
    console.error(`Missing env var: ${planEnvKey}`);
    return NextResponse.json(
      { error: "PayPal billing plans are not configured yet" },
      { status: 503 },
    );
  }

  // Verify the site belongs to this user
  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id, isTemplateStorage: false },
    select: { id: true, shopId: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Build return / cancel URLs
  const origin = process.env.NEXTAUTH_URL ?? "https://homenshop.com";
  const extendBase = `${origin}/dashboard/site/${siteId}/extend`;
  const returnUrl = `${extendBase}?success=1&channel=paypal`;
  const cancelUrl = `${extendBase}?cancelled=1`;

  // Create the subscription on PayPal
  const { id: paypalSubscriptionId, approveUrl } = await createSubscription(
    planId,
    returnUrl,
    cancelUrl,
  );

  // Persist PENDING subscription record (activated by webhook later)
  await prisma.subscription.create({
    data: {
      siteId: site.id,
      userId: session.user.id,
      paypalSubscriptionId,
      paypalPlanId: planId,
      status: "PENDING",
    },
  });

  console.log(
    `[paypal/subscribe] Created PENDING subscription ${paypalSubscriptionId} ` +
      `for site=${siteId} user=${session.user.id} plan=${plan}`,
  );

  return NextResponse.json({ ok: true, approveUrl });
}
