"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function ConfirmDepositButton({
  orderId,
  orderNumber,
  totalAmount,
  months,
}: {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  months: number | null;
}) {
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function onConfirm() {
    const msg = `아래 주문의 입금을 확인했습니까?\n\n주문번호: ${orderNumber}\n금액: ${totalAmount.toLocaleString()}원\n연장: ${months ?? "?"}개월\n\n확인 시 해당 사이트 만료일이 자동 연장되고 accountType=유료로 전환됩니다.`;
    if (!window.confirm(msg)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID" }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(`실패: ${j.error || res.statusText}`);
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  const isBusy = saving || pending;
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={isBusy}
      className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
    >
      {isBusy ? "처리중…" : "입금 확인"}
    </button>
  );
}
