"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function CreditCheckoutSuccessPage() {
  const searchParams = useSearchParams();
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
        setError("결제 정보가 올바르지 않습니다.");
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
          setError(data.error || "결제 승인에 실패했습니다.");
        }
      } catch {
        setStatus("error");
        setError("결제 처리 중 오류가 발생했습니다.");
      }
    }
    confirm();
  }, [searchParams]);

  if (status === "loading") {
    return (
      <div className="credits-page">
        <div className="credits-result">
          <div className="credits-result-spinner" />
          <p className="credits-result-title">결제를 확인하고 있습니다…</p>
          <p className="credits-result-hint">잠시만 기다려 주세요.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="credits-page">
        <div className="credits-result error">
          <div className="credits-result-icon">⚠</div>
          <h1 className="credits-result-title">결제 실패</h1>
          <p className="credits-result-hint">{error}</p>
          <div className="credits-result-actions">
            <Link href="/dashboard/credits" className="credits-checkout-btn primary">
              크레딧 페이지로
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
        <h1 className="credits-result-title">크레딧이 충전되었습니다</h1>
        {granted !== null && (
          <p className="credits-result-amount">
            +{granted.toLocaleString()} <span>C</span>
          </p>
        )}
        <p className="credits-result-hint">
          잔액이 업데이트됐습니다. 대시보드 상단 또는 크레딧 페이지에서 확인하세요.
        </p>
        <div className="credits-result-actions">
          <Link href="/dashboard/credits" className="credits-checkout-btn primary">
            크레딧 내역 보기
          </Link>
          <Link href="/dashboard" className="credits-checkout-btn secondary">
            대시보드로
          </Link>
        </div>
      </div>
    </div>
  );
}
