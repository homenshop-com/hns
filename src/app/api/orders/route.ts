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
  const order = await prisma.$transaction(async (tx) => {
    // Decrease stock for each product
    for (const item of orderItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // Create order with items
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
