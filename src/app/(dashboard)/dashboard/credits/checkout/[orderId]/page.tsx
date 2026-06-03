import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import CreditCheckoutClient from "./checkout-client";

export async function generateMetadata() {
  const tk = await getTranslations("checkoutDash");
  return {
    title: tk("creditCheckoutMetaTitle"),
  };
}

export default async function CreditCheckoutPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const tk = await getTranslations("checkoutDash");

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
          ← {tk("toCreditsPage")}
        </Link>
      </div>

      <div className="credits-checkout">
        <h1 className="credits-checkout-title">{tk("creditCheckoutTitle")}</h1>

        <div className="credits-checkout-summary">
          <div className="credits-checkout-row">
            <span className="credits-checkout-label">{tk("orderNumber")}</span>
            <span className="credits-checkout-value">{orderData.orderNumber}</span>
          </div>
          <div className="credits-checkout-row">
            <span className="credits-checkout-label">{tk("chargeCredits")}</span>
            <span className="credits-checkout-value credits-big">
              <b>{orderData.creditAmount.toLocaleString()}</b> C
            </span>
          </div>
          <div className="credits-checkout-row credits-total-row">
            <span className="credits-checkout-label">{tk("paymentAmount")}</span>
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
