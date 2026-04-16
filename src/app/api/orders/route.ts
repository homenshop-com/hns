import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendOrderConfirmationEmail } from "@/lib/email";

// GET /api/orders — List authenticated user's orders
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, images: true },
          },
        },
      },
    },
  });

  return NextResponse.json({ orders });
}

// POST /api/orders — Create a new order
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { items, shippingName, shippingPhone, shippingAddr, shippingMemo } =
    body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "주문 상품이 필요합니다." },
      { status: 400 }
    );
  }

  // 수량 검증: 양의 정수(1~9999)만 허용
  for (const item of items as { productId?: unknown; quantity?: unknown }[]) {
    if (!item || typeof item.productId !== "string") {
      return NextResponse.json(
        { error: "잘못된 상품 정보입니다." },
        { status: 400 }
      );
    }
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > 9999
    ) {
      return NextResponse.json(
        { error: "수량은 1~9999 사이 정수여야 합니다." },
        { status: 400 }
      );
    }
  }

  if (!shippingName || !shippingPhone || !shippingAddr) {
    return NextResponse.json(
      { error: "배송 정보를 입력해주세요." },
      { status: 400 }
    );
  }

  // Fetch all products and validate
  const productIds = items.map(
    (item: { productId: string }) => item.productId
  );
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { error: "존재하지 않는 상품이 포함되어 있습니다." },
      { status: 400 }
    );
  }

  // Check stock availability and calculate total
  let totalAmount = 0;
  const orderItems: { productId: string; quantity: number; price: number }[] =
    [];

  for (const item of items as { productId: string; quantity: number }[]) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) {
      return NextResponse.json(
        { error: `상품을 찾을 수 없습니다: ${item.productId}` },
        { status: 400 }
      );
    }

    if (product.stock < item.quantity) {
      return NextResponse.json(
        {
          error: `재고가 부족합니다: ${product.name} (재고: ${product.stock}개)`,
        },
        { status: 400 }
      );
    }

    const unitPrice = product.salePrice ?? product.price;
    totalAmount += unitPrice * item.quantity;
    orderItems.push({
      productId: item.productId,
      quantity: item.quantity,
      price: unitPrice,
    });
  }

  // Generate order number: ORD-YYYYMMDD-XXXX
  const now = new Date();
  const dateStr = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const randomChars = Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase();
  const orderNumber = `ORD-${dateStr}-${randomChars}`;

  // Create order and decrease stock in a transaction
  // 원자적 재고 감소: WHERE stock >= qty 조건부 업데이트로 oversell 방지
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      for (const item of orderItems) {
        const result = await tx.product.updateMany({
          where: {
            id: item.productId,
            stock: { gte: item.quantity },
          },
          data: { stock: { decrement: item.quantity } },
        });
        if (result.count === 0) {
          // 동시성 경합: 사전 체크 통과했지만 실제 감소 시점에 재고 부족
          const productName =
            products.find((p) => p.id === item.productId)?.name ?? item.productId;
          throw new Error(`OUT_OF_STOCK:${productName}`);
        }
      }

      return tx.order.create({
        data: {
          userId: session.user.id,
          orderNumber,
          totalAmount,
          shippingName,
          shippingPhone,
          shippingAddr,
          shippingMemo: shippingMemo || null,
          items: {
            create: orderItems,
          },
        },
        include: {
          items: {
            include: {
              product: {
                select: { name: true },
              },
            },
          },
        },
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("OUT_OF_STOCK:")) {
      return NextResponse.json(
        { error: `재고가 부족합니다: ${msg.slice("OUT_OF_STOCK:".length)}` },
        { status: 409 }
      );
    }
    console.error("Order transaction failed:", err);
    return NextResponse.json({ error: "주문 처리에 실패했습니다." }, { status: 500 });
  }

  // Send order confirmation email (fire-and-forget)
  const emailItems = order.items.map((item) => ({
    name: item.product.name,
    quantity: item.quantity,
    price: item.price,
  }));

  sendOrderConfirmationEmail(session.user.email!, {
    orderNumber: order.orderNumber,
    items: emailItems,
    totalAmount: order.totalAmount,
  });

  return NextResponse.json({ order }, { status: 201 });
}
