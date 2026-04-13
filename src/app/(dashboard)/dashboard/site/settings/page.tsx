import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import EditSiteForm from "../edit-site-form";
import LanguageSettings from "@/components/LanguageSettings";
import DeleteSiteButton from "./delete-site-button";

interface SettingsPageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function SiteSettingsPage({ searchParams }: SettingsPageProps) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("settings");
  const td = await getTranslations("dashboard");

  const params = await searchParams;
  const siteId = params.id;

  const site = siteId
    ? await prisma.site.findFirst({
        where: { id: siteId, userId: session.user.id },
        include: { domains: true },
      })
    : await prisma.site.findFirst({
        where: { userId: session.user.id },
        include: { domains: true },
      });

  if (!site) {
    redirect("/dashboard");
  }

  const siteLanguages = (site as typeof site & { languages?: string[] })
    .languages || ["ko"];

  const ACCOUNT_LABELS: Record<string, string> = {
    "0": t("accountFree"),
    "1": t("accountPaid"),
    "2": t("accountTest"),
    "9": t("accountExpired"),
  };

  return (
    <div className="dash-page">
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              homeNshop
            </Link>
            <span className="dash-logo-sub">{t("pageTitle")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">
              {td("dashboard")}
            </Link>
            <Link href="/dashboard/profile" className="dash-header-btn">
              {td("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        {/* Site URL bar */}
        <div className="settings-url-bar">
          <div>
            <div className="settings-url-label">{t("siteUrl")}</div>
            <a
              href={`https://home.homenshop.com/${site.shopId}/${site.defaultLanguage}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="settings-url-link"
            >
              home.homenshop.com/{site.shopId}/{site.defaultLanguage}/
            </a>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <span
              className={`settings-status ${site.published ? "published" : ""}`}
            >
              {site.published ? t("published") : t("unpublished")}
            </span>
            <Link
              href={`/dashboard/site/${site.id}/manage/menus`}
              className="settings-action-btn"
            >
              {t("menuManage")}
            </Link>
          </div>
        </div>

        {/* Cards grid */}
        <div className="settings-grid">
          {/* 기본 정보 */}
          <div className="settings-card">
            <div className="settings-card-header orange">{t("basicInfo")}</div>
            <div className="settings-card-body">
              <EditSiteForm
                site={{
                  id: site.id,
                  name: site.name,
                  description: site.description,
                  languages: siteLanguages,
                  defaultLanguage: site.defaultLanguage,
                }}
              />
            </div>
          </div>

          {/* 언어 설정 */}
          <div className="settings-card">
            <div className="settings-card-header green">{t("languageSettings")}</div>
            <div className="settings-card-body">
              <LanguageSettings
                siteId={site.id}
                languages={siteLanguages}
                defaultLanguage={site.defaultLanguage}
                variant="full"
              />
            </div>
          </div>

          {/* 커스텀 도메인 */}
          <div className="settings-card">
            <div className="settings-card-header blue">{t("customDomain")}</div>
            <div className="settings-card-body">
              {site.domains.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {site.domains.map((d) => (
                    <li key={d.id} className="settings-domain-item">
                      <span
                        className={`settings-domain-dot ${d.sslEnabled ? "ssl" : ""}`}
                      />
                      <span>{d.domain}</span>
                      {d.sslEnabled && (
                        <span className="settings-ssl-badge">SSL</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="settings-empty-text">{t("noDomains")}</p>
              )}
              <div style={{ marginTop: 12 }}>
                <Link href="/dashboard/domains" className="settings-link">
                  {t("domainManage")} &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* 계정/만료일 */}
          <div className="settings-card">
            <div className="settings-card-header" style={{ background: "#495057" }}>{t("accountInfo")}</div>
            <div className="settings-card-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>{t("accountType")}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e" }}>
                  {ACCOUNT_LABELS[site.accountType] || site.accountType}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>{t("createdAt")}</span>
                <span style={{ fontSize: 13, color: "#495057" }}>
                  {new Date(site.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#868e96" }}>{t("expiresAt")}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: site.expiresAt && new Date(site.expiresAt) < new Date() ? "#e03131" : "#1a1a2e" }}>
                  {site.expiresAt
                    ? new Date(site.expiresAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
                    : t("unlimited")}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#868e96" }}></span>
                <Link href={`/dashboard/site/${site.id}/extend`} style={{ fontSize: 13, color: "#4a90d9", fontWeight: 500 }}>
                  {t("extend")} &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Google 설정 */}
          <div className="settings-card">
            <div className="settings-card-header purple">{t("googleSettings")}</div>
            <div className="settings-card-body">
              <Link
                href={`/dashboard/site/${site.id}/manage/config/analytics`}
                className="settings-menu-item"
              >
                Google Analytics
              </Link>
              <Link
                href={`/dashboard/site/${site.id}/manage/config/search-console`}
                className="settings-menu-item"
              >
                Google Search Console
              </Link>

              {/* Sitemap */}
              <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 12, paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a2e", marginBottom: 8 }}>{t("sitemap")}</div>
                {(() => {
                  const activeDomain = site.domains.find((d) => d.status === "ACTIVE");
                  const sitemapApiUrl = `https://homenshop.com/api/sitemap/${site.id}`;
                  const sitemapCustomUrl = activeDomain ? `https://${activeDomain.domain}/sitemap.xml` : null;
                  return (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ marginBottom: 6 }}>
                        <span style={{ color: "#868e96" }}>{t("sitemapDefault")}: </span>
                        <a
                          href={sitemapApiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#4a90d9", wordBreak: "break-all" }}
                        >
                          {sitemapApiUrl}
                        </a>
                      </div>
                      {sitemapCustomUrl && (
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ color: "#868e96" }}>{t("sitemapDomain")}: </span>
                          <a
                            href={sitemapCustomUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "#4a90d9", wordBreak: "break-all" }}
                          >
                            {sitemapCustomUrl}
                          </a>
                        </div>
                      )}
                      <p style={{ color: "#868e96", marginTop: 8, lineHeight: 1.5 }}>
                        {t("sitemapGuide")}
                        {sitemapCustomUrl
                          ? ` ${t("sitemapDomainHint")}`
                          : ` ${t("sitemapNoDomainHint")}`}
                      </p>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* 계정 삭제 */}
        <div className="settings-card" style={{ marginTop: 24 }}>
          <div className="settings-card-header" style={{ background: "#e03131" }}>{t("deleteAccount")}</div>
          <div className="settings-card-body">
            <p style={{ fontSize: 13, color: "#868e96", marginBottom: 12 }}>
              {t("deleteWarning")}
            </p>
            <DeleteSiteButton siteId={site.id} shopId={site.shopId} />
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
