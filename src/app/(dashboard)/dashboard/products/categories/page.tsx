import DashboardShell from "../../dashboard-shell";
import CategoriesClient from "./categories-client";

export default async function ProductCategoriesPage({
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
        { label: "카테고리 관리" },
      ]}
    >
      <CategoriesClient siteId={siteId} />
    </DashboardShell>
  );
}
