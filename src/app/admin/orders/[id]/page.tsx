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
  orderType: "PRODUCT" | "CREDIT_PACK" | "SUBSCRIPTION";
  creditAmount: number | null;
  subscriptionMonths: number | null;
  subscriptionSiteId: string | null;
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
  subscriptionSite: {
    id: string;
    name: string;
    shopId: string;
  } | null;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  PRODUCT: "상품",
  CREDIT_PACK: "크레딧 팩",
  SUBSCRIPTION: "호스팅 연장",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  PRODUCT: "bg-slate-100 text-slate-700",
  CREDIT_PACK: "bg-violet-50 text-violet-700",
  SUBSCRIPTION: "bg-emerald-50 text-emerald-700",
};

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

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-xl font-bold text-slate-900">주문 상세</h1>
        <span
          className={`inline-block rounded-md px-3 py-1 text-sm font-medium ${ORDER_TYPE_COLORS[order.orderType] ?? ""}`}
        >
          {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
        </span>
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
              label="유형"
              value={ORDER_TYPE_LABELS[order.orderType] || order.orderType}
            />
            {order.orderType === "CREDIT_PACK" && order.creditAmount && (
              <InfoRow label="크레딧" value={`${order.creditAmount.toLocaleString()} C`} />
            )}
            {order.orderType === "SUBSCRIPTION" && order.subscriptionMonths && (
              <InfoRow label="연장 기간" value={`${order.subscriptionMonths}개월`} />
            )}
            {order.orderType === "SUBSCRIPTION" && (
              <InfoRow
                label="대상 사이트"
                value={
                  order.subscriptionSite
                    ? `${order.subscriptionSite.name} (${order.subscriptionSite.shopId})`
                    : order.subscriptionSiteId || "-"
                }
              />
            )}
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

      {/* Order contents — layout switches on orderType. Credit/Subscription
          orders don't use OrderItem rows, so the products table would
          be empty for them; we render a type-specific summary instead. */}
      {order.orderType === "PRODUCT" && (
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
              {order.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-slate-500 text-sm">
                    주문 상품이 없습니다.
                  </td>
                </tr>
              )}
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
      )}

      {order.orderType === "CREDIT_PACK" && (
        <div className="mt-6 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">주문 내용 — 크레딧 팩</h2>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-violet-600 text-white grid place-items-center text-xl font-bold shrink-0">
              C
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold text-slate-900">
                {order.creditAmount ? order.creditAmount.toLocaleString() : "?"} C
                <span className="text-sm text-slate-500 ml-2 font-normal">크레딧 충전</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                결제 완료 시 사용자 계정에 자동 적립됩니다.
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {order.totalAmount.toLocaleString("ko-KR")}원
              </div>
              {order.creditAmount && order.creditAmount > 0 && (
                <div className="text-xs text-slate-500">
                  크레딧당 ₩{Math.round(order.totalAmount / order.creditAmount).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {order.orderType === "SUBSCRIPTION" && (
        <div className="mt-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">주문 내용 — 호스팅 연장</h2>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white grid place-items-center text-xl font-bold shrink-0">
              ∞
            </div>
            <div className="flex-1">
              <div className="text-lg font-bold text-slate-900">
                {order.subscriptionMonths ? `${order.subscriptionMonths}개월` : "?"} 연장
                {order.subscriptionSite && (
                  <span className="text-sm text-slate-500 ml-2 font-normal">
                    · {order.subscriptionSite.name} ({order.subscriptionSite.shopId})
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                결제 완료 시 해당 사이트의 만료일이 자동 연장되고 accountType=유료로 전환됩니다.
              </div>
              {order.subscriptionSite && (
                <Link
                  href={`/admin/sites/${order.subscriptionSite.id}`}
                  className="text-xs text-[#405189] hover:underline mt-1 inline-block"
                >
                  사이트 상세 보기 →
                </Link>
              )}
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-slate-900">
                {order.totalAmount.toLocaleString("ko-KR")}원
              </div>
              {order.subscriptionMonths && order.subscriptionMonths > 0 && (
                <div className="text-xs text-slate-500">
                  월 ₩{Math.round(order.totalAmount / order.subscriptionMonths).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
