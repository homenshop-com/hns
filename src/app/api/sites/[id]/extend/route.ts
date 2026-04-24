import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  priceForMonths,
  isValidSubscriptionMonths,
  generateOrderNumber,
} from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/sites/[id]/extend
 * Body: { months: 12 | 24 | 36 }
 *
 * Creates a PENDING SUBSCRIPTION order for manual bank-transfer payment.
 * Returns the orderNumber so the client can display the deposit guide.
 * Actual site extension happens when an admin confirms the deposit (see
 * /api/admin/orders/[id] PUT → applyPaidSubscription transition hook).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;
  const body = (await request.json().catch(() => ({}))) as { months?: number };
  const months = body.months;
  if (!isValidSubscriptionMonths(months)) {
    return NextResponse.json({ error: "Invalid months" }, { status: 400 });
  }

  const site = await prisma.site.findFirst({
    where: { id: siteId, userId: session.user.id, isTemplateStorage: false },
    select: { id: true, shopId: true, name: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const totalAmount = priceForMonths(months);
  if (totalAmount <= 0) {
    return NextResponse.json({ error: "Invalid price" }, { status: 500 });
  }

  const order = await prisma.order.create({
    data: {
      userId: session.user.id,
      orderNumber: generateOrderNumber(),
      totalAmount,
      status: "PENDING",
      orderType: "SUBSCRIPTION",
      subscriptionMonths: months,
      subscriptionSiteId: site.id,
      paymentMethod: "BANK_TRANSFER",
    },
    select: {
      id: true,
      orderNumber: true,
      totalAmount: true,
      subscriptionMonths: true,
      status: true,
    },
  });

  return NextResponse.json({ ok: true, order, shopId: site.shopId });
}
