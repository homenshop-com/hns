"use client";

import { useState } from "react";

/* ── 호스팅 가격 (월 5,500원 기준) — src/lib/subscription.ts와 동일 ── */
const MONTHLY_PRICE = 5500;

const PLANS = [
  { months: 12, labelKey: "year" as const, discount: 0 },
  { months: 24, labelKey: "years2" as const, discount: 0.1 },
  { months: 36, labelKey: "years3" as const, discount: 0.2 },
];

interface ExtendFormProps {
  siteId: string;
  shopId: string;
  labels: {
    year: string;
    years2: string;
    years3: string;
    monthly: string;
    won: string;
    discount: string;
    baseFee: string;
    months: string;
    totalAmount: string;
    payButton: string;
    processing: string;
    tossGuide: string;
    tossNotReady: string;
    account: string;
    plan: string;
    amount: string;
    useBankTransfer: string;
  };
}

type PendingOrder = {
  orderNumber: string;
  totalAmount: number;
  subscriptionMonths: number;
};

export default function ExtendForm({ siteId, labels }: ExtendFormProps) {
  const [selected, setSelected] = useState(12);
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<PendingOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = PLANS.find((p) => p.months === selected)!;
  const basePrice = MONTHLY_PRICE * selectedPlan.months;
  const discountAmount = Math.floor(basePrice * selectedPlan.discount);
  const totalPrice = basePrice - discountAmount;

  async function handlePayment() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months: selected }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "주문 생성에 실패했습니다.");
        return;
      }
      setOrder(data.order);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (order) {
    return (
      <div>
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #6ee7b7",
            borderRadius: 10,
            padding: 24,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#065f46", marginBottom: 8 }}>
            주문이 접수되었습니다
          </div>
          <div style={{ fontSize: 13, color: "#047857", lineHeight: 1.7 }}>
            아래 계좌로 <b>{order.totalAmount.toLocaleString()}원</b>을 입금해 주세요.
            <br />
            입금 확인 후 <b>{order.subscriptionMonths}개월</b> 기간이 연장됩니다.
          </div>
        </div>

        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>주문번호 (입금자명 뒤에 적어주세요)</div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 18,
              fontWeight: 700,
              color: "#0f172a",
              background: "#fff",
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>{order.orderNumber}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(order.orderNumber);
              }}
              style={{
                padding: "4px 10px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              복사
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <a
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
            대시보드로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {PLANS.map((plan) => {
          const base = MONTHLY_PRICE * plan.months;
          const total = base - Math.floor(base * plan.discount);
          const isSelected = selected === plan.months;
          return (
            <button
              key={plan.months}
              type="button"
              onClick={() => setSelected(plan.months)}
              style={{
                padding: "20px 16px",
                borderRadius: 10,
                border: isSelected ? "2px solid #4a90d9" : "1.5px solid #dee2e6",
                background: isSelected ? "#f0f6ff" : "#fff",
                cursor: "pointer",
                textAlign: "center",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", marginBottom: 4 }}>
                {labels[plan.labelKey] || plan.labelKey}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#4a90d9", marginBottom: 6 }}>
                {total.toLocaleString()}<span style={{ fontSize: 13, fontWeight: 400 }}>{labels.won}</span>
              </div>
              <div style={{ fontSize: 12, color: "#868e96" }}>
                {labels.monthly} {MONTHLY_PRICE.toLocaleString()}{labels.won}
              </div>
              {plan.discount > 0 && (
                <div style={{
                  marginTop: 6,
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "#e03131",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {plan.discount * 100}% {labels.discount}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div style={{
        background: "#f8f9fa",
        borderRadius: 8,
        padding: 20,
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: "#868e96" }}>{labels.baseFee}</span>
          <span style={{ fontSize: 13, color: "#495057" }}>
            {MONTHLY_PRICE.toLocaleString()}{labels.won} x {selectedPlan.months}{labels.months} = {basePrice.toLocaleString()}{labels.won}
          </span>
        </div>
        {discountAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#e03131" }}>{labels.discount} ({selectedPlan.discount * 100}%)</span>
            <span style={{ fontSize: 13, color: "#e03131", fontWeight: 600 }}>
              -{discountAmount.toLocaleString()}{labels.won}
            </span>
          </div>
        )}
        <div style={{
          borderTop: "1px solid #dee2e6",
          paddingTop: 12,
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a2e" }}>{labels.totalAmount}</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: "#4a90d9" }}>
            {totalPrice.toLocaleString()}<span style={{ fontSize: 14, fontWeight: 400 }}>{labels.won}</span>
          </span>
        </div>
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

      <button
        type="button"
        onClick={handlePayment}
        disabled={loading}
        style={{
          display: "block",
          width: "100%",
          height: 52,
          background: loading ? "#adb5bd" : "#3182f6",
          color: "#fff",
          border: "none",
          borderRadius: 10,
          fontSize: 16,
          fontWeight: 700,
          cursor: loading ? "default" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {loading ? labels.processing : `${totalPrice.toLocaleString()}${labels.won} 무통장 입금 신청`}
      </button>

      <p style={{ fontSize: 12, color: "#adb5bd", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
        신청하시면 주문번호와 입금 계좌가 표시됩니다. 입금 확인 후 기간이 연장됩니다.
      </p>
    </div>
  );
}
