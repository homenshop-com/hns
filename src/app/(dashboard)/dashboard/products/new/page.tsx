import Link from "next/link";
import ProductForm from "../product-form";
import DashboardShell from "../../dashboard-shell";

export default function NewProductPage() {
  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "상품 관리", href: "/dashboard/products" },
        { label: "상품 등록" },
      ]}
    >
      <div>
        <div className="mb-6">
          <Link
            href="/dashboard/products"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 상품 목록
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">상품 등록</h2>

        <ProductForm mode="create" />
      </div>
    </DashboardShell>
  );
}
