import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProductEditClient from "./product-edit-client";

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
    where: { userId: session.user.id },
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

  const initialData = {
    name: product.name,
    description: product.description ?? "",
    price: String(product.price),
    salePrice: product.salePrice != null ? String(product.salePrice) : "",
    stock: String(product.stock),
    category: product.category ?? "",
    status: product.status,
    image: "",
  };

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
    </div>
  );
}
