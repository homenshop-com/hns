import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CheckoutClient from "./checkout-client";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default async function CheckoutPage({
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
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">homeNshop</Link>
            <span className="dash-logo-sub">{td("cards.orders")}</span>
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
            href={`/dashboard/orders/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; 주문 상세
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">결제하기</h2>

        <CheckoutClient order={orderData} customer={customerInfo} />
      </main>
      <footer className="dash-footer" />
    </div>
  );
}
