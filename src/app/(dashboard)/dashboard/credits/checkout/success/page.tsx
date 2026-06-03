"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function CreditCheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const tk = useTranslations("checkoutDash");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [granted, setGranted] = useState<number | null>(null);

  useEffect(() => {
    async function confirm() {
      const paymentKey = searchParams.get("paymentKey");
      const tossOrderId = searchParams.get("orderId");
      const amount = searchParams.get("amount");

      if (!paymentKey || !tossOrderId || !amount) {
        setStatus("error");
        setError(tk("errInvalidPaymentInfo"));
        return;
      }

      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentKey,
            orderId: tossOrderId,
            amount: Number(amount),
          }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setGranted(data.order?.creditAmount ?? null);
          setStatus("success");
        } else {
          setStatus("error");
          setError(data.error || tk("errApprovalFailed"));
        }
      } catch {
        setStatus("error");
        setError(tk("errProcessing"));
      }
    }
    confirm();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="credits-page">
        <div className="credits-result">
          <div className="credits-result-spinner" />
          <p className="credits-result-title">{tk("confirming")}</p>
          <p className="credits-result-hint">{tk("pleaseWait")}</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="credits-page">
        <div className="credits-result error">
          <div className="credits-result-icon">⚠</div>
          <h1 className="credits-result-title">{tk("paymentFailed")}</h1>
          <p className="credits-result-hint">{error}</p>
          <div className="credits-result-actions">
            <Link href="/dashboard/credits" className="credits-checkout-btn primary">
              {tk("toCreditsPage")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="credits-page">
      <div className="credits-result success">
        <div className="credits-result-icon">✓</div>
        <h1 className="credits-result-title">{tk("creditsCharged")}</h1>
        {granted !== null && (
          <p className="credits-result-amount">
            +{granted.toLocaleString()} <span>C</span>
          </p>
        )}
        <p className="credits-result-hint">
          {tk("balanceUpdated")}
        </p>
        <div className="credits-result-actions">
          <Link href="/dashboard/credits" className="credits-checkout-btn primary">
            {tk("viewCreditHistory")}
          </Link>
          <Link href="/dashboard" className="credits-checkout-btn secondary">
            {tk("toDashboard")}
          </Link>
        </div>
      </div>
    </div>
  );
}
