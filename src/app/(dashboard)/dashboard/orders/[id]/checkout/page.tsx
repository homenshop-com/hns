import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CheckoutClient from "./checkout-client";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, price: true, salePrice: true, images: true },
          },
        },
      },
    },
  });

  // Verify order exists and belongs to user
  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  // Only PENDING orders can be paid
  if (order.status !== "PENDING") {
    redirect(`/dashboard/orders/${id}`);
  }

  // Serialize order data for client component
  const orderData = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    shippingName: order.shippingName,
    shippingPhone: order.shippingPhone,
    shippingAddr: order.shippingAddr,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.product.name,
      quantity: item.quantity,
      price: item.price,
    })),
  };

  const customerInfo = {
    name: session.user.name || "",
    email: session.user.email || "",
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

      <main className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <Link
            href={`/dashboard/orders/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; 주문 상세
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">결제하기</h2>

        <CheckoutClient order={orderData} customer={customerInfo} />
      </main>
    </div>
  );
}
