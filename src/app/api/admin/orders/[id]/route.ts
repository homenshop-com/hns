import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extendedExpiry } from "@/lib/subscription";

// GET /api/admin/orders/[id] — Get order detail (admin only)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, images: true, price: true, salePrice: true },
          },
        },
      },
      user: {
        select: { id: true, email: true, name: true, phone: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  return NextResponse.json({ order });
}

// PUT /api/admin/orders/[id] — Update order status (admin only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  const validStatuses = [
    "PENDING",
    "PAID",
    "SHIPPING",
    "DELIVERED",
    "CANCELLED",
    "REFUNDED",
  ];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "유효하지 않은 주문 상태입니다." },
      { status: 400 }
    );
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  const updatedOrder = await prisma.order.update({
    where: { id },
    data: { status },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, images: true, price: true, salePrice: true },
          },
        },
      },
      user: {
        select: { id: true, email: true, name: true, phone: true },
      },
    },
  });

  // Transition hook: SUBSCRIPTION PENDING → PAID extends the linked site.
  // Only fire on the first transition into PAID so re-saving PAID is idempotent.
  if (
    updatedOrder.orderType === "SUBSCRIPTION" &&
    updatedOrder.status === "PAID" &&
    existing.status !== "PAID" &&
    updatedOrder.subscriptionSiteId &&
    updatedOrder.subscriptionMonths
  ) {
    const site = await prisma.site.findUnique({
      where: { id: updatedOrder.subscriptionSiteId },
      select: { expiresAt: true },
    });
    const newExpiry = extendedExpiry(site?.expiresAt ?? null, updatedOrder.subscriptionMonths);
    await prisma.site.update({
      where: { id: updatedOrder.subscriptionSiteId },
      data: {
        expiresAt: newExpiry,
        accountType: "1",
        // Reset reminder milestone so next cycle's 7/3/1/0-day reminders fire fresh
        lastReminderDay: null,
      },
    });
    console.log(
      `[admin/orders] SUBSCRIPTION PAID: site=${updatedOrder.subscriptionSiteId} +${updatedOrder.subscriptionMonths}m → ${newExpiry.toISOString()}`
    );
  }

  return NextResponse.json({ order: updatedOrder });
}

// DELETE /api/admin/orders/[id] — Hard-delete an order (admin only).
//
// Same safety rails as the user-facing DELETE: only PENDING or
// CANCELLED orders can be hard-deleted. PAID+ orders must go through
// a refund flow first (otherwise their subscription/credit grants
// would be orphaned). OrderItems cascade-delete via the schema;
// CreditTransaction.refOrderId gets SET NULL (audit row stays).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const deletableStates = new Set(["PENDING", "CANCELLED"]);
  if (!deletableStates.has(existing.status)) {
    return NextResponse.json(
      {
        error: `결제 완료 이후의 주문은 삭제할 수 없습니다. (${existing.status}) 먼저 환불 처리 후 CANCELLED 상태로 만드세요.`,
      },
      { status: 409 },
    );
  }

  await prisma.order.delete({ where: { id } });
  console.log(
    `[admin/orders] order deleted: ${existing.orderNumber} (${existing.orderType}/${existing.status}) by admin=${session.user.id}`,
  );
  return NextResponse.json({ ok: true });
}
