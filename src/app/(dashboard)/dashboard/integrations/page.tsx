import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import DashboardShell from "../dashboard-shell";
import IntegrationsClient from "./integrations-client";
import { listAdapters } from "@/lib/marketplaces/registry";
import { canAccessIntegrations } from "@/lib/feature-flags";
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

  // Beta-staged: only allow-listed accounts may access this surface.
  if (!canAccessIntegrations(session.user.email)) {
    redirect("/dashboard");
  }

  const [t, td, integrations, sites] = await Promise.all([
    getTranslations("integrations"),
    getTranslations("dashboard"),
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
        { label: td("breadcrumbHome"), href: "/dashboard" },
        { label: t("title") },
      ]}
    >
      <div className="dv2-page-head">
        <div>
          <h1 className="dv2-page-title">{t("title")}</h1>
          <div className="dv2-page-sub">
            {t("subtitle")}
            <a href="/dashboard/orders" style={{ color: "var(--brand)" }}>{t("subtitleOrdersLink")}</a>
            {t("subtitleTail")}{" "}
            {t("subtitleStats", { count: integrations.length, active: totalActive })}
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
