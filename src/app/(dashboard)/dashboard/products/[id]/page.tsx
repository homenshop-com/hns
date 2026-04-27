import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProductEditClient from "./product-edit-client";
import DashboardShell from "../../dashboard-shell";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
  });

  if (!site) {
    notFound();
  }

  const product = await prisma.product.findFirst({
    where: { id, siteId: site.id },
  });

  if (!product) {
    notFound();
  }

  // Parse legacy images: Json field may contain ["file1.jpg|file2.jpg|"] or ["url1","url2"]
  const imageUrls: string[] = [];
  if (product.images) {
    const imgs = product.images as string[];
    for (const entry of imgs) {
      // Legacy format: pipe-separated filenames in a single string
      const parts = String(entry).split("|").filter(Boolean);
      for (const p of parts) {
        if (p.startsWith("http") || p.startsWith("/uploads/")) {
          imageUrls.push(p);
        } else {
          imageUrls.push(`https://home.homenshop.com/${site.shopId}/uploaded/${encodeURIComponent(p)}`);
        }
      }
    }
  }

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
  };

  return (
    <DashboardShell
      active="products"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "상품 관리", href: "/dashboard/products" },
        { label: product.name },
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

        <h2 className="text-2xl font-bold mb-6">상품 수정</h2>

        <ProductEditClient productId={id} initialData={initialData} />
      </div>
    </DashboardShell>
  );
}
