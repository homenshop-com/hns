"use client";

import { useState } from "react";

/* ── 호스팅 가격 (월 5,500원 기준) ── */
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

export default function ExtendForm({ siteId, shopId, labels }: ExtendFormProps) {
  const [selected, setSelected] = useState(12);
  const [loading, setLoading] = useState(false);

  const selectedPlan = PLANS.find((p) => p.months === selected)!;
  const basePrice = MONTHLY_PRICE * selectedPlan.months;
  const discountAmount = Math.floor(basePrice * selectedPlan.discount);
  const totalPrice = basePrice - discountAmount;

  async function handlePayment() {
    setLoading(true);
    try {
      // TODO: Toss Payments API integration
      alert(
        `${labels.tossNotReady}\n\n` +
        `${labels.account}: ${shopId}\n` +
        `${labels.plan}: ${labels[selectedPlan.labelKey] || selectedPlan.labelKey}\n` +
        `${labels.amount}: ${totalPrice.toLocaleString()}${labels.won}\n\n` +
        labels.useBankTransfer
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* 플랜 카드 */}
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

      {/* 결제 요약 */}
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

      {/* 결제 버튼 */}
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
        {loading ? labels.processing : `${totalPrice.toLocaleString()}${labels.won} ${labels.payButton}`}
      </button>

      <p style={{ fontSize: 12, color: "#adb5bd", textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
        {labels.tossGuide}
      </p>
    </div>
  );
}
