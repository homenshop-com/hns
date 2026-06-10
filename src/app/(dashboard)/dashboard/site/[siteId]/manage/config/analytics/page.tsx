import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../../../../../dashboard-shell";
import AnalyticsForm from "./AnalyticsForm";
import { getServiceAccountEmail, getAnalyticsSummary } from "@/lib/analytics";
import { canManageSite } from "@/lib/site-access";
import { getTranslations } from "next-intl/server";
import { resolvePublicHost } from "@/lib/temp-domains";
import { getResellerForHost } from "@/lib/reseller";

export default async function AnalyticsConfigPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const { siteId } = await params;
  const t = await getTranslations("siteManage");

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      shopId: true,
      userId: true,
      googleAnalyticsId: true,
      googleAnalyticsPropertyId: true,
      tempDomain: true,
      domains: { select: { domain: true, status: true } },
    },
  });

  if (!site || !(await canManageSite(siteId))) {
    redirect("/dashboard");
  }

  const serviceAccountEmail = getServiceAccountEmail();

  // Reseller context: on a white-label host, public URLs must surface
  // `home.{reseller domain}` instead of leaking `home.homenshop.com`.
  const reseller = await getResellerForHost();

  // If a Property ID is set, kick off a Data API call so we can show a
  // preview row inline. Failure → render a "not yet" hint, never crash.
  const summary = site.googleAnalyticsPropertyId
    ? await getAnalyticsSummary(site.googleAnalyticsPropertyId)
    : null;

  // Custom domain detection — domains in ACTIVE status that aren't the
  // platform temp domain. These users need a separate snippet of advice.
  const customDomains = site.domains.filter(
    (d) => d.status === "ACTIVE" && !d.domain.endsWith(".homenshop.com") && !d.domain.endsWith(".homenshop.net"),
  );

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("dataManage"), href: `/dashboard/site/${siteId}/manage` },
        { label: "Google Analytics" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/${siteId}/manage`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; {t("dataManage")}
          </Link>
        </div>

        {/* Hero card — title + connection status badge */}
        <div style={{ background: "#fff", borderRadius: 10, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#191f28", margin: 0 }}>
              Google Analytics
            </h1>
            {site.googleAnalyticsId && summary?.configured && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                background: "#ecfdf5",
                color: "#047857",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #a7f3d0",
              }}>
                <span style={{
                  display: "inline-block",
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#10b981",
                }} />
                {t("gaConnected")}
              </span>
            )}
            {site.googleAnalyticsId && summary && !summary.configured && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                background: "#fef3c7",
                color: "#92400e",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid #fde68a",
              }}>
                {t("gaPendingAccess")}
              </span>
            )}
          </div>
          <p style={{ fontSize: 14, color: "#6b7684", marginBottom: 28, lineHeight: 1.6, marginTop: 0 }}>
            {t("gaIntro")}
          </p>

          <AnalyticsForm
            siteId={site.id}
            currentMeasurementId={site.googleAnalyticsId || ""}
            currentPropertyId={site.googleAnalyticsPropertyId || ""}
            serviceAccountEmail={serviceAccountEmail}
          />

          {/* Live preview if connected — quick reassurance numbers */}
          {summary?.configured && (
            <div style={{ marginTop: 28, padding: 20, background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0f766e", marginBottom: 12, letterSpacing: 0.5 }}>
                📊 {t("gaLive7d")}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <Stat label={t("gaActiveUsers")} value={summary.totalUsers} />
                <Stat label={t("gaPageViews")} value={summary.pageViews} />
                <Stat label={t("gaSessions")} value={summary.sessions} />
                <Stat label={t("gaRealtime")} value={summary.activeUsersNow} pulse />
              </div>
              <Link
                href={`/dashboard/site/${siteId}/manage`}
                style={{
                  display: "inline-block",
                  marginTop: 14,
                  fontSize: 13,
                  color: "#0f766e",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {t("gaViewFullStats")} →
              </Link>
            </div>
          )}
          {summary && !summary.configured && site.googleAnalyticsPropertyId && (
            <div style={{
              marginTop: 28,
              padding: 16,
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 8,
              fontSize: 13,
              color: "#92400e",
              lineHeight: 1.6,
            }}>
              <strong>{t("gaNoDataYet")}</strong> {t("gaNoDataYetDesc")} ({t("gaResponseLabel")}: <code style={{ fontSize: 11 }}>{summary.reason}</code>)
            </div>
          )}
        </div>

        {/* Setup guide — collapsible by default since most users follow inline steps */}
        <div style={{
          marginTop: 24,
          background: "#fff",
          borderRadius: 10,
          padding: "20px 28px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#191f28", marginTop: 0, marginBottom: 14 }}>
            {t("gaGuideTitle")}
          </h2>
          <ol style={{ fontSize: 13.5, color: "#4e5968", lineHeight: 1.9, margin: 0, paddingLeft: 22 }}>
            <li>
              <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#3182f6", fontWeight: 600 }}>
                Google Analytics ↗
              </a>{" "}
              {t("gaGuideStep1")}
            </li>
            <li>
              {t.rich("gaGuideStep2", { strong: (c) => <strong>{c}</strong> })}
              <ul style={{ marginTop: 6, marginBottom: 6, paddingLeft: 18, color: "#6b7684" }}>
                <li>
                  {t("gaGuideStep2Url")}:{" "}
                  <code style={{ background: "#f2f4f6", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
                    {customDomains[0]?.domain
                      ? `https://${customDomains[0].domain}`
                      : `https://${resolvePublicHost(site, reseller)}/${site.shopId}`}
                  </code>
                </li>
                <li>{t("gaGuideStep2Stream")}</li>
              </ul>
            </li>
            <li>
              {t.rich("gaGuideStep3", { strong: (c) => <strong>{c}</strong> })}
            </li>
            <li>
              {t.rich("gaGuideStep4", { strong: (c) => <strong>{c}</strong> })}
            </li>
            <li>{t("gaGuideStep5")}</li>
            <li>{t("gaGuideStep6")}</li>
          </ol>
        </div>

        {/* Custom-domain specific guidance — only if user has one */}
        {customDomains.length > 0 && (
          <div style={{
            marginTop: 16,
            background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
            border: "1px solid #fde68a",
            borderRadius: 10,
            padding: "20px 28px",
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginTop: 0, marginBottom: 10 }}>
              🌐 {t("gaCustomDomainTitle")}
            </h2>
            <p style={{ fontSize: 13, color: "#78350f", margin: "0 0 10px", lineHeight: 1.7 }}>
              {t("gaCustomDomainPrefix")}{" "}
              {customDomains.map((d, i) => (
                <span key={d.domain}>
                  <code style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 3, fontSize: 12, fontWeight: 700 }}>
                    {d.domain}
                  </code>
                  {i < customDomains.length - 1 && ", "}
                </span>
              ))}
              {" "}{t("gaCustomDomainSuffix")}
            </p>
            <ul style={{ fontSize: 13, color: "#78350f", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>
                {t.rich("gaCustomDomainNote1Pre", { strong: (c) => <strong>{c}</strong> })}{" "}
                <code style={{ background: "#fef3c7", padding: "1px 6px", borderRadius: 3, fontSize: 12 }}>
                  https://{customDomains[0].domain}
                </code>{" "}
                {t("gaCustomDomainNote1Post")}
              </li>
              <li>
                {t("gaCustomDomainNote2")}
              </li>
              <li>
                {t("gaCustomDomainNote3")}
              </li>
            </ul>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function Stat({ label, value, pulse }: { label: string; value: number; pulse?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: "#0f766e",
        letterSpacing: 0.3,
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}>
        {label}
        {pulse && value > 0 && (
          <span style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#10b981",
            animation: "pulse 1.5s infinite",
          }} />
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
