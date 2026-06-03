"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

interface Props {
  packId: string;
  label: string;
  disabled?: boolean;
  className?: string;
}

export default function BuyPackButton({ packId, label, disabled, className = "cr2-buy" }: Props) {
  const router = useRouter();
  const t = useTranslations("creditsPage");
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
        setError(data.error || t("orderCreateFailed"));
        setLoading(false);
        return;
      }
      router.push(`/dashboard/credits/checkout/${data.orderId}`);
    } catch {
      setError(t("networkError"));
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
        {loading ? t("processing") : label}
      </button>
      {error && <div className="cr2-pkg-error">{error}</div>}
    </>
  );
}
