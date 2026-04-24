"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface Props {
  orderId: string;
  orderNumber: string;
  status: string;
}

/**
 * Inline row actions for the orders table.
 *
 *   · 취소 — PUT status=CANCELLED (PENDING only). Keeps the record.
 *   · 삭제 — DELETE (PENDING or CANCELLED only). Removes the row.
 *
 * PAID / SHIPPING / DELIVERED / REFUNDED orders hide both buttons.
 * For those the user needs to go through the refund flow instead.
 */
export default function OrderActions({ orderId, orderNumber, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const canCancel = status === "PENDING";
  const canDelete = status === "PENDING" || status === "CANCELLED";
  if (!canCancel && !canDelete) return null;

  async function cancelOrder() {
    setErr(null);
    if (!confirm(`주문 ${orderNumber}을(를) 취소하시겠습니까?\n취소된 주문은 기록에 남습니다.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "취소에 실패했습니다.");
        }
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  async function deleteOrder() {
    setErr(null);
    if (!confirm(`주문 ${orderNumber}을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "삭제에 실패했습니다.");
        }
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  const btnBase: React.CSSProperties = {
    height: 28,
    padding: "0 10px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: pending ? "wait" : "pointer",
    background: "#fff",
    opacity: pending ? 0.55 : 1,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      {canCancel && (
        <button
          type="button"
          onClick={cancelOrder}
          disabled={pending}
          title="결제 대기 중인 주문을 취소합니다"
          style={{
            ...btnBase,
            border: "1px solid #f59e0b",
            color: "#b45309",
          }}
        >
          취소
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={deleteOrder}
          disabled={pending}
          title={
            status === "PENDING"
              ? "결제 대기 중인 주문을 영구 삭제합니다"
              : "취소된 주문을 영구 삭제합니다"
          }
          style={{
            ...btnBase,
            border: "1px solid #ef4444",
            color: "#b91c1c",
          }}
        >
          삭제
        </button>
      )}
      {err && (
        <span style={{ fontSize: 11, color: "#b91c1c", marginLeft: 6 }}>
          ⚠️ {err}
        </span>
      )}
    </div>
  );
}
