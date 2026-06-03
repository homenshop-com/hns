"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const tk = useTranslations("checkoutDash");
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
    script.onerror = () => setError(tk("errSdkLoad"));
    document.head.appendChild(script);
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
      const orderName = tk("creditOrderName", { amount: order.creditAmount.toLocaleString() });
      const origin = window.location.origin;

      await tossPayments.requestPayment("카드", {
        amount: order.totalAmount,
        orderId: order.orderNumber,
        orderName,
        customerName: customer.name || tk("defaultCustomer"),
        customerEmail: customer.email,
        successUrl: `${origin}/dashboard/credits/checkout/success`,
        failUrl: `${origin}/dashboard/credits?error=payment_failed`,
      });
    } catch (err) {
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
    <div className="credits-checkout-actions">
      {error && <div className="credits-checkout-error">{error}</div>}
      <button
        onClick={handlePayment}
        disabled={loading || !sdkReady || !clientKey}
        className="credits-checkout-btn primary"
      >
        {loading
          ? tk("processing")
          : !sdkReady
            ? tk("sdkLoading")
            : tk("payAmount", { amount: `₩${order.totalAmount.toLocaleString()}` })}
      </button>
      <button
        onClick={() => router.push("/dashboard/credits")}
        className="credits-checkout-btn secondary"
      >
        {tk("cancel")}
      </button>
    </div>
  );
}
