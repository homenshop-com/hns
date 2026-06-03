import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProductForm from "../product-form";
import DashboardShell from "../../dashboard-shell";

export default async function NewProductPage({
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
        { label: tp("addProduct") },
      ]}
    >
      <div>
        <div className="mb-6">
          <Link
            href={listHref}
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; {tp("productList")}
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">{tp("addProduct")}</h2>

        <ProductForm mode="create" siteId={siteId} />
      </div>
    </DashboardShell>
  );
}
