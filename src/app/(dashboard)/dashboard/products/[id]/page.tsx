import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProductEditClient from "./product-edit-client";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const td = await getTranslations("dashboard");

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
  let imageUrls: string[] = [];
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
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">homeNshop</Link>
            <span className="dash-logo-sub">{td("cards.products")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">{td("dashboard")}</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">{td("memberInfo")}</Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
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
      </main>
      <footer className="dash-footer" />
    </div>
  );
}
