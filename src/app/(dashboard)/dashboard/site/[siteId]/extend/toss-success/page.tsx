"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";

/**
 * Toss Payments success redirect handler for site subscription extension.
 * Toss redirects here after a successful card payment with:
 *   ?paymentKey=...&orderId=...&amount=...
 * We call /api/payments/confirm to finalise the charge and extend the site.
 */
export default function TossExtendSuccessPage() {
  const tx = useTranslations("siteExtend");
  const searchParams = useSearchParams();
  const params = useParams();
  const siteId = params.siteId as string;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [months, setMonths] = useState<number | null>(null);

  useEffect(() => {
    async function confirm() {
      const paymentKey = searchParams.get("paymentKey");
      const orderId = searchParams.get("orderId");
      const amount = searchParams.get("amount");

      if (!paymentKey || !orderId || !amount) {
        setStatus("error");
        setError(tx("invalidPaymentInfo"));
        return;
      }

      try {
        const res = await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentKey,
            orderId,
            amount: Number(amount),
          }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setMonths(data.order?.subscriptionMonths ?? null);
          setStatus("success");
        } else {
          setStatus("error");
          setError(data.error ?? tx("paymentApprovalFailed"));
        }
      } catch {
        setStatus("error");
        setError(tx("paymentProcessError"));
      }
    }
    confirm();
  }, [searchParams]);

  const backHref = `/dashboard/site/${siteId}/extend`;

  if (status === "loading") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#1a1a2e" }}>{tx("confirmingToss")}</div>
        <div style={{ fontSize: 13, color: "#868e96", marginTop: 8 }}>{tx("pleaseWait")}</div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#b91c1c", marginBottom: 8 }}>{tx("paymentFailed")}</div>
        <div style={{ fontSize: 13, color: "#868e96", marginBottom: 24 }}>{error}</div>
        <Link
          href={backHref}
          style={{
            display: "inline-block",
            padding: "10px 24px",
            background: "#3182f6",
            color: "#fff",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {tx("retry")}
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>
        {tx("hostingExtended")}
      </div>
      {months && (
        <div style={{ fontSize: 14, color: "#047857", marginBottom: 24, lineHeight: 1.7 }}>
          {tx.rich("planApplied", { months, b: (c) => <b>{c}</b> })}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-block",
            padding: "10px 24px",
            background: "#3182f6",
            color: "#fff",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {tx("toDashboard")}
        </Link>
        <Link
          href={backHref}
          style={{
            display: "inline-block",
            padding: "10px 24px",
            background: "#f8f9fa",
            color: "#4a90d9",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            border: "1.5px solid #dee2e6",
          }}
        >
          {tx("viewPaymentHistory")}
        </Link>
      </div>
    </div>
  );
}
