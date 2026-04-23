"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  packId: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function BuyPackButton({ packId, label, disabled, className = "cr2-buy" }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function buy() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "주문 생성에 실패했습니다.");
        setLoading(false);
        return;
      }
      router.push(`/dashboard/credits/checkout/${data.orderId}`);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled || loading}
        onClick={buy}
      >
        {loading ? "처리 중…" : label}
      </button>
      {error && <div className="cr2-pkg-error">{error}</div>}
    </>
  );
}
