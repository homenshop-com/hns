import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-xl font-bold">
            Homenshop
          </Link>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {session.user.name} ({session.user.email})
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <Link
            href="/dashboard/orders"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            &larr; 주문 목록
          </Link>
        </div>

        <div className="flex items-center gap-4 mb-6">
          <h2 className="text-2xl font-bold">주문 상세</h2>
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

          {/* Shipping Info */}
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold mb-4">배송 정보</h3>
            <dl className="space-y-3">
              <InfoRow label="받는분" value={order.shippingName || "-"} />
              <InfoRow label="연락처" value={order.shippingPhone || "-"} />
              <InfoRow label="주소" value={order.shippingAddr || "-"} />
              <InfoRow label="배송메모" value={order.shippingMemo || "-"} />
            </dl>
          </div>
        </div>

        {/* Order Items */}
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

        <div className="mt-6">
          <Link
            href="/dashboard/orders"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 주문 목록으로 돌아가기
          </Link>
        </div>
      </main>
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
      <dt className="text-sm text-zinc-500">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
