"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface PaypalSectionProps {
  siteId: string;
  activeSubscription: {
    id: string;
    paypalSubscriptionId: string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  /** true when the user has just returned from PayPal approval flow */
  returnedFromPayPal?: boolean;
  /**
   * true when Accept-Language header indicates a Korean browser.
   * PayPal blocks KR-to-KR payments (government regulation), so we surface
   * a warning to Korean users to use Toss / bank transfer instead.
   */
  isKoreanUser?: boolean;
}

const PLANS = [
  {
    id: "monthly",
    labelKey: "planMonthly",
    price: "$4.99",
    billingKey: "billingMonthly",
    badgeKey: null,
  },
  {
    id: "yearly",
    labelKey: "planYearly",
    price: "$49.99",
    billingKey: "billingYearly",
    badgeKey: "yearlyBadge",
  },
] as const;

export default function PaypalSection({
  siteId,
  activeSubscription,
  returnedFromPayPal,
  isKoreanUser,
}: PaypalSectionProps) {
  const tx = useTranslations("siteExtend");
  const [selected, setSelected] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);

  /* ── PayPal checkout ── */
  async function handlePayPalCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/paypal/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, plan: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? tx("paymentInitFailed"));
        return;
      }
      // Redirect to PayPal approval page
      window.location.href = data.approveUrl;
    } catch {
      setError(tx("networkErrorRetry"));
    } finally {
      setLoading(false);
    }
  }

  /* ── Cancel subscription ── */
  async function handleCancel() {
    if (!confirm(tx("cancelConfirm"))) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/paypal/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? tx("cancelFailed"));
        return;
      }
      setCancelDone(true);
    } catch {
      setError(tx("networkError"));
    } finally {
      setCancelling(false);
    }
  }

  /* ── Return from PayPal (pending activation) ── */
  if (returnedFromPayPal) {
    return (
      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1e40af", marginBottom: 6 }}>
          {tx("confirmingPayment")}
        </div>
        <div style={{ fontSize: 13, color: "#3b82f6", lineHeight: 1.7 }}>
          {tx.rich("paypalPending", { br: () => <br /> })}
        </div>
      </div>
    );
  }

  /* ── Active subscription view ── */
  if (activeSubscription && !cancelDone) {
    const isCancelled = activeSubscription.status === "CANCELLED" || activeSubscription.cancelAtPeriodEnd;
    const periodEnd = activeSubscription.currentPeriodEnd
      ? new Date(activeSubscription.currentPeriodEnd).toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : null;

    return (
      <div>
        <div
          style={{
            background: isCancelled ? "#fef3c7" : "#f0fdf4",
            border: `1px solid ${isCancelled ? "#fcd34d" : "#86efac"}`,
            borderRadius: 10,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 18 }}>{isCancelled ? "⚠️" : "✅"}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: isCancelled ? "#92400e" : "#166534" }}>
              {isCancelled ? tx("subCancelScheduled") : tx("subActive")}
            </span>
          </div>
          {periodEnd && (
            <div style={{ fontSize: 13, color: isCancelled ? "#92400e" : "#166534" }}>
              {isCancelled
                ? tx("subUntil", { date: periodEnd })
                : tx("nextBilling", { date: periodEnd })}
            </div>
          )}
        </div>

        {!isCancelled && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            style={{
              padding: "10px 20px",
              background: "#fff",
              border: "1.5px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 13,
              color: "#6b7280",
              cursor: cancelling ? "default" : "pointer",
              fontWeight: 500,
            }}
          >
            {cancelling ? tx("processingDots") : tx("requestCancel")}
          </button>
        )}

        {error && (
          <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</div>
        )}
      </div>
    );
  }

  /* ── Cancel confirmation ── */
  if (cancelDone) {
    return (
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          padding: 20,
          textAlign: "center",
          color: "#374151",
          fontSize: 13,
        }}
      >
        {tx("cancelDone")}
      </div>
    );
  }

  /* ── New subscription checkout ── */
  return (
    <div>
      {/* Korean user warning — PayPal KR→KR regulation block */}
      {isKoreanUser && (
        <div
          style={{
            background: "#fffbeb",
            border: "1px solid #fcd34d",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 18,
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1.3 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 4 }}>
              {tx("krBlockTitle")}
            </div>
            <div style={{ fontSize: 12.5, color: "#78350f", lineHeight: 1.65 }}>
              {tx.rich("krBlockBody", {
                br: () => <br />,
                strong: (c) => <strong>{c}</strong>,
              })}
            </div>
          </div>
        </div>
      )}

      {/* Plan picker */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
        {PLANS.map((plan) => {
          const isSelected = selected === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelected(plan.id)}
              style={{
                padding: "18px 16px",
                borderRadius: 10,
                border: isSelected ? "2px solid #0070ba" : "1.5px solid #dee2e6",
                background: isSelected ? "#e8f4ff" : "#fff",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
              }}
            >
              {plan.badgeKey && (
                <div
                  style={{
                    position: "absolute",
                    top: -9,
                    right: 10,
                    background: "#e03131",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {tx(plan.badgeKey)}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
                {tx(plan.labelKey)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0070ba", marginBottom: 4 }}>
                {plan.price}
              </div>
              <div style={{ fontSize: 12, color: "#868e96" }}>{tx(plan.billingKey)}</div>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* PayPal button */}
      <button
        type="button"
        onClick={handlePayPalCheckout}
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          height: 52,
          background: loading ? "#adb5bd" : "#ffc439",
          color: "#003087",
          border: "none",
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {loading ? (
          tx("processingDots")
        ) : (
          <>
            {/* PayPal wordmark (simplified inline SVG) */}
            <svg width="80" height="20" viewBox="0 0 80 20" fill="none">
              <text x="0" y="16" fontFamily="Arial" fontWeight="bold" fontSize="16" fill="#003087">Pay</text>
              <text x="32" y="16" fontFamily="Arial" fontWeight="bold" fontSize="16" fill="#009cde">Pal</text>
            </svg>
            <span>{tx("payWith")}</span>
          </>
        )}
      </button>

      <p style={{ fontSize: 11.5, color: "#9ca3af", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
        {tx("paypalFootLine1")}
        <br />
        <span style={{ color: "#0070ba" }}>{tx("overseasAddressOnly")}</span>{tx("paypalFootLine2")}
      </p>
    </div>
  );
}
