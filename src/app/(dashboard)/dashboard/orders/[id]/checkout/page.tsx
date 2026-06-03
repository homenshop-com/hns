import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import CheckoutClient from "./checkout-client";
import DashboardShell from "../../../dashboard-shell";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const tk = await getTranslations("checkoutDash");

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

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  if (order.status !== "PENDING") {
    redirect(`/dashboard/orders/${id}`);
  }

  const orderData = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    shippingName: order.shippingName,
    shippingPhone: order.shippingPhone,
    shippingAddr: order.shippingAddr,
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.product?.name ?? item.externalName ?? tk("unmappedSku"),
      quantity: item.quantity,
      price: item.price,
    })),
  };

  const customerInfo = {
    name: session.user.name || "",
    email: session.user.email || "",
  };

  return (
    <DashboardShell
      active="orders"
      breadcrumbs={[
        { label: tk("breadcrumbHome"), href: "/dashboard" },
        { label: tk("breadcrumbOrders"), href: "/dashboard/orders" },
        { label: order.orderNumber, href: `/dashboard/orders/${id}` },
        { label: tk("breadcrumbPayment") },
      ]}
    >
      <div>
        <div className="mb-6">
          <Link
            href={`/dashboard/orders/${id}`}
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; {tk("backToOrderDetail")}
          </Link>
        </div>

        <h2 className="text-2xl font-bold mb-6">{tk("payNow")}</h2>

        <CheckoutClient order={orderData} customer={customerInfo} />
      </div>
    </DashboardShell>
  );
}
