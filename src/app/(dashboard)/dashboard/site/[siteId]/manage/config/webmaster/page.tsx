import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../../../../../dashboard-shell";
import WebmasterForm from "./WebmasterForm";
import { canManageSite } from "@/lib/site-access";
import { getTranslations } from "next-intl/server";

export default async function WebmasterConfigPage({
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
    select: { id: true, shopId: true, userId: true, googleVerification: true },
  });

  if (!site || !(await canManageSite(siteId))) {
    redirect("/dashboard");
  }

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: t("breadcrumbHome"), href: "/dashboard" },
        { label: t("dataManage"), href: `/dashboard/site/${siteId}/manage` },
        { label: "Webmaster Tools" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/${siteId}/manage`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; {t("dataManage")}
          </Link>
        </div>
        <div style={{ background: "#fff", borderRadius: 8, padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#111827", marginBottom: 8, marginTop: 0 }}>
            Google Search Console (Webmaster Tools)
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            {t("wmIntroLine1")}<br />
            {t("wmIntroLine2")}
          </p>

          <WebmasterForm siteId={site.id} currentValue={site.googleVerification || ""} />

          <div style={{ marginTop: 24, padding: "16px 20px", background: "#f0f9ff", borderRadius: 6, border: "1px solid #bae6fd" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0c4a6e", marginBottom: 8 }}>{t("scSetupTitle")}</div>
            <ol style={{ fontSize: 13, color: "#374151", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li><a href="https://search.google.com/search-console" target="_blank" rel="noopener" style={{ color: "#2563eb" }}>Google Search Console</a>{t("scStep1Suffix")}</li>
              <li>{t("scStep2")}</li>
              <li>{t("scStep3")}</li>
              <li>{t.rich("scStep4", { code: (c) => <code style={{ background: "#e0f2fe", padding: "1px 4px", borderRadius: 3 }}>{c}</code> })}</li>
              <li>{t("scStep5")}</li>
            </ol>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
