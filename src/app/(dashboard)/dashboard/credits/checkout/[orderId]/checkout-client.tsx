"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface OrderData {
  id: string;
  orderNumber: string;
  totalAmount: number;
  creditAmount: number;
}

interface CustomerInfo {
  name: string;
  email: string;
}

interface Props {
  order: OrderData;
  customer: CustomerInfo;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      requestPayment: (
        method: string,
        options: Record<string, unknown>
      ) => Promise<void>;
    };
  }
}

export default function CreditCheckoutClient({ order, customer }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const scriptLoadedRef = useRef(false);

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";

  useEffect(() => {
    if (scriptLoadedRef.current) return;
    scriptLoadedRef.current = true;

    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setError("결제 모듈을 불러올 수 없습니다. 새로고침 해주세요.");
    document.head.appendChild(script);
  }, []);

  async function handlePayment() {
    if (!clientKey) {
      setError("결제 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.");
      return;
    }
    if (!window.TossPayments) {
      setError("결제 모듈이 로드되지 않았습니다. 새로고침 해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const tossPayments = window.TossPayments(clientKey);
      const orderName = `AI 크레딧 ${order.creditAmount.toLocaleString()} C 충전`;
      const origin = window.location.origin;

      await tossPayments.requestPayment("카드", {
        amount: order.totalAmount,
        orderId: order.orderNumber,
        orderName,
        customerName: customer.name || "고객",
        customerEmail: customer.email,
        successUrl: `${origin}/dashboard/credits/checkout/success`,
        failUrl: `${origin}/dashboard/credits?error=payment_failed`,
      });
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes("USER_CANCEL")) {
          setError("결제가 취소되었습니다.");
        } else {
          setError(err.message || "결제 처리 중 오류가 발생했습니다.");
        }
      }
      setLoading(false);
    }
  }

  return (
    <div className="credits-checkout-actions">
      {error && <div className="credits-checkout-error">{error}</div>}
      <button
        onClick={handlePayment}
        disabled={loading || !sdkReady || !clientKey}
        className="credits-checkout-btn primary"
      >
        {loading
          ? "결제 처리 중..."
          : !sdkReady
            ? "결제 모듈 로딩 중..."
            : `₩${order.totalAmount.toLocaleString()} 결제하기`}
      </button>
      <button
        onClick={() => router.push("/dashboard/credits")}
        className="credits-checkout-btn secondary"
      >
        취소
      </button>
    </div>
  );
}
