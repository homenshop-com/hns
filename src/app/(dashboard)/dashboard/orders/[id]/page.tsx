import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import DashboardShell from "../../dashboard-shell";

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
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  PAID: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  SHIPPING:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  DELIVERED:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  REFUNDED:
    "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  PRODUCT: "상품",
  CREDIT_PACK: "크레딧 팩",
  SUBSCRIPTION: "호스팅 연장",
};

const ORDER_TYPE_COLORS: Record<string, string> = {
  PRODUCT: "bg-zinc-100 text-zinc-700",
  CREDIT_PACK: "bg-violet-100 text-violet-700",
  SUBSCRIPTION: "bg-emerald-100 text-emerald-700",
};

export default async function DashboardOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: { name: true, price: true, salePrice: true, images: true },
          },
        },
      },
    },
  });

  if (!order || order.userId !== session.user.id) {
    notFound();
  }

  // Resolve subscription site name for SUBSCRIPTION orders (no FK relation)
  const subscriptionSite =
    order.orderType === "SUBSCRIPTION" && order.subscriptionSiteId
      ? await prisma.site.findUnique({
          where: { id: order.subscriptionSiteId },
          select: { id: true, name: true, shopId: true },
        })
      : null;

  return (
    <DashboardShell
      active="orders"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "주문 관리", href: "/dashboard/orders" },
        { label: order.orderNumber },
      ]}
    >
      <div>
        <div className="mb-6">
          <Link
            href="/dashboard/orders"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; 주문 목록
          </Link>
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h2 className="text-2xl font-bold">주문 상세</h2>
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${ORDER_TYPE_COLORS[order.orderType] ?? ""}`}
          >
            {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
          </span>
          <span
            className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${STATUS_COLORS[order.status] ?? ""}`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Info */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold mb-4">주문 정보</h3>
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
                    subscriptionSite
                      ? `${subscriptionSite.name} (${subscriptionSite.shopId})`
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
              <InfoRow
                label="결제수단"
                value={order.paymentMethod || "-"}
              />
            </dl>

            {order.status === "PENDING" && (
              <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                <Link
                  href={`/dashboard/orders/${order.id}/checkout`}
                  className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white text-center hover:bg-blue-700 transition-colors"
                >
                  결제하기
                </Link>
              </div>
            )}
          </div>

          {/* Shipping Info — only relevant for PRODUCT orders. Credit
              pack and subscription orders don't ship anything, so we
              hide this card and let the detail block expand. */}
          {order.orderType === "PRODUCT" && (
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-lg font-semibold mb-4">배송 정보</h3>
              <dl className="space-y-3">
                <InfoRow label="받는분" value={order.shippingName || "-"} />
                <InfoRow label="연락처" value={order.shippingPhone || "-"} />
                <InfoRow label="주소" value={order.shippingAddr || "-"} />
                <InfoRow label="배송메모" value={order.shippingMemo || "-"} />
              </dl>
            </div>
          )}
        </div>

        {/* Order contents — layout switches on orderType. Credit/Subscription
            orders don't use OrderItem rows; show a tailored summary. */}
        {order.orderType === "PRODUCT" && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold px-6 pt-6 pb-4">주문 상품</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    상품명
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    단가
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    수량
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    소계
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="px-6 py-4 font-medium">
                      {item.product.name}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      {item.price.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-6 py-4 text-right">{item.quantity}</td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-medium">
                      {(item.price * item.quantity).toLocaleString("ko-KR")}원
                    </td>
                  </tr>
                ))}
                {order.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 text-sm">
                      주문 상품이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 dark:border-zinc-800">
                  <td
                    colSpan={3}
                    className="px-6 py-4 text-right font-semibold"
                  >
                    합계
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-lg">
                    {order.totalAmount.toLocaleString("ko-KR")}원
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {order.orderType === "CREDIT_PACK" && (
          <div className="mt-6 rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 dark:border-violet-900 dark:from-violet-950 dark:to-zinc-900">
            <h3 className="text-lg font-semibold mb-4">주문 내용 — 크레딧 팩</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-xl bg-violet-600 text-white grid place-items-center text-xl font-bold shrink-0">
                C
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold">
                  {order.creditAmount ? order.creditAmount.toLocaleString() : "?"} C
                  <span className="text-sm text-zinc-500 ml-2 font-normal">크레딧 충전</span>
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  결제 완료 시 내 계정에 자동 적립됩니다.
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">
                  {order.totalAmount.toLocaleString("ko-KR")}원
                </div>
                {order.creditAmount && order.creditAmount > 0 && (
                  <div className="text-xs text-zinc-500">
                    크레딧당 ₩{Math.round(order.totalAmount / order.creditAmount).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {order.orderType === "SUBSCRIPTION" && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 dark:border-emerald-900 dark:from-emerald-950 dark:to-zinc-900">
            <h3 className="text-lg font-semibold mb-4">주문 내용 — 호스팅 연장</h3>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white grid place-items-center text-xl font-bold shrink-0">
                ∞
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-lg font-bold">
                  {order.subscriptionMonths ? `${order.subscriptionMonths}개월` : "?"} 연장
                  {subscriptionSite && (
                    <span className="text-sm text-zinc-500 ml-2 font-normal">
                      · {subscriptionSite.name} ({subscriptionSite.shopId})
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  결제 완료 시 해당 사이트의 만료일이 자동 연장됩니다.
                </div>
                {subscriptionSite && (
                  <Link
                    href={`/dashboard/site/settings?id=${subscriptionSite.id}`}
                    className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                  >
                    사이트 설정 보기 →
                  </Link>
                )}
              </div>
              <div className="text-right">
                <div className="text-lg font-bold">
                  {order.totalAmount.toLocaleString("ko-KR")}원
                </div>
                {order.subscriptionMonths && order.subscriptionMonths > 0 && (
                  <div className="text-xs text-zinc-500">
                    월 ₩{Math.round(order.totalAmount / order.subscriptionMonths).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/dashboard/orders"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 주문 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </DashboardShell>
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
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
