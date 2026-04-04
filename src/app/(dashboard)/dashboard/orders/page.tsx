import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

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

export default async function DashboardOrdersPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const td = await getTranslations("dashboard");

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
    },
  });

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">HomeNShop</Link>
            <span className="dash-logo-sub">{td("cards.orders")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">{td("dashboard")}</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">{td("memberInfo")}</Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">주문 관리</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              총 {orders.length}건의 주문
            </p>
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-zinc-500 dark:text-zinc-400">
              주문 내역이 없습니다.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    주문번호
                  </th>
                  <th className="px-6 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">
                    상품
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    결제금액
                  </th>
                  <th className="px-6 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">
                    상태
                  </th>
                  <th className="px-6 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">
                    주문일
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-medium font-mono text-sm text-blue-600 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-zinc-600 dark:text-zinc-400">
                      {order.items.length > 0
                        ? order.items[0].product.name +
                          (order.items.length > 1
                            ? ` 외 ${order.items.length - 1}건`
                            : "")
                        : "-"}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap font-medium">
                      {order.totalAmount.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? ""}`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6">
          <Link
            href="/dashboard"
            className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            &larr; 대시보드로 돌아가기
          </Link>
        </div>
      </main>
      <footer className="dash-footer" />
    </div>
  );
}
