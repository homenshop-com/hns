import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findCreditPack } from "@/lib/credits";

/**
 * POST /api/credits/purchase
 *
 * Body: { packId: string }
 *
 * Creates a PENDING Order with orderType=CREDIT_PACK and returns { orderId,
 * orderNumber, totalAmount, creditAmount } so the client can redirect to
 * the TossPayments checkout page at /dashboard/credits/checkout/{orderId}.
 *
 * No credits are granted here — the /api/payments/confirm hook grants credits
 * once TossPayments returns DONE.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const packId = (body?.packId || "").toString().trim();
  const pack = findCreditPack(packId);
  if (!pack) {
    return NextResponse.json(
      { error: "Invalid pack id" },
      { status: 400 }
    );
  }

  // Generate order number: CRD-YYYYMMDD-XXXX (distinct prefix from ORD-)
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  const orderNumber = `CRD-${dateStr}-${rand}`;

  const order = await prisma.order.create({
    data: {
      userId: session.user.id,
      orderNumber,
      orderType: "CREDIT_PACK",
      totalAmount: pack.priceKrw,
      creditAmount: pack.credits,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    creditAmount: pack.credits,
    packId: pack.id,
  });
}
