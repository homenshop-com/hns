import Link from "next/link";
import ProductForm from "../product-form";
import DashboardShell from "../../dashboard-shell";

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const { siteId } = await searchParams;
  const listHref = siteId ? `/dashboard/products?siteId=${siteId}` : "/dashboard/products";
  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "상품 관리", href: listHref },
        { label: "상품 등록" },
      ]}
    >
      <div>
        <div className="mb-6">
          <Link
            href={listHref}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 상품 목록
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">상품 등록</h2>

        <ProductForm mode="create" siteId={siteId} />
      </div>
    </DashboardShell>
  );
}
