"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("ordersPage");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const canCancel = status === "PENDING";
  const canDelete = status === "PENDING" || status === "CANCELLED";
  if (!canCancel && !canDelete) return null;

  async function cancelOrder() {
    setErr(null);
    if (!confirm(t("confirmCancel", { orderNumber }))) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || t("cancelFailed"));
        }
        router.refresh();
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  async function deleteOrder() {
    setErr(null);
    if (!confirm(t("confirmDelete", { orderNumber }))) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || t("deleteFailed"));
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
          title={t("cancelTitle")}
          style={{
            ...btnBase,
            border: "1px solid #f59e0b",
            color: "#b45309",
          }}
        >
          {t("cancelButton")}
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={deleteOrder}
          disabled={pending}
          title={
            status === "PENDING"
              ? t("deleteTitlePending")
              : t("deleteTitleCancelled")
          }
          style={{
            ...btnBase,
            border: "1px solid #ef4444",
            color: "#b91c1c",
          }}
        >
          {t("deleteButton")}
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
