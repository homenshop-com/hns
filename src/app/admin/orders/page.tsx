import { prisma } from "@/lib/db";
import Link from "next/link";
import { parsePageParam } from "@/lib/pagination";

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
  PENDING:
    "bg-amber-500/10 text-amber-400",
  PAID: "bg-cyan-500/10 text-cyan-400",
  SHIPPING:
    "bg-violet-500/10 text-violet-400",
  DELIVERED:
    "bg-emerald-500/10 text-emerald-400",
  CANCELLED: "bg-red-500/10 text-red-400",
  REFUNDED:
    "bg-slate-500/10 text-slate-400",
};

const ALL_STATUSES = [
  "PENDING",
  "PAID",
  "SHIPPING",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const statusFilter = params.status || "";

  const where = statusFilter
    ? { status: statusFilter as "PENDING" | "PAID" | "SHIPPING" | "DELIVERED" | "CANCELLED" | "REFUNDED" }
    : {};

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: {
          select: { email: true, name: true },
        },
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-100">주문 관리</h1>
        <span className="text-sm text-slate-500">
          총 {totalCount.toLocaleString()}건
        </span>
      </div>

      {/* Status Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            !statusFilter
              ? "bg-[#1e293b]/80 text-white"
              : "border border-slate-600/40 hover:bg-slate-100"
          }`}
        >
          전체
        </Link>
        {ALL_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              statusFilter === s
                ? "bg-[#1e293b]/80 text-white"
                : "border border-slate-600/40 hover:bg-slate-100"
            }`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/30 bg-[#1e293b]/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/20 bg-slate-800/30 text-left">
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">주문번호</th>
              <th className="px-6 py-3 font-semibold text-slate-500 text-[11px] uppercase tracking-wider">회원</th>
              <th className="px-6 py-3 font-medium text-slate-500 text-right">
                결제금액
              </th>
              <th className="px-6 py-3 font-medium text-slate-500 text-center">
                상품수
              </th>
              <th className="px-6 py-3 font-medium text-slate-500 text-center">
                상태
              </th>
              <th className="px-6 py-3 font-medium text-slate-500 text-right">
                주문일
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-slate-700/20 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="font-mono text-sm text-cyan-400 hover:text-cyan-300"
                  >
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-6 py-3 text-slate-400">
                  <div>{order.user.name || "-"}</div>
                  <div className="text-xs text-slate-400">{order.user.email}</div>
                </td>
                <td className="px-6 py-3 text-right whitespace-nowrap font-medium text-slate-200">
                  {order.totalAmount.toLocaleString("ko-KR")}원
                </td>
                <td className="px-6 py-3 text-center text-slate-500">
                  {order._count.items}건
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
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-8 text-center text-slate-400"
                >
                  {statusFilter
                    ? `${STATUS_LABELS[statusFilter] || statusFilter} 상태의 주문이 없습니다.`
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
              href={`/admin/orders?page=${page - 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              이전
            </Link>
          )}

          <span className="text-sm text-slate-500">
            {page} / {totalPages} 페이지
          </span>

          {page < totalPages && (
            <Link
              href={`/admin/orders?page=${page + 1}${statusFilter ? `&status=${statusFilter}` : ""}`}
              className="rounded-lg border border-slate-600/40 px-3 py-1.5 text-sm hover:bg-slate-100"
            >
              다음
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
