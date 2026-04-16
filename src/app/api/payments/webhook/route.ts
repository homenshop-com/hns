import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { getPayment } from "@/lib/payments";

/**
 * HMAC-SHA256 서명 검증.
 * TOSS_WEBHOOK_SECRET 환경변수가 설정된 경우에만 동작.
 * 설정되어 있으면 시그니처 없거나 불일치 시 거부.
 */
function verifySignature(rawBody: string, signature: string | null): { ok: boolean; skipped: boolean } {
  const secret = process.env.TOSS_WEBHOOK_SECRET;
  if (!secret) return { ok: false, skipped: true };
  if (!signature) return { ok: false, skipped: false };

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return { ok: false, skipped: false };
  return { ok: crypto.timingSafeEqual(a, b), skipped: false };
}

// POST /api/payments/webhook — TossPayments 웹훅 수신
export async function POST(request: NextRequest) {
  try {
    // 1) Raw body 확보 (HMAC 계산을 위해 JSON 파싱 전에 읽음)
    const rawBody = await request.text();
    const signature = request.headers.get("TossPayments-Signature");

    // 2) HMAC 서명 검증 (시크릿 설정된 경우 필수)
    const verdict = verifySignature(rawBody, signature);
    if (!verdict.skipped && !verdict.ok) {
      console.warn("Webhook: invalid HMAC signature rejected");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 3) JSON 파싱
    let body: { eventType?: string; data?: Record<string, unknown> };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { eventType, data } = body;
    if (!eventType || !data) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const paymentKey = data.paymentKey as string | undefined;
    const orderId = data.orderId as string | undefined;

    if (!orderId || !paymentKey) {
      return NextResponse.json(
        { error: "orderId and paymentKey are required" },
        { status: 400 }
      );
    }

    // 4) 주문 조회
    const order = await prisma.order.findUnique({
      where: { orderNumber: orderId },
    });
    if (!order) {
      // 존재하지 않는 주문은 조용히 ACK (재시도 방지)
      console.warn(`Webhook: order not found for orderId=${orderId}`);
      return NextResponse.json({ success: true });
    }

    // 5) TossPayments API 역조회 — 위조된 paymentKey/orderId/금액을 여기서 차단
    const verified = (await getPayment(paymentKey)) as {
      orderId?: string;
      paymentKey?: string;
      status?: string;
      totalAmount?: number;
      method?: string;
      code?: string;
      message?: string;
    };

    if (!verified || verified.code) {
      console.warn("Webhook: TossPayments lookup failed or returned error", {
        orderId,
        paymentKey,
        code: verified?.code,
        message: verified?.message,
      });
      return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
    }

    if (verified.orderId !== orderId) {
      console.warn("Webhook: orderId mismatch between webhook and API", {
        webhook: orderId,
        api: verified.orderId,
      });
      return NextResponse.json({ error: "orderId mismatch" }, { status: 400 });
    }

    if (
      typeof verified.totalAmount === "number" &&
      Number(verified.totalAmount) !== Number(order.totalAmount)
    ) {
      console.warn("Webhook: amount mismatch", {
        orderId,
        dbAmount: order.totalAmount,
        apiAmount: verified.totalAmount,
      });
      return NextResponse.json({ error: "amount mismatch" }, { status: 400 });
    }

    // 6) 웹훅 payload의 status가 아닌 TossPayments API의 권위적 status로 상태 전이
    const authoritativeStatus = verified.status;

    switch (authoritativeStatus) {
      case "DONE": {
        if (order.status === "PENDING") {
          await prisma.order.update({
            where: { id: order.id },
            data: {
              status: "PAID",
              paymentKey: verified.paymentKey || paymentKey,
              paymentMethod: verified.method || order.paymentMethod,
            },
          });
        }
        break;
      }

      case "CANCELED": {
        if (order.status !== "CANCELLED" && order.status !== "REFUNDED") {
          await prisma.order.update({
            where: { id: order.id },
            data: { status: "CANCELLED" },
          });
        }
        break;
      }

      case "PARTIAL_CANCELED": {
        console.log(
          `Partial cancellation for order ${orderId}, paymentKey=${paymentKey}`
        );
        break;
      }

      default: {
        console.log(
          `Unhandled authoritative status: ${authoritativeStatus} for order ${orderId}`
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    // 내부 예외 시에도 재시도 유발하지 않도록 200 유지
    return NextResponse.json({ success: true });
  }
}
