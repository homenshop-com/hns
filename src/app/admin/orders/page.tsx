import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";
import ConfirmDepositButton from "./confirm-deposit-button";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "결제대기",
  PAID: "결제완료",
  SHIPPING: "배송중",
  DELIVERED: "배송완료",
  CANCELLED: "취소",
  REFUNDED: "환불",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700",
  PAID: "bg-[#405189]/10 text-[#405189]",
  SHIPPING: "bg-violet-50 text-violet-700",
  DELIVERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-700",
  REFUNDED: "bg-slate-500/10 text-slate-600",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  PRODUCT: "상품",
  CREDIT_PACK: "크레딧",
  SUBSCRIPTION: "호스팅",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  PRODUCT: "bg-slate-100 text-slate-700",
  CREDIT_PACK: "bg-violet-50 text-violet-700",
  SUBSCRIPTION: "bg-emerald-50 text-emerald-700",
};

const ALL_STATUSES = [
  "PENDING",
  "PAID",
  "SHIPPING",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];
const ALL_TYPES = ["PRODUCT", "CREDIT_PACK", "SUBSCRIPTION"] as const;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; type?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const statusFilter = params.status || "";
  const typeFilter = params.type || "";

  const where: {
    status?: "PENDING" | "PAID" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "REFUNDED";
    orderType?: "PRODUCT" | "CREDIT_PACK" | "SUBSCRIPTION";
  } = {};
  if (statusFilter) {
    where.status = statusFilter as typeof where.status;
  }
  if (typeFilter) {
    where.orderType = typeFilter as typeof where.orderType;
  }

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { email: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Build URL preserving filters
  const buildUrl = (overrides: { status?: string; type?: string; page?: number }) => {
    const qs = new URLSearchParams();
    const s = overrides.status !== undefined ? overrides.status : statusFilter;
    const t = overrides.type !== undefined ? overrides.type : typeFilter;
    if (s) qs.set("status", s);
    if (t) qs.set("type", t);
    if (overrides.page && overrides.page > 1) qs.set("page", String(overrides.page));
    const q = qs.toString();
    return q ? `/admin/orders?${q}` : "/admin/orders";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-900">주문 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}건
        </span>
      </div>

      {/* Type Filter */}
      <div className="mb-3 flex flex-wrap gap-2">
        <Link
          href={buildUrl({ type: "" })}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            !typeFilter
              ? "bg-[#405189] text-white"
              : "border border-slate-300 hover:bg-slate-100"
          }`}
        >
          전체 유형
        </Link>
        {ALL_TYPES.map((t) => (
          <Link
            key={t}
            href={buildUrl({ type: t })}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              typeFilter === t
                ? "bg-[#405189] text-white"
                : "border border-slate-300 hover:bg-slate-100"
            }`}
          >
            {ORDER_TYPE_LABELS[t]}
          </Link>
        ))}
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={buildUrl({ status: "" })}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            !statusFilter
              ? "bg-[#405189] text-white"
              : "border border-slate-300 hover:bg-slate-100"
          }`}
        >
          전체 상태
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={buildUrl({ status: s })}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              statusFilter === s
                ? "bg-[#405189] text-white"
                : "border border-slate-300 hover:bg-slate-100"
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left">
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">주문번호</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">유형</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">회원</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-right">결제금액</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-center">상세</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-center">상태</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-right">주문일</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-center">액션</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const isPendingSubscription =
                order.orderType === "SUBSCRIPTION" && order.status === "PENDING";
              return (
                <tr
                  key={order.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-6 py-3">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="font-mono text-sm text-[#405189] hover:text-[#405189]"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-block rounded-md px-2 py-1 text-[11px] font-medium ${ORDER_TYPE_COLORS[order.orderType] || ""}`}
                    >
                      {ORDER_TYPE_LABELS[order.orderType] || order.orderType}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    <div>{order.user.name || "-"}</div>
                    <div className="text-xs text-slate-600">{order.user.email}</div>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap font-medium text-slate-800">
                    {order.totalAmount.toLocaleString("ko-KR")}원
                  </td>
                  <td className="px-6 py-3 text-center text-slate-500 text-xs">
                    {order.orderType === "SUBSCRIPTION"
                      ? `${order.subscriptionMonths ?? "?"}개월`
                      : order.orderType === "CREDIT_PACK"
                        ? `${order.creditAmount ?? "?"}C`
                        : `${order._count.items}건`}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span
                      className={`inline-block rounded-md px-2 py-1 text-xs font-medium ${STATUS_COLORS[order.status] || ""}`}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right text-slate-500 whitespace-nowrap">
                    {order.createdAt.toLocaleDateString("ko-KR")}
                  </td>
                  <td className="px-6 py-3 text-center">
                    {isPendingSubscription && (
                      <ConfirmDepositButton
                        orderId={order.id}
                        orderNumber={order.orderNumber}
                        totalAmount={order.totalAmount}
                        months={order.subscriptionMonths}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-6 py-8 text-center text-slate-600"
                >
                  {statusFilter || typeFilter
                    ? "조건에 맞는 주문이 없습니다."
                    : "주문 내역이 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={buildUrl({ page: page - 1 })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              이전
            </Link>
          )}

          <span className="text-sm text-slate-500">
            {page} / {totalPages} 페이지
          </span>

          {page < totalPages && (
            <Link
              href={buildUrl({ page: page + 1 })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
