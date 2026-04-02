import { NextRequest, NextResponse } from "next/server";
import { searchProducts, searchPosts } from "@/lib/search";

// GET /api/search — Public search API
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "all";
  const siteId = searchParams.get("siteId") || undefined;
  const category = searchParams.get("category") || undefined;
  const boardId = searchParams.get("boardId") || undefined;
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  if (!q.trim()) {
    return NextResponse.json(
      { error: "검색어를 입력해주세요." },
      { status: 400 }
    );
  }

  try {
    const result: Record<string, unknown> = {};

    if (type === "products" || type === "all") {
      result.products = await searchProducts(q, {
        siteId,
        category,
        limit,
        offset,
      });
    }

    if (type === "posts" || type === "all") {
      result.posts = await searchPosts(q, {
        siteId,
        boardId,
        limit,
        offset,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "검색 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
