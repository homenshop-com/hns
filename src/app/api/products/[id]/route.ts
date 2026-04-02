import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { indexProduct, removeProduct } from "@/lib/search";

// GET /api/products/[id] — Get a single product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const product = await prisma.product.findFirst({
    where: { id, siteId: site.id },
  });

  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ product });
}

// PUT /api/products/[id] — Update a product
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Verify the product belongs to user's site
  const existing = await prisma.product.findFirst({
    where: { id, siteId: site.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, price, salePrice, stock, category, status } = body;

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(price !== undefined && { price: Number(price) }),
      ...(salePrice !== undefined && {
        salePrice: salePrice ? Number(salePrice) : null,
      }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(category !== undefined && { category: category || null }),
      ...(status !== undefined && { status }),
    },
  });

  // Fire-and-forget: update search index
  try {
    indexProduct({
      id: product.id,
      name: product.name,
      description: product.description || "",
      price: product.price,
      salePrice: product.salePrice,
      category: product.category || "",
      status: product.status,
      siteId: site.id,
      siteName: site.name,
      createdAt: product.createdAt.toISOString(),
    }).catch((err) => console.error("Search index error:", err));
  } catch (err) {
    console.error("Search index error:", err);
  }

  return NextResponse.json({ product });
}

// DELETE /api/products/[id] — Delete a product
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  if (!site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const existing = await prisma.product.findFirst({
    where: { id, siteId: site.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.product.delete({ where: { id } });

  // Fire-and-forget: remove from search index
  try {
    removeProduct(id).catch((err) =>
      console.error("Search index error:", err)
    );
  } catch (err) {
    console.error("Search index error:", err);
  }

  return NextResponse.json({ success: true });
}
