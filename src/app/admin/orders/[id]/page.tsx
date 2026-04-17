"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "결제대기",
  PAID: "결제완료",
  SHIPPING: "배송중",
  DELIVERED: "배송완료",
  CANCELLED: "취소",
  REFUNDED: "환불",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING:
    "bg-amber-50 text-amber-700",
  PAID: "bg-[#405189]/10 text-[#405189]",
  SHIPPING:
    "bg-violet-50 text-violet-700",
  DELIVERED:
    "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  REFUNDED:
    "bg-slate-500/10 text-slate-600",
};

const ALL_STATUSES = [
  "PENDING",
  "PAID",
  "SHIPPING",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product: {
    name: string;
    price: number;
    salePrice: number | null;
  };
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  totalAmount: number;
  status: string;
  paymentMethod: string | null;
  paymentKey: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingAddr: string | null;
  shippingMemo: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  };
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/admin/orders/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          if (res.status === 403) {
            router.push("/dashboard");
            return;
          }
          throw new Error("주문 정보를 불러올 수 없습니다.");
        }
        const data = await res.json();
        setOrder(data.order);
        setSelectedStatus(data.order.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id, router]);

  async function handleStatusChange() {
    if (!order || selectedStatus === order.status) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "상태 변경에 실패했습니다.");
      }

      const data = await res.json();
      setOrder(data.order);
      setSuccess("주문 상태가 변경되었습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">로딩 중...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500">{error || "주문을 찾을 수 없습니다."}</p>
        <Link href="/admin/orders" className="text-[#405189] hover:text-[#405189]">
          주문 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/orders"
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          &larr; 주문 목록
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-xl font-bold text-slate-900">주문 상세</h1>
        <span
          className={`inline-block rounded-md px-3 py-1 text-sm font-medium ${STATUS_COLORS[order.status] ?? ""}`}
        >
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-50 p-4 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Order Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">주문 정보</h2>
          <dl className="space-y-3">
            <InfoRow label="주문번호" value={order.orderNumber} mono />
            <InfoRow
              label="주문일"
              value={new Date(order.createdAt).toLocaleString("ko-KR")}
            />
            <InfoRow
              label="결제금액"
              value={`${order.totalAmount.toLocaleString("ko-KR")}원`}
            />
            <InfoRow label="결제수단" value={order.paymentMethod || "-"} />
            <InfoRow label="결제키" value={order.paymentKey || "-"} mono />
          </dl>
        </div>

        {/* Status Change */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">상태 변경</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                주문 상태
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]} ({s})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStatusChange}
              disabled={saving || selectedStatus === order.status}
              className="w-full rounded-lg bg-[#405189] px-4 py-2 text-sm font-medium text-white hover:bg-[#364574] disabled:opacity-50 transition-colors"
            >
              {saving ? "변경 중..." : "상태 변경"}
            </button>
          </div>
        </div>

        {/* Customer Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">주문자 정보</h2>
          <dl className="space-y-3">
            <InfoRow label="이름" value={order.user.name || "-"} />
            <InfoRow label="이메일" value={order.user.email} />
            <InfoRow label="전화번호" value={order.user.phone || "-"} />
            <InfoRow label="회원 ID" value={order.user.id} mono />
          </dl>
        </div>

        {/* Shipping Info */}
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">배송 정보</h2>
          <dl className="space-y-3">
            <InfoRow label="받는분" value={order.shippingName || "-"} />
            <InfoRow label="연락처" value={order.shippingPhone || "-"} />
            <InfoRow label="주소" value={order.shippingAddr || "-"} />
            <InfoRow label="배송메모" value={order.shippingMemo || "-"} />
          </dl>
        </div>
      </div>

      {/* Order Items */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h2 className="text-base font-semibold text-slate-800 px-6 pt-6 pb-4">주문 상품</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="px-6 py-3 text-left font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                상품명
              </th>
              <th className="px-6 py-3 text-right font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                단가
              </th>
              <th className="px-6 py-3 text-right font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                수량
              </th>
              <th className="px-6 py-3 text-right font-semibold text-slate-500 text-[11px] uppercase tracking-wider">
                소계
              </th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr
                key={item.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="px-6 py-4 font-medium text-slate-800">{item.product.name}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap">
                  {item.price.toLocaleString("ko-KR")}원
                </td>
                <td className="px-6 py-4 text-right">{item.quantity}</td>
                <td className="px-6 py-4 text-right whitespace-nowrap font-medium text-slate-800">
                  {(item.price * item.quantity).toLocaleString("ko-KR")}원
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td colSpan={3} className="px-6 py-4 text-right font-semibold text-slate-700">
                합계
              </td>
              <td className="px-6 py-4 text-right font-bold text-lg text-slate-900">
                {order.totalAmount.toLocaleString("ko-KR")}원
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className={`text-sm text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
