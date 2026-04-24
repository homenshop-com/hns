import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/orders/[id] — Get order detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Only the order owner or ADMIN can access
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (order.userId !== session.user.id && currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ order });
}

// PUT /api/orders/[id] — Update order status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
  });

  if (!order) {
    return NextResponse.json(
      { error: "주문을 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Only the order owner or ADMIN can update
  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (order.userId !== session.user.id && currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
        select: { id: true, email: true, name: true },
      },
    },
  });

  return NextResponse.json({ order: updatedOrder });
}

// DELETE /api/orders/[id] — Hard-delete an order (owner or ADMIN).
//
// Safety rules:
//   · Only orders in PENDING or CANCELLED state can be deleted. A PAID
//     order must go through refund first; deleting it would orphan the
//     payment and any credit/subscription grants.
//   · OrderItems are removed automatically via the schema's onDelete
//     Cascade; CreditTransaction.refOrderId gets SET NULL (audit row
//     stays, the reference just becomes dangling).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (order.userId !== session.user.id && currentUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deletableStates = new Set(["PENDING", "CANCELLED"]);
  if (!deletableStates.has(order.status)) {
    return NextResponse.json(
      { error: `결제 완료 이후의 주문은 삭제할 수 없습니다. (${order.status}) 먼저 취소·환불 처리가 필요합니다.` },
      { status: 409 },
    );
  }

  await prisma.order.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
