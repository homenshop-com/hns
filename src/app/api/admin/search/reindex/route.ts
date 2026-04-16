import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  setupIndexes,
  reindexAllProducts,
  reindexAllPosts,
} from "@/lib/search";
import type { ProductDocument, PostDocument } from "@/lib/search";

// POST /api/admin/search/reindex — Reindex all data (admin only)
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Setup index settings
    await setupIndexes();

    // Load all products with site name
    const products = await prisma.product.findMany({
      include: {
        site: { select: { id: true, name: true } },
      },
    });

    const productDocs: ProductDocument[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description || "",
      price: p.price,
      salePrice: p.salePrice,
      category: p.category || "",
      status: p.status,
      siteId: p.site.id,
      siteName: p.site.name,
      createdAt: p.createdAt.toISOString(),
    }));

    await reindexAllProducts(productDocs);

    // Load all posts with category (board) name and site name
    const posts = await prisma.boardPost.findMany({
      include: {
        category: {
          include: {
            site: { select: { id: true, name: true } },
          },
        },
        site: { select: { id: true, name: true } },
      },
    });

    const postDocs: PostDocument[] = posts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author: p.author,
      boardId: p.category?.id ?? "",
      boardTitle: p.category?.name ?? "",
      siteId: p.category?.site.id ?? p.site.id,
      siteName: p.category?.site.name ?? p.site.name,
      views: p.views,
      createdAt: p.createdAt.toISOString(),
    }));

    await reindexAllPosts(postDocs);

    return NextResponse.json({
      productsIndexed: productDocs.length,
      postsIndexed: postDocs.length,
    });
  } catch (error) {
    console.error("Reindex error:", error);
    return NextResponse.json(
      { error: "인덱싱 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
