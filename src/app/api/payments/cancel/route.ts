import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelPayment } from "@/lib/payments";
import { prisma } from "@/lib/db";

// POST /api/payments/cancel — 결제 취소
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { paymentKey, cancelReason } = body;

    if (!paymentKey || !cancelReason) {
      return NextResponse.json(
        { error: "paymentKey와 cancelReason은 필수입니다." },
        { status: 400 }
      );
    }

    // Find the order by paymentKey
    const order = await prisma.order.findFirst({
      where: { paymentKey },
    });

    if (!order) {
      return NextResponse.json(
        { error: "주문을 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    // Check authorization: admin or order owner
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (order.userId !== session.user.id && currentUser?.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Cancel payment with TossPayments
    const result = await cancelPayment(paymentKey, cancelReason);

    if (result.status === "CANCELED" || result.cancels) {
      // Update order status to CANCELLED
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      });

      return NextResponse.json({
        success: true,
        order: updatedOrder,
        payment: result,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: result.message || "결제 취소에 실패했습니다.",
        code: result.code,
      },
      { status: 400 }
    );
  } catch (error) {
    console.error("Payment cancel error:", error);
    return NextResponse.json(
      { error: "결제 취소 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
