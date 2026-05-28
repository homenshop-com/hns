import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyWebhookSignature, getSubscription, PayPalError } from "@/lib/paypal";
import { Resend } from "resend";
import {
  sendSubscriptionActivatedEmail,
  sendSubscriptionReceiptEmail,
  sendSubscriptionPaymentFailedEmail,
  sendSubscriptionCancelledEmail,
} from "@/lib/email";

export const dynamic = "force-dynamic";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ADMIN_EMAIL = "archipfe@gmail.com";

function resend() {
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendAdminAlert(subject: string, html: string) {
  try {
    await resend().emails.send({
      from: "homeNshop <noreply@homenshop.com>",
      to: ADMIN_EMAIL,
      subject,
      html,
    });
  } catch (err) {
    console.error("[paypal/webhook] Failed to send admin alert:", err);
  }
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

function planLabel(planId: string): string {
  const monthly = process.env.PAYPAL_PLAN_MONTHLY;
  const yearly = process.env.PAYPAL_PLAN_YEARLY;
  if (planId === monthly) return "월간 $4.99";
  if (planId === yearly) return "연간 $49.99";
  return planId;
}

/** Parse ISO date string safely. Returns null on failure. */
function parseDate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Generate a PAYPAL-prefixed order number. */
function ppOrderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PP-${y}${m}${d}-${rand}`;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * BILLING.SUBSCRIPTION.ACTIVATED
 * Flip Subscription → ACTIVE and mark site as paid (accountType="1").
 */
async function onSubscriptionActivated(resource: Record<string, unknown>) {
  const paypalSubId = resource.id as string;
  const sub = await prisma.subscription.findUnique({
    where: { paypalSubscriptionId: paypalSubId },
    include: { site: { select: { expiresAt: true } } },
  });
  if (!sub) {
    console.warn(`[paypal/webhook] ACTIVATED: no Subscription found for ${paypalSubId}`);
    return;
  }
  if (sub.status === "ACTIVE") {
    console.log(`[paypal/webhook] ACTIVATED: ${paypalSubId} already ACTIVE — skipping`);
    return;
  }

  // Pull billing cycle dates from PayPal (resource may already have them)
  let periodEnd: Date | null = null;
  try {
    const details = await getSubscription(paypalSubId);
    const billingInfo = details.billing_info as Record<string, unknown> | undefined;
    periodEnd = parseDate(billingInfo?.next_billing_time);
  } catch (err) {
    console.warn("[paypal/webhook] ACTIVATED: Could not fetch subscription details:", err);
  }

  // Fallback: 1 month from now if we can't get the billing date
  if (!periodEnd) {
    periodEnd = new Date();
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    }),
    prisma.site.update({
      where: { id: sub.siteId },
      data: {
        accountType: "1",
        expiresAt: periodEnd,
        lastReminderDay: null,
      },
    }),
  ]);

  // Send activation confirmation email
  const owner = await prisma.user.findUnique({
    where: { id: sub.userId },
    select: { email: true },
  });
  if (owner?.email) {
    const site = await prisma.site.findUnique({
      where: { id: sub.siteId },
      select: { name: true },
    });
    const origin = process.env.NEXTAUTH_URL ?? "https://homenshop.com";
    await sendSubscriptionActivatedEmail(owner.email, {
      siteName: site?.name ?? sub.siteId,
      plan: planLabel(sub.paypalPlanId),
      nextBillingDate: formatDate(periodEnd),
      dashboardUrl: `${origin}/dashboard/site/${sub.siteId}/extend`,
    });
  }

  console.log(
    `[paypal/webhook] ACTIVATED: site=${sub.siteId} paid until ${periodEnd.toISOString()}`,
  );
}

/**
 * PAYMENT.SALE.COMPLETED
 * Extend billing period and create an Order record for the billing history.
 * Idempotent via paypalEventId unique constraint.
 */
async function onPaymentSaleCompleted(
  eventId: string,
  resource: Record<string, unknown>,
) {
  const paypalSubId = resource.billing_agreement_id as string | undefined;
  if (!paypalSubId) {
    console.warn("[paypal/webhook] PAYMENT.SALE.COMPLETED: missing billing_agreement_id");
    return;
  }

  const sub = await prisma.subscription.findUnique({
    where: { paypalSubscriptionId: paypalSubId },
    include: { user: { select: { email: true } } },
  });
  if (!sub) {
    console.warn(`[paypal/webhook] PAYMENT.SALE.COMPLETED: no Subscription for ${paypalSubId}`);
    return;
  }

  // Idempotency: if an Order already exists with this event ID, skip
  const existing = await prisma.order.findUnique({ where: { paypalEventId: eventId } });
  if (existing) {
    console.log(`[paypal/webhook] PAYMENT.SALE.COMPLETED: event ${eventId} already processed`);
    return;
  }

  // Parse payment amount
  const amountObj = resource.amount as Record<string, unknown> | undefined;
  const amountUsd = parseFloat((amountObj?.total as string) ?? "0");
  // Store in smallest unit (cents for USD)
  const totalAmount = Math.round(amountUsd * 100);

  // Fetch next billing date from PayPal to set new period end
  let nextPeriodEnd: Date | null = null;
  try {
    const details = await getSubscription(paypalSubId);
    const billingInfo = details.billing_info as Record<string, unknown> | undefined;
    nextPeriodEnd = parseDate(billingInfo?.next_billing_time);
  } catch (err) {
    console.warn("[paypal/webhook] PAYMENT.SALE.COMPLETED: Could not fetch sub details:", err);
  }

  if (!nextPeriodEnd) {
    // Infer from current period end or fallback to +1 month
    const base = sub.currentPeriodEnd ?? new Date();
    nextPeriodEnd = new Date(base);
    nextPeriodEnd.setUTCMonth(nextPeriodEnd.getUTCMonth() + 1);
  }

  const now = new Date();
  await prisma.$transaction([
    // Extend subscription billing period
    prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: nextPeriodEnd,
        cancelAtPeriodEnd: false, // payment succeeded → clear any pending cancel
      },
    }),
    // Extend site expiry
    prisma.site.update({
      where: { id: sub.siteId },
      data: {
        accountType: "1",
        expiresAt: nextPeriodEnd,
        lastReminderDay: null,
      },
    }),
    // Record order for billing history
    prisma.order.create({
      data: {
        userId: sub.userId,
        siteId: sub.siteId,
        orderNumber: ppOrderNumber(),
        totalAmount,
        status: "PAID",
        orderType: "SUBSCRIPTION",
        paymentChannel: "PAYPAL",
        subscriptionId: sub.id,
        paypalEventId: eventId,
        paymentMethod: "PayPal",
        subscriptionSiteId: sub.siteId,
      },
    }),
  ]);

  // Send receipt email
  if (sub.user.email) {
    const siteForReceipt = await prisma.site.findUnique({
      where: { id: sub.siteId },
      select: { name: true },
    });
    const periodStart = parseDate(resource.create_time) ?? now;
    await sendSubscriptionReceiptEmail(sub.user.email, {
      siteName: siteForReceipt?.name ?? sub.siteId,
      amount: `$${amountUsd.toFixed(2)}`,
      periodStart: formatDate(periodStart),
      periodEnd: formatDate(nextPeriodEnd),
      orderNumber: ppOrderNumber(), // display only — real order number in DB
    });
  }

  console.log(
    `[paypal/webhook] PAYMENT.SALE.COMPLETED: site=${sub.siteId} ` +
      `$${amountUsd} → paid until ${nextPeriodEnd.toISOString()}`,
  );
}

/**
 * PAYMENT.SALE.DENIED
 * Mark subscription as PAYMENT_FAILED. Send alert to site owner.
 */
async function onPaymentSaleDenied(
  eventId: string,
  resource: Record<string, unknown>,
) {
  const paypalSubId = resource.billing_agreement_id as string | undefined;
  if (!paypalSubId) return;

  const sub = await prisma.subscription.findUnique({
    where: { paypalSubscriptionId: paypalSubId },
    include: {
      user: { select: { email: true, name: true } },
      site: { select: { name: true } },
    },
  });
  if (!sub) return;

  // Idempotency
  const existing = await prisma.order.findUnique({ where: { paypalEventId: eventId } });
  if (existing) return;

  const amountObj = resource.amount as Record<string, unknown> | undefined;
  const amountUsd = parseFloat((amountObj?.total as string) ?? "0");

  await prisma.$transaction([
    prisma.subscription.update({
      where: { id: sub.id },
      data: { status: "PAYMENT_FAILED" },
    }),
    prisma.order.create({
      data: {
        userId: sub.userId,
        siteId: sub.siteId,
        orderNumber: ppOrderNumber(),
        totalAmount: Math.round(amountUsd * 100),
        status: "CANCELLED",
        orderType: "SUBSCRIPTION",
        paymentChannel: "PAYPAL",
        subscriptionId: sub.id,
        paypalEventId: eventId,
        paymentMethod: "PayPal",
        subscriptionSiteId: sub.siteId,
      },
    }),
  ]);

  // Alert the site owner (use template)
  if (sub.user.email) {
    const origin = process.env.NEXTAUTH_URL ?? "https://homenshop.com";
    await sendSubscriptionPaymentFailedEmail(sub.user.email, {
      siteName: sub.site.name,
      retryUrl: `${origin}/dashboard/site/${sub.siteId}/extend`,
    });
  }

  console.log(`[paypal/webhook] PAYMENT.SALE.DENIED: site=${sub.siteId} sub=${paypalSubId}`);
}

/**
 * BILLING.SUBSCRIPTION.CANCELLED
 * Set cancelAtPeriodEnd=true so cron expires the site after the period ends.
 */
async function onSubscriptionCancelled(resource: Record<string, unknown>) {
  const paypalSubId = resource.id as string;
  const sub = await prisma.subscription.findUnique({
    where: { paypalSubscriptionId: paypalSubId },
  });
  if (!sub) return;

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "CANCELLED", cancelAtPeriodEnd: true },
  });

  // Notify the site owner
  const cancelOwner = await prisma.user.findUnique({
    where: { id: sub.userId },
    select: { email: true },
  });
  const cancelSite = await prisma.site.findUnique({
    where: { id: sub.siteId },
    select: { name: true },
  });
  if (cancelOwner?.email) {
    const origin = process.env.NEXTAUTH_URL ?? "https://homenshop.com";
    await sendSubscriptionCancelledEmail(cancelOwner.email, {
      siteName: cancelSite?.name ?? sub.siteId,
      accessUntil: formatDate(sub.currentPeriodEnd),
      resubscribeUrl: `${origin}/dashboard/site/${sub.siteId}/extend`,
    });
  }

  console.log(`[paypal/webhook] SUBSCRIPTION.CANCELLED: site=${sub.siteId}`);
}

/**
 * CUSTOMER.DISPUTE.CREATED
 * Alert admin immediately; no automated action taken.
 */
async function onDisputeCreated(resource: Record<string, unknown>) {
  const disputeId = resource.dispute_id as string ?? "unknown";
  const amount = (resource.dispute_amount as Record<string, unknown>)?.value ?? "?";
  const currency = (resource.dispute_amount as Record<string, unknown>)?.currency_code ?? "USD";

  await sendAdminAlert(
    `[홈앤샵] PayPal 분쟁 생성 — ${disputeId}`,
    `<p>PayPal dispute created.</p>
    <p>Dispute ID: <strong>${disputeId}</strong></p>
    <p>Amount: <strong>${amount} ${currency}</strong></p>
    <p>Resource: <pre>${JSON.stringify(resource, null, 2)}</pre></p>`,
  );

  console.warn(`[paypal/webhook] CUSTOMER.DISPUTE.CREATED: ${disputeId} $${amount} ${currency}`);
}

// ─── Main webhook handler ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Read raw body FIRST (must not be parsed before signature verification)
  const rawBody = await request.text();

  // Verify PayPal signature
  try {
    await verifyWebhookSignature(request.headers, rawBody);
  } catch (err) {
    if (err instanceof PayPalError && err.status === 401) {
      console.warn("[paypal/webhook] Signature verification failed:", err.message);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
    // Other errors (network, missing env var) — log but don't reject PayPal
    console.error("[paypal/webhook] Signature verification error:", err);
    return NextResponse.json({ error: "Verification error" }, { status: 500 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event_type as string;
  const eventId = event.id as string;
  const resource = (event.resource ?? {}) as Record<string, unknown>;

  console.log(`[paypal/webhook] ${eventType} (${eventId})`);

  try {
    switch (eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
        await onSubscriptionActivated(resource);
        break;

      case "PAYMENT.SALE.COMPLETED":
        await onPaymentSaleCompleted(eventId, resource);
        break;

      case "PAYMENT.SALE.DENIED":
      case "PAYMENT.SALE.REFUNDED":
        await onPaymentSaleDenied(eventId, resource);
        break;

      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        await onSubscriptionCancelled(resource);
        break;

      case "CUSTOMER.DISPUTE.CREATED":
        await onDisputeCreated(resource);
        break;

      default:
        // Log unknown events for observability — always return 200 so PayPal
        // doesn't retry events we intentionally ignore.
        console.log(`[paypal/webhook] Unhandled event type: ${eventType}`);
    }
  } catch (err) {
    // Catch-all: log the error but return 200 to prevent PayPal retries
    // for non-transient bugs. Investigate via logs.
    console.error(`[paypal/webhook] Handler error for ${eventType}:`, err);
  }

  return NextResponse.json({ ok: true });
}
