import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { searchProducts, searchPosts } from "@/lib/search";
import DashboardShell from "../dashboard-shell";
import { parsePageParam } from "@/lib/pagination";

type SearchType = "all" | "products" | "posts";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const resolvedParams = await searchParams;
  const q = resolvedParams.q || "";
  const type = (resolvedParams.type || "all") as SearchType;
  const page = parsePageParam(resolvedParams.page);
  const limit = 20;
  const offset = (page - 1) * limit;

  let productsResult: Awaited<ReturnType<typeof searchProducts>> | null = null;
  let postsResult: Awaited<ReturnType<typeof searchPosts>> | null = null;

  if (q.trim()) {
    try {
      if (type === "products" || type === "all") {
        productsResult = await searchProducts(q, { limit, offset });
      }
      if (type === "posts" || type === "all") {
        postsResult = await searchPosts(q, { limit, offset });
      }
    } catch (error) {
      console.error("Search error:", error);
    }
  }

  const totalProducts = productsResult?.estimatedTotalHits || 0;
  const totalPosts = postsResult?.estimatedTotalHits || 0;

  // For pagination, use the active tab's total
  const activeTotal =
    type === "products"
      ? totalProducts
      : type === "posts"
        ? totalPosts
        : totalProducts + totalPosts;
  const totalPages = Math.ceil(activeTotal / limit);

  const tabs: { key: SearchType; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "products", label: "상품" },
    { key: "posts", label: "게시글" },
  ];

  return (
    <DashboardShell
      active="search"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "검색" },
      ]}
    >
      <div>
        <h2 className="mb-6 text-2xl font-bold">검색</h2>

        {/* Search form */}
        <form method="GET" action="/dashboard/search" className="mb-6">
          <div className="flex gap-2">
            <input type="hidden" name="type" value={type} />
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="검색어를 입력하세요..."
                className="h-11 w-full rounded-lg border border-zinc-200 bg-white pl-10 pr-4 text-sm outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              검색
            </button>
          </div>
        </form>

        {/* Tabs */}
        {q.trim() && (
          <>
            <div className="mb-6 flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {tabs.map((tab) => (
                <Link
                  key={tab.key}
                  href={`/dashboard/search?q=${encodeURIComponent(q)}&type=${tab.key}`}
                  className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    type === tab.key
                      ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                  }`}
                >
                  {tab.label}
                  {tab.key === "all" && q.trim()
                    ? ` (${totalProducts + totalPosts})`
                    : tab.key === "products" && q.trim()
                      ? ` (${totalProducts})`
                      : tab.key === "posts" && q.trim()
                        ? ` (${totalPosts})`
                        : ""}
                </Link>
              ))}
            </div>

            {/* Product results */}
            {(type === "all" || type === "products") &&
              productsResult &&
              productsResult.hits.length > 0 && (
                <section className="mb-8">
                  {type === "all" && (
                    <h3 className="mb-3 text-lg font-semibold">
                      상품 ({totalProducts})
                    </h3>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {productsResult.hits.map((hit) => {
                      const product = hit as Record<string, unknown>;
                      return (
                        <div
                          key={product.id as string}
                          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex items-start justify-between">
                            <h4 className="font-semibold">
                              {product.name as string}
                            </h4>
                            <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {product.category as string || "미분류"}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                            {product.description as string || "설명 없음"}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            {product.salePrice ? (
                              <>
                                <span className="font-bold text-red-600">
                                  {(product.salePrice as number).toLocaleString()}원
                                </span>
                                <span className="text-sm text-zinc-400 line-through">
                                  {(product.price as number).toLocaleString()}원
                                </span>
                              </>
                            ) : (
                              <span className="font-bold">
                                {(product.price as number).toLocaleString()}원
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-zinc-400">
                            {product.siteName as string}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

            {/* Post results */}
            {(type === "all" || type === "posts") &&
              postsResult &&
              postsResult.hits.length > 0 && (
                <section className="mb-8">
                  {type === "all" && (
                    <h3 className="mb-3 text-lg font-semibold">
                      게시글 ({totalPosts})
                    </h3>
                  )}
                  <div className="space-y-3">
                    {postsResult.hits.map((hit) => {
                      const post = hit as Record<string, unknown>;
                      return (
                        <div
                          key={post.id as string}
                          className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex items-start justify-between">
                            <h4 className="font-semibold">
                              {post.title as string}
                            </h4>
                            <span className="ml-2 shrink-0 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              {post.boardTitle as string}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                            {(post.content as string || "").slice(0, 200)}
                          </p>
                          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-400">
                            <span>{post.author as string}</span>
                            <span>조회 {post.views as number}</span>
                            <span>
                              {new Date(
                                post.createdAt as string
                              ).toLocaleDateString("ko-KR")}
                            </span>
                            <span>{post.siteName as string}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

            {/* No results */}
            {q.trim() &&
              (!productsResult || productsResult.hits.length === 0) &&
              (!postsResult || postsResult.hits.length === 0) && (
                <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
                  <p className="text-lg">검색 결과가 없습니다.</p>
                  <p className="mt-1 text-sm">
                    다른 검색어로 시도해 보세요.
                  </p>
                </div>
              )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                {page > 1 && (
                  <Link
                    href={`/dashboard/search?q=${encodeURIComponent(q)}&type=${type}&page=${page - 1}`}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    이전
                  </Link>
                )}
                <span className="text-sm text-zinc-500">
                  {page} / {totalPages}
                </span>
                {page < totalPages && (
                  <Link
                    href={`/dashboard/search?q=${encodeURIComponent(q)}&type=${type}&page=${page + 1}`}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    다음
                  </Link>
                )}
              </div>
            )}
          </>
        )}

        {/* Empty state when no query */}
        {!q.trim() && (
          <div className="py-12 text-center text-zinc-500 dark:text-zinc-400">
            <svg
              className="mx-auto mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <p className="text-lg">검색어를 입력하세요</p>
            <p className="mt-1 text-sm">상품, 게시글을 검색할 수 있습니다.</p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
