import { getTranslations } from "next-intl/server";
import DashboardShell from "../../dashboard-shell";
import CategoriesClient from "./categories-client";

export default async function ProductCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const tp = await getTranslations("productsDash");
  const { siteId } = await searchParams;
  const listHref = siteId ? `/dashboard/products?siteId=${siteId}` : "/dashboard/products";
  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: tp("breadcrumbHome"), href: "/dashboard" },
        { label: tp("breadcrumbProducts"), href: listHref },
        { label: tp("manageCategories") },
      ]}
    >
      <CategoriesClient siteId={siteId} />
    </DashboardShell>
  );
}
