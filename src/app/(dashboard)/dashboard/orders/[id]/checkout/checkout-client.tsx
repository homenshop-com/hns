"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const tk = useTranslations("checkoutDash");
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
      setError(tk("errSdkLoad"));
    };
    document.head.appendChild(script);

    return () => {
      // Cleanup is intentionally omitted — the script should persist
    };
  }, []);

  async function handlePayment() {
    if (!clientKey) {
      setError(tk("errNotConfigured"));
      return;
    }

    if (!window.TossPayments) {
      setError(tk("errSdkNotLoaded"));
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
          : tk("orderNameMulti", { name: order.items[0].productName, count: order.items.length - 1 });

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
          setError(tk("errCancelled"));
        } else {
          setError(err.message || tk("errProcessing"));
        }
      }
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Order Summary */}
      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-lg font-semibold px-6 pt-6 pb-4">{tk("orderSummary")}</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                {tk("productName")}
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                {tk("unitPrice")}
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                {tk("quantity")}
              </th>
              <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                {tk("subtotal")}
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
                {tk("total")}
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
          <h3 className="text-lg font-semibold mb-4">{tk("shippingInfo")}</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">{tk("recipient")}</dt>
              <dd>{order.shippingName}</dd>
            </div>
            {order.shippingPhone && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">{tk("contact")}</dt>
                <dd>{order.shippingPhone}</dd>
              </div>
            )}
            {order.shippingAddr && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">{tk("address")}</dt>
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
            ? tk("processing")
            : !sdkReady
              ? tk("sdkLoading")
              : tk("payAmount", { amount: `${order.totalAmount.toLocaleString("ko-KR")}원` })}
        </button>

        <button
          onClick={() => router.push(`/dashboard/orders/${order.id}`)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition-colors"
        >
          {tk("cancel")}
        </button>
      </div>
    </div>
  );
}
