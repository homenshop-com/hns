import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

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

export default async function ProductsPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
  });

  const products = site
    ? await prisma.product.findMany({
        where: { siteId: site.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      })
    : [];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-xl font-bold">
            Homenshop
          </Link>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {session.user.name} ({session.user.email})
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">상품 관리</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              총 {products.length}개의 상품
            </p>
          </div>
          <Link
            href="/dashboard/products/new"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            + 상품 등록
          </Link>
        </div>

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
              등록된 상품이 없습니다.
            </p>
            <Link
              href="/dashboard/products/new"
              className="mt-3 inline-block text-sm font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              첫 상품 등록하기
            </Link>
          </div>
        )}

        {products.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    상품명
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
                {products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      {product.category && (
                        <span className="ml-2 text-xs text-zinc-400">
                          {product.category}
                        </span>
                      )}
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
                ))}
              </tbody>
            </table>
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
      </main>
    </div>
  );
}
