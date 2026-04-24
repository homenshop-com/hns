"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Admin-side row actions for the orders table.
 *
 *   · 취소 — PUT status=CANCELLED (PENDING only). Keeps the record.
 *   · 삭제 — DELETE (PENDING or CANCELLED only). Removes the row.
 *
 * Hits /api/admin/orders/[id] so admin-role checks and
 * subscription-side-effects stay consistent with the rest of the
 * admin console.
 */
export default function OrderAdminActions({
  orderId,
  orderNumber,
  status,
}: {
  orderId: string;
  orderNumber: string;
  status: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const canCancel = status === "PENDING";
  const canDelete = status === "PENDING" || status === "CANCELLED";
  if (!canCancel && !canDelete) return null;

  async function cancelOrder() {
    setErr(null);
    if (!confirm(`주문 ${orderNumber}을(를) 취소하시겠습니까?\n취소된 주문은 기록에 남습니다.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "취소에 실패했습니다.");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    setErr(null);
    if (!confirm(`주문 ${orderNumber}을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "삭제에 실패했습니다.");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isBusy = saving || pending;

  return (
    <span className="inline-flex items-center gap-1.5">
      {canCancel && (
        <button
          type="button"
          onClick={cancelOrder}
          disabled={isBusy}
          className="rounded border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
        >
          취소
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={deleteOrder}
          disabled={isBusy}
          className="rounded border border-red-400 bg-white px-2.5 py-1 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          삭제
        </button>
      )}
      {err && <span className="text-[10px] text-red-600 ml-1">⚠️ {err}</span>}
    </span>
  );
}
