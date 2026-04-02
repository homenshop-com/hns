"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  price: number;
}

interface OrderData {
  id: string;
  orderNumber: string;
  totalAmount: number;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  items: OrderItem[];
}

interface CustomerInfo {
  name: string;
  email: string;
}

interface CheckoutClientProps {
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

export default function CheckoutClient({
  order,
  customer,
}: CheckoutClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sdkReady, setSdkReady] = useState(false);
  const scriptLoadedRef = useRef(false);

  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || "";

  useEffect(() => {
    if (scriptLoadedRef.current) return;
    scriptLoadedRef.current = true;

    // Load TossPayments SDK script
    const script = document.createElement("script");
    script.src = "https://js.tosspayments.com/v2/standard";
    script.async = true;
    script.onload = () => {
      setSdkReady(true);
    };
    script.onerror = () => {
      setError("결제 모듈을 불러올 수 없습니다. 새로고침 해주세요.");
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup is intentionally omitted — the script should persist
    };
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

      // Generate a unique order name
      const orderName =
        order.items.length === 1
          ? order.items[0].productName
          : `${order.items[0].productName} 외 ${order.items.length - 1}건`;

      const origin = window.location.origin;

      await tossPayments.requestPayment("카드", {
        amount: order.totalAmount,
        orderId: order.orderNumber,
        orderName,
        customerName: customer.name || order.shippingName || "",
        customerEmail: customer.email,
        successUrl: `${origin}/dashboard/orders/${order.id}/checkout/success`,
        failUrl: `${origin}/dashboard/orders/${order.id}?error=payment_failed`,
      });
    } catch (err) {
      // User cancelled or payment error
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
    <div className="space-y-6">
      {/* Order Summary */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold px-6 pt-6 pb-4">주문 요약</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                상품명
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                단가
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                수량
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                소계
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              >
                <td className="px-6 py-4 font-medium">{item.productName}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {item.price.toLocaleString("ko-KR")}원
                </td>
                <td className="px-6 py-4 text-right">{item.quantity}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap font-medium">
                  {(item.price * item.quantity).toLocaleString("ko-KR")}원
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-200 dark:border-zinc-800">
              <td colSpan={3} className="px-6 py-4 text-right font-semibold">
                합계
              </td>
              <td className="px-6 py-4 text-right font-bold text-lg">
                {order.totalAmount.toLocaleString("ko-KR")}원
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Shipping Info */}
      {order.shippingName && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold mb-4">배송 정보</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">받는분</dt>
              <dd>{order.shippingName}</dd>
            </div>
            {order.shippingPhone && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">연락처</dt>
                <dd>{order.shippingPhone}</dd>
              </div>
            )}
            {order.shippingAddr && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">주소</dt>
                <dd>{order.shippingAddr}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Payment Button */}
      <div className="flex flex-col gap-3">
        <button
          onClick={handlePayment}
          disabled={loading || !sdkReady || !clientKey}
          className="w-full rounded-xl bg-blue-600 px-6 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading
            ? "결제 처리 중..."
            : !sdkReady
              ? "결제 모듈 로딩 중..."
              : `${order.totalAmount.toLocaleString("ko-KR")}원 결제하기`}
        </button>

        <button
          onClick={() => router.push(`/dashboard/orders/${order.id}`)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}
