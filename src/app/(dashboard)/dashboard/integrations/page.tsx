import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import DashboardShell from "../dashboard-shell";
import IntegrationsClient from "./integrations-client";
import { listAdapters } from "@/lib/marketplaces/registry";
import type { OrderChannel } from "@/generated/prisma/client";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id, isTemplateStorage: false },
    select: { id: true, name: true, shopId: true },
    orderBy: { createdAt: "asc" },
  });

  const sp = await searchParams;
  const selectedSiteId = sp.siteId || sites[0]?.id;

  if (!selectedSiteId) {
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
            <div className="dv2-page-sub">먼저 홈페이지를 만들어 주세요.</div>
          </div>
        </div>
        <section className="dv2-panel">
          <div className="dv2-empty">
            <div className="t">연결할 사이트가 없습니다</div>
            <div className="d">홈페이지를 만들어야 외부 마켓플레이스와 연결할 수 있습니다.</div>
            <Link href="/dashboard/templates" className="dv2-row-btn primary">
              템플릿 둘러보기
            </Link>
          </div>
        </section>
      </DashboardShell>
    );
  }

  const integrations = await prisma.marketplaceIntegration.findMany({
    where: { siteId: selectedSiteId },
    select: {
      id: true,
      channel: true,
      label: true,
      displayName: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
    },
    orderBy: [{ channel: "asc" }, { createdAt: "asc" }],
  });

  type ConnectableChannel = Exclude<OrderChannel, "STOREFRONT">;
  const adapters = listAdapters().map((a) => ({
    channel: a.channel as ConnectableChannel,
    displayName: a.displayName,
    implemented: a.implemented,
  }));

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
            계정(예: 뷰티 / 식품)을 동시에 연결할 수 있고, 모든 주문은 자동으로{" "}
            <Link href="/dashboard/orders" style={{ color: "var(--brand)" }}>주문 관리</Link>에 합쳐집니다.
          </div>
        </div>
      </div>

      {sites.length > 1 && (
        <section className="dv2-panel" style={{ marginBottom: 16 }}>
          <div className="dv2-panel-head">
            <h2>사이트 선택</h2>
          </div>
          <div style={{ padding: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sites.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/integrations?siteId=${s.id}`}
                className={`dv2-chip${s.id === selectedSiteId ? " on" : ""}`}
              >
                {s.name || s.shopId} <span className="n">@{s.shopId}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <IntegrationsClient
        siteId={selectedSiteId}
        adapters={adapters}
        integrations={integrations
          .filter((i): i is typeof i & { channel: ConnectableChannel } => i.channel !== "STOREFRONT")
          .map((i) => ({
            id: i.id,
            channel: i.channel,
            label: i.label,
            displayName: i.displayName,
            status: i.status,
            lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
            lastError: i.lastError,
          }))}
      />
    </DashboardShell>
  );
}
