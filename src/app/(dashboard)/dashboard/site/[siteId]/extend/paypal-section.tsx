"use client";

import { useState } from "react";

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
    label: "월간",
    price: "$4.99",
    billing: "매월 자동결제",
    badge: null,
  },
  {
    id: "yearly",
    label: "연간",
    price: "$49.99",
    billing: "매년 자동결제",
    badge: "17% 할인",
  },
] as const;

export default function PaypalSection({
  siteId,
  activeSubscription,
  returnedFromPayPal,
  isKoreanUser,
}: PaypalSectionProps) {
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
        setError(data.error ?? "결제 초기화에 실패했습니다.");
        return;
      }
      // Redirect to PayPal approval page
      window.location.href = data.approveUrl;
    } catch {
      setError("네트워크 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  /* ── Cancel subscription ── */
  async function handleCancel() {
    if (!confirm("구독을 해지하시겠습니까? 현재 결제 기간 종료 시까지 이용할 수 있습니다.")) return;
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
        setError(data.error ?? "해지 처리에 실패했습니다.");
        return;
      }
      setCancelDone(true);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
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
          결제 확인 중...
        </div>
        <div style={{ fontSize: 13, color: "#3b82f6", lineHeight: 1.7 }}>
          PayPal 결제가 접수되었습니다. 잠시 후 구독이 활성화됩니다.
          <br />
          페이지를 새로고침하면 업데이트된 상태를 확인하실 수 있습니다.
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
              {isCancelled ? "구독 해지 예정" : "PayPal 자동결제 활성"}
            </span>
          </div>
          {periodEnd && (
            <div style={{ fontSize: 13, color: isCancelled ? "#92400e" : "#166534" }}>
              {isCancelled
                ? `구독 이용 기간: ${periodEnd}까지`
                : `다음 결제일: ${periodEnd}`}
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
            {cancelling ? "처리 중..." : "구독 해지 요청"}
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
        구독 해지가 접수되었습니다. 현재 결제 기간 종료 시까지 서비스를 이용하실 수 있습니다.
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
              한국 결제 주소는 PayPal 이용 불가
            </div>
            <div style={{ fontSize: 12.5, color: "#78350f", lineHeight: 1.65 }}>
              정부 규정에 따라 한국 결제 주소를 가진 고객은 한국 판매자에게 PayPal로 결제할 수 없습니다.
              <br />
              아래 <strong>Toss 카드결제</strong> 또는 <strong>무통장 입금</strong>을 이용해 주세요.
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
              {plan.badge && (
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
                  {plan.badge}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
                {plan.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#0070ba", marginBottom: 4 }}>
                {plan.price}
              </div>
              <div style={{ fontSize: 12, color: "#868e96" }}>{plan.billing}</div>
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
          "처리 중..."
        ) : (
          <>
            {/* PayPal wordmark (simplified inline SVG) */}
            <svg width="80" height="20" viewBox="0 0 80 20" fill="none">
              <text x="0" y="16" fontFamily="Arial" fontWeight="bold" fontSize="16" fill="#003087">Pay</text>
              <text x="32" y="16" fontFamily="Arial" fontWeight="bold" fontSize="16" fill="#009cde">Pal</text>
            </svg>
            <span>로 결제</span>
          </>
        )}
      </button>

      <p style={{ fontSize: 11.5, color: "#9ca3af", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
        PayPal 계정 또는 해외 카드로 결제. 언제든지 해지 가능. 자동 갱신.
        <br />
        <span style={{ color: "#0070ba" }}>해외 결제 주소 고객 전용</span> · 한국 결제 주소는 Toss / 무통장 이용
      </p>
    </div>
  );
}
