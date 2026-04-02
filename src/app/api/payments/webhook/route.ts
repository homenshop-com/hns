import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// POST /api/payments/webhook — TossPayments 웹훅 수신
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventType, data } = body;

    // Verify webhook signature if provided
    const signature = request.headers.get("TossPayments-Signature");
    if (signature) {
      // TODO: Implement signature verification with webhook secret
      // const webhookSecret = process.env.TOSS_WEBHOOK_SECRET;
      // Verify HMAC-SHA256 signature
    }

    if (!eventType || !data) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    const { paymentKey, orderId, status } = data;

    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 }
      );
    }

    // Find the order by orderNumber
    const order = await prisma.order.findUnique({
      where: { orderNumber: orderId },
    });

    if (!order) {
      // Order not found — acknowledge anyway to prevent retries
      console.warn(`Webhook: order not found for orderId=${orderId}`);
      return NextResponse.json({ success: true });
    }

    // Handle different event types / statuses
    switch (status || eventType) {
      case "DONE":
      case "payment.done": {
        if (order.status === "PENDING") {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              paymentKey: paymentKey || order.paymentKey,
              paymentMethod: data.method || order.paymentMethod,
            },
          });
        }
        break;
      }

      case "CANCELED":
      case "payment.canceled": {
        if (order.status !== "CANCELLED" && order.status !== "REFUNDED") {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "CANCELLED" },
          });
        }
        break;
      }

      case "PARTIAL_CANCELED":
      case "payment.partial_canceled": {
        // For partial cancellation, we keep the order as PAID but could
        // track partial refund amounts in the future
        console.log(
          `Partial cancellation for order ${orderId}, paymentKey=${paymentKey}`
        );
        break;
      }

      default: {
        console.log(`Unhandled webhook event: ${eventType}, status: ${status}`);
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // Return 200 even on error to prevent TossPayments from retrying
    return NextResponse.json({ success: true });
  }
}
