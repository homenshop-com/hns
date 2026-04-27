import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import OrderActions from "./order-actions";
import DashboardShell from "../dashboard-shell";
import type { OrderChannel, OrderStatus, Prisma } from "@/generated/prisma/client";

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

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  STOREFRONT: "내 사이트",
  SHOPIFY: "Shopify",
  COUPANG: "쿠팡",
  AMAZON: "Amazon",
  QOO10: "Qoo10",
  RAKUTEN: "Rakuten",
  TIKTOKSHOP: "TikTok",
};

const CHANNEL_BADGE_BG: Record<OrderChannel, string> = {
  STOREFRONT: "#eaefff",
  SHOPIFY: "#dcfce7",
  COUPANG: "#fee2e2",
  AMAZON: "#fef3c7",
  QOO10: "#fce7f3",
  RAKUTEN: "#dbeafe",
  TIKTOKSHOP: "#f3e8ff",
};
const CHANNEL_BADGE_FG: Record<OrderChannel, string> = {
  STOREFRONT: "#2545e0",
  SHOPIFY: "#166534",
  COUPANG: "#991b1b",
  AMAZON: "#92400e",
  QOO10: "#9d174d",
  RAKUTEN: "#1e40af",
  TIKTOKSHOP: "#6b21a8",
};

export default async function DashboardOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string; channel?: string; status?: string; integrationId?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const sp = await searchParams;
  const filterSiteId = sp.siteId || "";
  const filterChannel = sp.channel || "";
  const filterStatus = sp.status || "";
  const filterIntegrationId = sp.integrationId || "";

  // List of user's sites for the site filter chip group.
  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    select: { id: true, name: true, shopId: true },
    orderBy: { createdAt: "asc" },
  });

  // List of user's marketplace integrations for the per-account filter chip.
  const userIntegrations = await prisma.marketplaceIntegration.findMany({
    where: { site: { userId: session.user.id } },
    select: {
      id: true,
      siteId: true,
      channel: true,
      label: true,
      displayName: true,
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });

  const where: Prisma.OrderWhereInput = { userId: session.user.id };
  if (filterSiteId) where.siteId = filterSiteId;
  if (filterChannel && filterChannel !== "ALL") {
    where.channel = filterChannel as OrderChannel;
  }
  if (filterStatus && filterStatus !== "ALL") {
    where.status = filterStatus as OrderStatus;
  }
  if (filterIntegrationId) where.integrationId = filterIntegrationId;

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      site: { select: { id: true, name: true, shopId: true } },
      integration: { select: { id: true, label: true, displayName: true } },
      items: {
        include: {
          product: {
            select: { name: true },
          },
        },
      },
    },
  });

  // Channel facet counts for the chip bar (across all sites/statuses for this user).
  const channelCounts = await prisma.order.groupBy({
    by: ["channel"],
    where: { userId: session.user.id, ...(filterSiteId ? { siteId: filterSiteId } : {}) },
    _count: { _all: true },
  });
  const totalAcrossAllChannels = channelCounts.reduce((s, c) => s + c._count._all, 0);
  const countByChannel = new Map(channelCounts.map((c) => [c.channel, c._count._all]));

  function qs(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (filterSiteId) params.set("siteId", filterSiteId);
    if (filterChannel) params.set("channel", filterChannel);
    if (filterStatus) params.set("status", filterStatus);
    if (filterIntegrationId) params.set("integrationId", filterIntegrationId);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `?${s}` : "";
  }

  // Filter integrations to those matching the active site/channel filter.
  // (The chip strip should only show accounts that could realistically
  // appear in the current view.)
  const visibleIntegrations = userIntegrations.filter((i) => {
    if (filterSiteId && i.siteId !== filterSiteId) return false;
    if (filterChannel && filterChannel !== "ALL" && filterChannel !== "STOREFRONT" && i.channel !== filterChannel) {
      return false;
    }
    return true;
  });

  return (
    <DashboardShell
      active="orders"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "주문 관리" },
      ]}
    >
      <div className="dv2-page-head">
        <div>
          <h1 className="dv2-page-title">주문 관리</h1>
          <div className="dv2-page-sub">
            모든 사이트 + 외부 마켓플레이스의 주문을 한 곳에서 확인합니다.
            총 <b>{orders.length}건</b> 표시 중 · 마켓플레이스 연결은{" "}
            <Link href="/dashboard/integrations" style={{ color: "var(--brand)" }}>
              연동 관리
            </Link>{" "}
            에서.
          </div>
        </div>
      </div>

      {/* Site filter */}
      {sites.length > 1 && (
        <div className="dv2-chip-group" style={{ marginBottom: 12, display: "flex" }}>
          <Link href={`/dashboard/orders${qs({ siteId: undefined })}`}
                className={`dv2-chip${!filterSiteId ? " on" : ""}`}>
            전체 사이트
          </Link>
          {sites.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/orders${qs({ siteId: s.id })}`}
              className={`dv2-chip${filterSiteId === s.id ? " on" : ""}`}
            >
              {s.name || s.shopId}
            </Link>
          ))}
        </div>
      )}

      {/* Channel filter */}
      <div className="dv2-chip-group" style={{ marginBottom: 12, display: "flex", flexWrap: "wrap" }}>
        <Link href={`/dashboard/orders${qs({ channel: undefined, integrationId: undefined })}`}
              className={`dv2-chip${!filterChannel ? " on" : ""}`}>
          전체 채널 <span className="n">{totalAcrossAllChannels}</span>
        </Link>
        {(["STOREFRONT", "SHOPIFY", "COUPANG", "AMAZON", "QOO10", "RAKUTEN", "TIKTOKSHOP"] as OrderChannel[]).map((c) => {
          const n = countByChannel.get(c) ?? 0;
          if (n === 0 && filterChannel !== c) return null;
          return (
            <Link
              key={c}
              href={`/dashboard/orders${qs({ channel: c, integrationId: undefined })}`}
              className={`dv2-chip${filterChannel === c ? " on" : ""}`}
            >
              {CHANNEL_LABELS[c]} <span className="n">{n}</span>
            </Link>
          );
        })}
      </div>

      {/* Integration (per-account) filter — shown when there's at least one
          marketplace account and a channel filter is active or the user has
          multiple accounts on any channel. */}
      {visibleIntegrations.length > 0 && (
        <div className="dv2-chip-group" style={{ marginBottom: 16, display: "flex", flexWrap: "wrap" }}>
          <Link href={`/dashboard/orders${qs({ integrationId: undefined })}`}
                className={`dv2-chip${!filterIntegrationId ? " on" : ""}`}>
            전체 계정
          </Link>
          {visibleIntegrations.map((i) => (
            <Link
              key={i.id}
              href={`/dashboard/orders${qs({ integrationId: i.id })}`}
              className={`dv2-chip${filterIntegrationId === i.id ? " on" : ""}`}
              title={i.displayName ?? undefined}
            >
              {CHANNEL_LABELS[i.channel]} · {i.label}
            </Link>
          ))}
        </div>
      )}

      {orders.length === 0 ? (
        <section className="dv2-panel">
          <div className="dv2-empty">
            <div className="t">주문 내역이 없습니다</div>
            <div className="d">
              {filterSiteId || filterChannel
                ? "필터를 해제하면 더 많은 주문이 보일 수 있습니다."
                : "내 사이트에서 첫 주문을 받거나, 외부 마켓플레이스를 연결하세요."}
            </div>
          </div>
        </section>
      ) : (
        <section className="dv2-panel" style={{ overflow: "hidden" }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">주문번호</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">채널</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">사이트</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">상품</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">결제금액</th>
                <th className="px-4 py-3 text-center font-medium text-zinc-500 dark:text-zinc-400">상태</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">주문일</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">관리</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const channelLabel = CHANNEL_LABELS[order.channel];
                const itemDescription =
                  order.orderType === "CREDIT_PACK"
                    ? `크레딧 팩 · ${order.creditAmount?.toLocaleString() ?? "?"} C`
                    : order.orderType === "SUBSCRIPTION"
                      ? `호스팅 연장 · ${order.subscriptionMonths ?? "?"}개월`
                      : order.items.length > 0
                        ? (order.items[0].product?.name ?? order.items[0].externalName ?? "(미매핑 SKU)") +
                          (order.items.length > 1 ? ` 외 ${order.items.length - 1}건` : "")
                        : "-";
                return (
                  <tr
                    key={order.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-medium font-mono text-xs text-blue-600 hover:underline"
                      >
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          borderRadius: 10,
                          background: CHANNEL_BADGE_BG[order.channel],
                          color: CHANNEL_BADGE_FG[order.channel],
                        }}
                        title={order.integration?.displayName ?? undefined}
                      >
                        {channelLabel}
                      </span>
                      {order.integration && (
                        <div style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 2 }}>
                          {order.integration.label}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs">
                      {order.site ? (
                        <span title={order.site.shopId}>{order.site.name || order.site.shopId}</span>
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400 text-xs">{itemDescription}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap font-medium">
                      {order.totalAmount.toLocaleString("ko-KR")}원
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status] ?? ""}`}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-xs">
                      {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <OrderActions
                        orderId={order.id}
                        orderNumber={order.orderNumber}
                        status={order.status}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </DashboardShell>
  );
}
