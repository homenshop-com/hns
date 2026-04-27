import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import IntegrationsClient from "./integrations-client";
import { listAdapters } from "@/lib/marketplaces/registry";
import type { OrderChannel } from "@/generated/prisma/client";

/**
 * /dashboard/integrations — marketplace connections, scoped to the user.
 *
 * Independent of homenshop sites: a seller can connect Coupang/Shopify/etc
 * accounts without owning any homenshop site, and conversely a site doesn't
 * imply any marketplace connection. Optionally each integration can be
 * tagged with a site (for inventory/customer linking) but it's not required.
 */
export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [integrations, sites] = await Promise.all([
    prisma.marketplaceIntegration.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        channel: true,
        label: true,
        displayName: true,
        siteId: true,
        site: { select: { name: true, shopId: true } },
        status: true,
        lastSyncAt: true,
        lastError: true,
      },
      orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
    }),
    prisma.site.findMany({
      where: { userId: session.user.id, isTemplateStorage: false },
      select: { id: true, name: true, shopId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  type ConnectableChannel = Exclude<OrderChannel, "STOREFRONT">;
  const adapters = listAdapters().map((a) => ({
    channel: a.channel as ConnectableChannel,
    displayName: a.displayName,
    implemented: a.implemented,
  }));

  const totalActive = integrations.filter((i) => i.status === "ACTIVE").length;

  return (
    <DashboardShell
      active="integrations"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "마켓플레이스 연동" },
      ]}
    >
      <div className="dv2-page-head">
        <div>
          <h1 className="dv2-page-title">마켓플레이스 연동</h1>
          <div className="dv2-page-sub">
            외부 쇼핑몰의 주문을 한 곳에서 관리하세요. 한 마켓플레이스에 여러 셀러
            계정(예: 뷰티 / 식품)을 동시에 연결할 수 있고, 모든 주문은{" "}
            <a href="/dashboard/orders" style={{ color: "var(--brand)" }}>주문 관리</a>에 합쳐집니다.
            현재 <b>{integrations.length}개</b> 계정 연결 ({totalActive}개 활성).
          </div>
        </div>
      </div>

      <IntegrationsClient
        sites={sites}
        adapters={adapters}
        integrations={integrations
          .filter((i): i is typeof i & { channel: ConnectableChannel } => i.channel !== "STOREFRONT")
          .map((i) => ({
            id: i.id,
            channel: i.channel,
            label: i.label,
            displayName: i.displayName,
            siteId: i.siteId,
            siteName: i.site?.name ?? null,
            siteShopId: i.site?.shopId ?? null,
            status: i.status,
            lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
            lastError: i.lastError,
          }))}
      />
    </DashboardShell>
  );
}
