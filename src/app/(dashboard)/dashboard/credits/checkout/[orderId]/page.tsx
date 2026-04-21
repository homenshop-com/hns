import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import CreditCheckoutClient from "./checkout-client";

export const metadata = {
  title: "크레딧 결제 — homeNshop",
};

export default async function CreditCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { orderId } = await params;
  const order = await prisma.order.findUnique({ where: { id: orderId } });

  if (!order || order.userId !== session.user.id || order.orderType !== "CREDIT_PACK") {
    notFound();
  }
  if (order.status !== "PENDING") {
    redirect("/dashboard/credits");
  }

  const orderData = {
    id: order.id,
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    creditAmount: order.creditAmount ?? 0,
  };
  const customer = {
    name: session.user.name || "",
    email: session.user.email || "",
  };

  return (
    <div className="credits-page">
      <div className="credits-topbar">
        <Link href="/dashboard/credits" className="credits-back">
          ← 크레딧 페이지로
        </Link>
      </div>

      <div className="credits-checkout">
        <h1 className="credits-checkout-title">크레딧 결제</h1>

        <div className="credits-checkout-summary">
          <div className="credits-checkout-row">
            <span className="credits-checkout-label">주문번호</span>
            <span className="credits-checkout-value">{orderData.orderNumber}</span>
          </div>
          <div className="credits-checkout-row">
            <span className="credits-checkout-label">충전 크레딧</span>
            <span className="credits-checkout-value credits-big">
              <b>{orderData.creditAmount.toLocaleString()}</b> C
            </span>
          </div>
          <div className="credits-checkout-row credits-total-row">
            <span className="credits-checkout-label">결제 금액</span>
            <span className="credits-checkout-value credits-price">
              ₩{orderData.totalAmount.toLocaleString()}
            </span>
          </div>
        </div>

        <CreditCheckoutClient order={orderData} customer={customer} />
      </div>
    </div>
  );
}
