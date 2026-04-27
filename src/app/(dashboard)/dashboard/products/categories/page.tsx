import DashboardShell from "../../dashboard-shell";
import CategoriesClient from "./categories-client";

export default function ProductCategoriesPage() {
  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "상품 관리", href: "/dashboard/products" },
        { label: "카테고리 관리" },
      ]}
    >
      <CategoriesClient />
    </DashboardShell>
  );
}
