import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/storefront/orders — Create order from storefront (guest checkout)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    siteId,
    items,
    shippingName,
    shippingPhone,
    shippingAddr,
    shippingMemo,
  } = body;

  if (!siteId) {
    return NextResponse.json(
      { error: "사이트 정보가 필요합니다." },
      { status: 400 }
    );
  }

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

  // Verify site exists and get owner
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, userId: true },
  });

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 찾을 수 없습니다." },
      { status: 404 }
    );
  }

  // Fetch products and validate they belong to this site
  const productIds = items.map(
    (item: { productId: string }) => item.productId
  );
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, siteId },
  });

  if (products.length !== productIds.length) {
    return NextResponse.json(
      { error: "존재하지 않는 상품이 포함되어 있습니다." },
      { status: 400 }
    );
  }

  // Check stock and calculate total
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

  // Generate order number
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

  // Create order under the site owner's account, decrease stock
  const order = await prisma.$transaction(async (tx) => {
    for (const item of orderItems) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return tx.order.create({
      data: {
        userId: site.userId,
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

  return NextResponse.json({ order }, { status: 201 });
}
