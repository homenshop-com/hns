import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { indexProduct } from "@/lib/search";
import { resolveOperatingSite } from "@/lib/site-access";

// GET /api/products — List all products for the operating site (own default, or
// a manageable customer site when ?siteId= is supplied by a reseller).
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = request.nextUrl.searchParams.get("siteId");
  const site = await resolveOperatingSite(siteId);

  if (!site) {
    return NextResponse.json({ products: [] });
  }

  const products = await prisma.product.findMany({
    where: { siteId: site.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ products });
}

// POST /api/products — Create a new product
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, price, salePrice, stock, category, status, images, imageVariants, siteId } = body;

  const site = await resolveOperatingSite(siteId);

  if (!site) {
    return NextResponse.json(
      { error: "사이트를 먼저 생성해주세요." },
      { status: 400 }
    );
  }

  if (!name) {
    return NextResponse.json(
      { error: "상품명은 필수입니다." },
      { status: 400 }
    );
  }

  const product = await prisma.product.create({
    data: {
      siteId: site.id,
      name,
      description: description || null,
      price: Number(price),
      salePrice: salePrice ? Number(salePrice) : null,
      stock: stock ? Number(stock) : 0,
      category: category || null,
      status: status || "ACTIVE",
      ...(images && { images }),
    },
  });

  // Fire-and-forget: index product in search
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

  return NextResponse.json({ product }, { status: 201 });
}
