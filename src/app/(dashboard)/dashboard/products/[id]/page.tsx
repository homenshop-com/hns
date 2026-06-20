import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import ProductEditClient from "./product-edit-client";
import DashboardShell from "../../dashboard-shell";
import { getTempDomain } from "@/lib/temp-domains";
import { resolveOperatingSite } from "@/lib/site-access";

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const tp = await getTranslations("productsDash");
  const { id } = await params;
  const { siteId } = await searchParams;

  const site = await resolveOperatingSite(siteId);

  if (!site) {
    notFound();
  }

  const product = await prisma.product.findFirst({
    where: { id, siteId: site.id },
  });

  if (!product) {
    notFound();
  }

  const listHref = siteId ? `/dashboard/products?siteId=${siteId}` : "/dashboard/products";

  // Parse images. Newer rows store filenames in the `images` JSON field;
  // legacy/migrated rows still keep them as a pipe-separated string in
  // `photos`. Without the photos fallback, every migrated site renders
  // an empty image picker (ybsurplus, etc).
  const collectFiles = (): string[] => {
    const out: string[] = [];
    if (Array.isArray(product.images)) {
      for (const entry of product.images) {
        String(entry).split("|").map(s => s.trim()).filter(Boolean).forEach(f => out.push(f));
      }
    }
    if (out.length === 0 && typeof product.photos === "string" && product.photos.trim()) {
      product.photos.split("|").map(s => s.trim()).filter(Boolean).forEach(f => out.push(f));
    }
    return out;
  };

  const imageUrls: string[] = collectFiles().map((p) => {
    if (p.startsWith("http") || p.startsWith("/uploads/")) return p;
    return `https://${getTempDomain(site)}/${site.shopId}/uploaded/${encodeURIComponent(p)}`;
  });

  const initialData = {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    salePrice: product.salePrice != null ? String(product.salePrice) : "",
    stock: String(product.stock),
    category: product.category ?? "",
    status: product.status,
    images: imageUrls,
    imageVariants: [],
    seoTitle: product.seoTitle ?? "",
    seoDescription: product.seoDescription ?? "",
  };

  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: tp("breadcrumbHome"), href: "/dashboard" },
        { label: tp("breadcrumbProducts"), href: listHref },
        { label: product.name },
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

        <h2 className="text-2xl font-bold mb-6">{tp("editProduct")}</h2>

        <ProductEditClient productId={id} initialData={initialData} siteId={siteId} />
      </div>
    </DashboardShell>
  );
}
