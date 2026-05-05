import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Prisma } from "@/generated/prisma/client";
import DashboardShell from "../dashboard-shell";
import { parsePageParam } from "@/lib/pagination";
import { getTempDomain } from "@/lib/temp-domains";

/**
 * Extract the first image filename from either the new `images` JSON field
 * or the legacy `photos` pipe-delimited text column. Migrated sites (e.g.
 * ybsurplus) still have all their data in `photos` and an empty `images`,
 * so admin pages that only read `images` end up showing no thumbnails.
 */
function firstImageFile(p: { images: unknown; photos?: string | null }): string | null {
  if (Array.isArray(p.images)) {
    for (const entry of p.images) {
      const parts = String(entry).split("|").map(s => s.trim()).filter(Boolean);
      if (parts.length) return parts[0];
    }
  }
  if (typeof p.photos === "string" && p.photos.trim()) {
    const parts = p.photos.split("|").map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[0];
  }
  return null;
}

/** Build a URL pointing at nginx's per-site thumbnailer (thumb.php). */
function thumbUrl(
  filename: string,
  site: { shopId: string; tempDomain?: string | null },
  size: string
): string {
  if (filename.startsWith("http") || filename.startsWith("/uploads/")) return filename;
  return `https://${getTempDomain(site)}/${site.shopId}/thumb/${size}/${encodeURIComponent(filename)}`;
}

async function getCategoryMap(siteId: string): Promise<Record<string, string>> {
  const categories = await prisma.productCategory.findMany({
    where: { siteId },
    select: { legacyId: true, name: true },
  });
  const map: Record<string, string> = {};
  for (const c of categories) {
    if (c.legacyId != null) {
      map[String(c.legacyId)] = c.name;
    }
  }
  return map;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "판매중",
  HIDDEN: "숨김",
  SOLDOUT: "품절",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  HIDDEN:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  SOLDOUT:
    "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const PER_PAGE = 30;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; cat?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { q, page: pageStr, status, cat } = await searchParams;
  const currentPage = parsePageParam(pageStr);

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  const categoryMap = site ? await getCategoryMap(site.id) : {};

  let products: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  let totalCount = 0;

  if (site) {
    const where: Prisma.ProductWhereInput = { siteId: site.id };

    if (q && q.trim()) {
      where.name = { contains: q.trim(), mode: "insensitive" };
    }
    if (status && status !== "ALL") {
      where.status = status as Prisma.EnumProductStatusFilter;
    }
    if (cat && cat !== "ALL") {
      where.category = cat;
    }

    totalCount = await prisma.product.count({ where });
    products = await prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * PER_PAGE,
      take: PER_PAGE,
    });
  }

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  // Build sorted category list for the filter dropdown
  const categoryOptions = Object.entries(categoryMap)
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build query string helper
  function qs(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (cat) params.set("cat", cat);
    if (pageStr) params.set("page", pageStr);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "" || (v === "1" && k === "page")) {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "상품 관리" },
      ]}
    >
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">상품 관리</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              총 {totalCount}개의 상품
              {q && <span> &middot; &quot;{q}&quot; 검색 결과</span>}
              {cat && cat !== "ALL" && categoryMap[cat] && <span> &middot; {categoryMap[cat]}</span>}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/products/categories"
              className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              카테고리 관리
            </Link>
            <Link
              href="/dashboard/products/new"
              className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              + 상품 등록
            </Link>
          </div>
        </div>

        {/* Search & Filter */}
        {site && (
          <form action="/dashboard/products" method="GET" className="mb-4 flex gap-2 items-center flex-wrap">
            <input
              type="text"
              name="q"
              defaultValue={q || ""}
              placeholder="상품명 검색..."
              className="flex-1 min-w-[200px] rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            {categoryOptions.length > 0 && (
              <select
                name="cat"
                defaultValue={cat || "ALL"}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              >
                <option value="ALL">전체 카테고리</option>
                {categoryOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <select
              name="status"
              defaultValue={status || "ALL"}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="ALL">전체 상태</option>
              <option value="ACTIVE">판매중</option>
              <option value="HIDDEN">숨김</option>
              <option value="SOLDOUT">품절</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
            >
              검색
            </button>
            {(q || (status && status !== "ALL") || (cat && cat !== "ALL")) && (
              <Link
                href="/dashboard/products"
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                초기화
              </Link>
            )}
          </form>
        )}

        {!site && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              사이트를 먼저 생성해주세요.
            </p>
            <Link
              href="/dashboard/site"
              className="mt-3 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              사이트 만들기
            </Link>
          </div>
        )}

        {site && products.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              {q ? `"${q}" 검색 결과가 없습니다.` : "등록된 상품이 없습니다."}
            </p>
            {!q && (
              <Link
                href="/dashboard/products/new"
                className="mt-3 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
              >
                첫 상품 등록하기
              </Link>
            )}
          </div>
        )}

        {products.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="w-20 px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    이미지
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    상품명
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    카테고리
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    판매가
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    재고
                  </th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">
                    상태
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    등록일
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const file = firstImageFile(product);
                  const thumb = file && site ? thumbUrl(file, site, "120x120") : null;
                  return (
                  <tr
                    key={product.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="block w-14 h-14 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800"
                      >
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full grid place-items-center text-[10px] text-zinc-400">
                            이미지 없음
                          </div>
                        )}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {product.category ? (categoryMap[product.category] || product.category) : ""}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {product.salePrice != null ? (
                        <div>
                          <span className="line-through text-zinc-400 mr-1">
                            {product.price.toLocaleString("ko-KR")}원
                          </span>
                          <span className="font-medium text-red-600 dark:text-red-400">
                            {product.salePrice.toLocaleString("ko-KR")}원
                          </span>
                        </div>
                      ) : (
                        <span>
                          {product.price.toLocaleString("ko-KR")}원
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {product.stock.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[product.status] ?? ""}`}
                      >
                        {STATUS_LABELS[product.status] ?? product.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {new Date(product.createdAt).toLocaleDateString(
                        "ko-KR"
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-1">
            {currentPage > 1 && (
              <Link
                href={`/dashboard/products${qs({ page: String(currentPage - 1) })}`}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                이전
              </Link>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
              .reduce<(number | string)[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                typeof p === "string" ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-sm text-zinc-400">...</span>
                ) : (
                  <Link
                    key={p}
                    href={`/dashboard/products${qs({ page: String(p) })}`}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      p === currentPage
                        ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {p}
                  </Link>
                )
              )}
            {currentPage < totalPages && (
              <Link
                href={`/dashboard/products${qs({ page: String(currentPage + 1) })}`}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                다음
              </Link>
            )}
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 대시보드로 돌아가기
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
