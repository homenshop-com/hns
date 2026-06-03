import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import DashboardShell from "../../../../../dashboard-shell";
import SearchConsoleForm from "./SearchConsoleForm";
import { canManageSite } from "@/lib/site-access";
import { getTranslations } from "next-intl/server";

export default async function SearchConsoleConfigPage({
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
        { label: t("basicInfoManage"), href: `/dashboard/site/settings?id=${siteId}` },
        { label: "Google Search Console" },
      ]}
    >
      <div>
        <div style={{ marginBottom: 16 }}>
          <Link href={`/dashboard/site/settings?id=${siteId}`} style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; {t("basicInfoManage")}
          </Link>
        </div>

        <div style={{ background: "#fff", borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", overflow: "hidden", maxWidth: 720 }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0" }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a2e", margin: 0 }}>
              Google Search Console
            </h1>
            <p style={{ fontSize: 13, color: "#868e96", marginTop: 4, marginBottom: 0 }}>
              {t("scSubtitle")}
            </p>
          </div>

          <div style={{ padding: 24 }}>
            <SearchConsoleForm siteId={site.id} currentValue={site.googleVerification || ""} />

            <div style={{ marginTop: 24, padding: "16px 20px", background: "#f8f9fa", borderRadius: 6, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>{t("scSetupTitle")}</div>
              <ol style={{ fontSize: 13, color: "#495057", lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
                <li>
                  <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
                    Google Search Console
                  </a>{t("scStep1Suffix")}
                </li>
                <li>{t("scStep2")}</li>
                <li>{t("scStep3")}</li>
                <li>
                  {t.rich("scStep4", { code: (c) => <code style={{ background: "#e9ecef", padding: "1px 4px", borderRadius: 3, fontSize: 12 }}>{c}</code> })}
                </li>
                <li>{t("scStep5")}</li>
              </ol>
            </div>

            <div style={{ marginTop: 16 }}>
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#4a90d9", textDecoration: "none" }}
              >
                {t("scGoTo")} &rarr;
              </a>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
