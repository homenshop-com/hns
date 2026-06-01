import { NextRequest, NextResponse } from "next/server";
import { confirmPayment } from "@/lib/payments";
import { prisma } from "@/lib/db";
import { grantCredits } from "@/lib/credits";
import { extendedExpiry } from "@/lib/subscription";
import { recordEarning } from "@/lib/reseller-revenue";

// POST /api/payments/confirm — TossPayments 결제 승인
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { paymentKey, orderId, amount } = body;

    if (!paymentKey || !orderId || amount == null) {
      return NextResponse.json(
        { error: "paymentKey, orderId, amount는 필수입니다." },
        { status: 400 }
      );
    }

    // Find the order by orderNumber (orderId from TossPayments maps to our orderNumber)
    const order = await prisma.order.findUnique({
      where: { orderNumber: orderId },
    });

    if (!order) {
      return NextResponse.json(
        { error: "주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Verify the amount matches
    if (order.totalAmount !== amount) {
      return NextResponse.json(
        { error: "결제 금액이 일치하지 않습니다." },
        { status: 400 }
      );
    }

    // Verify order is in PENDING status
    if (order.status !== "PENDING") {
      return NextResponse.json(
        { error: "이미 처리된 주문입니다." },
        { status: 400 }
      );
    }

    // Confirm payment with TossPayments
    const result = await confirmPayment(paymentKey, orderId, amount);

    if (result.status === "DONE") {
      // Update order status to PAID and save paymentKey
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "PAID",
          paymentKey,
          paymentMethod: result.method || "카드",
        },
      });

      // ─── Fulfillment: credit pack orders grant credits on payment ───
      // PRODUCT orders are fulfilled by the existing order flow (stock decrement
      // already happened at order creation, shipping handled separately).
      if (updatedOrder.orderType === "CREDIT_PACK" && updatedOrder.creditAmount) {
        try {
          await grantCredits(updatedOrder.userId, {
            kind: "PURCHASE",
            amount: updatedOrder.creditAmount,
            refOrderId: updatedOrder.id,
            description: `크레딧 충전 (${updatedOrder.creditAmount.toLocaleString()} C)`,
          });
        } catch (err) {
          console.error("[credits] PURCHASE grant failed for order", updatedOrder.id, err);
          // Don't fail the payment confirmation — the ops team can grant
          // manually. Logged for monitoring.
        }
      }

      // ─── Fulfillment: Toss subscription orders extend the site immediately ───
      // Bank-transfer SUBSCRIPTION orders are activated manually by admin.
      // Toss card payments are instant, so we activate the site right away.
      if (
        updatedOrder.orderType === "SUBSCRIPTION" &&
        updatedOrder.paymentChannel === "TOSS" &&
        updatedOrder.subscriptionSiteId &&
        updatedOrder.subscriptionMonths
      ) {
        try {
          const site = await prisma.site.findUnique({
            where: { id: updatedOrder.subscriptionSiteId },
            select: { expiresAt: true },
          });
          const newExpiry = extendedExpiry(site?.expiresAt ?? null, updatedOrder.subscriptionMonths);
          await prisma.site.update({
            where: { id: updatedOrder.subscriptionSiteId },
            data: {
              accountType: "1",
              expiresAt: newExpiry,
              lastReminderDay: null,
            },
          });
          console.log(
            `[payments/confirm] Toss SUBSCRIPTION: site=${updatedOrder.subscriptionSiteId} ` +
              `+${updatedOrder.subscriptionMonths}m → ${newExpiry.toISOString()}`
          );
        } catch (err) {
          console.error("[payments/confirm] Site extend failed for order", updatedOrder.id, err);
          // Payment succeeded — don't fail the response. Ops can extend manually.
        }

        // Revenue-share: credit the attributed reseller. Idempotent on
        // refOrderId. Best-effort — payment already succeeded.
        if (updatedOrder.resellerId) {
          try {
            await recordEarning({
              resellerId: updatedOrder.resellerId,
              refOrderId: updatedOrder.id,
              orderAmount: updatedOrder.totalAmount,
            });
          } catch (err) {
            console.error("[payments/confirm] reseller earning failed for order", updatedOrder.id, err);
          }
        }
      }

      return NextResponse.json({
        success: true,
        order: updatedOrder,
        payment: result,
      });
    }

    // Payment was not successful
    return NextResponse.json(
      {
        success: false,
        error: result.message || "결제 승인에 실패했습니다.",
        code: result.code,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Payment confirm error:", error);
    return NextResponse.json(
      { error: "결제 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
