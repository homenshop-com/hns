import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import SignOutButton from "./sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import EmailVerifyBanner from "./email-verify-banner";
import AICreateButton from "./ai-create-button";
import { getSettingBool } from "@/lib/settings";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerified: true, email: true },
  });

  const emailVerificationEnabled = await getSettingBool("emailVerificationEnabled");

  const t = await getTranslations("dashboard");
  const tTpl = await getTranslations("templates");
  const tFooter = await getTranslations("home");

  const aiLabels = {
    btnNewSiteAI: t("btnNewSiteAI"),
    aiModalTitle: t("aiModalTitle"),
    aiNotice1: t("aiNotice1"),
    aiNotice2: t("aiNotice2"),
    defaultLanguage: tTpl("defaultLanguage"),
    subdomainSetup: tTpl("subdomainSetup"),
    subdomainPrefix: tTpl("subdomainPrefix"),
    subdomainHint: tTpl("subdomainHint"),
    aiSiteTitle: t("aiSiteTitle"),
    aiSiteTitlePlaceholder: t("aiSiteTitlePlaceholder"),
    aiPrompt: t("aiPrompt"),
    aiPromptPlaceholder: t("aiPromptPlaceholder"),
    aiGenerate: t("aiGenerate"),
    aiGenerating: t("aiGenerating"),
    langKo: tTpl("langKo"),
    langEn: tTpl("langEn"),
    langZhCn: tTpl("langZhCn"),
    langJa: tTpl("langJa"),
    langZhTw: tTpl("langZhTw"),
    langEs: tTpl("langEs"),
    errorShopIdRequired: tTpl("errorShopIdRequired"),
    errorShopIdFormat: tTpl("errorShopIdFormat"),
    errorShopIdTaken: tTpl("errorShopIdTaken"),
    errorSiteTitleRequired: t("errorSiteTitleRequired"),
    errorPromptRequired: t("errorPromptRequired"),
    emailVerifyRequired: tTpl("emailVerifyRequired"),
    emailVerifyMessage: tTpl("emailVerifyMessage"),
    emailVerifyResend: tTpl("emailVerifyResend"),
    emailVerifySent: tTpl("emailVerifySent"),
  };
  const emailVerificationEnabledForAI = emailVerificationEnabled;
  const isEmailVerifiedForAI =
    !emailVerificationEnabledForAI ||
    !!currentUser?.emailVerified ||
    currentUser?.email === "demo@demo.com";

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id },
    include: {
      domains: true,
      pages: { select: { id: true, isHome: true, lang: true }, orderBy: { sortOrder: "asc" } },
      products: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="dash-page">
      <ImpersonationBanner />
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              homeNshop
            </Link>
            <span className="dash-logo-sub">{t("title")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard/profile" className="dash-header-btn">
              {t("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        {/* EMAIL VERIFY BANNER */}
        {emailVerificationEnabled && !currentUser?.emailVerified && currentUser?.email !== "demo@demo.com" && (
          <EmailVerifyBanner
            email={currentUser?.email || ""}
            labels={{
              title: t("emailVerifyTitle"),
              message: t("emailVerifyMessage"),
              resend: t("emailVerifyResend"),
              sent: t("emailVerifySent"),
            }}
          />
        )}

        {/* TOOLBAR */}
        <div className="dash-toolbar">
          <div className="dash-toolbar-left">
            <h1 className="dash-title">{t("title")}</h1>
            <button className="dash-filter-btn active">
              {t("filterAll")}
            </button>
            <button className="dash-filter-btn">
              {t("filterFree")} ({sites.filter(s => s.accountType === "0").length})
            </button>
            <button className="dash-filter-btn">
              {t("filterPaid")} ({sites.filter(s => s.accountType === "1").length})
            </button>
            <button className="dash-filter-btn">
              {t("filterExpired")} ({sites.filter(s => s.accountType === "9").length})
            </button>
          </div>
          <div className="dash-toolbar-right">
            <AICreateButton
              emailVerified={isEmailVerifiedForAI}
              labels={aiLabels}
            />
            <Link
              href="/dashboard/templates"
              className="dash-action-btn blue"
            >
              {t("btnNewSite")}
            </Link>
            <Link href="/dashboard/orders" className="dash-action-btn orange">
              {t("btnCustomOrder")}
            </Link>
          </div>
        </div>

        {/* SITE TABLE */}
        <div className="dash-table">
          <div className="dash-table-header">
            <div className="col-account">{t("colSiteAccount")}</div>
            <div className="col-manage">{t("colSiteManage")}</div>
          </div>

          {sites.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-title">{t("noSites")}</div>
              <div className="dash-empty-desc">{t("noSitesDesc")}</div>
              <Link
                href="/dashboard/templates"
                className="dash-action-btn blue"
              >
                {t("btnNewSite")}
              </Link>
            </div>
          ) : (
            sites.map((s) => (
              <div key={s.id} className="dash-table-row">
                <div className="dash-col-account">
                  <span className={`dash-status-dot ${s.accountType === "9" || (s.expiresAt && new Date(s.expiresAt) < new Date()) ? "expired" : "active"}`} />
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span className="dash-site-id" style={{ marginBottom: 0 }}>
                      {s.name && s.name !== s.shopId ? s.name : s.shopId}
                    </span>
                    <span className={`dash-account-badge ${s.accountType === "1" ? "paid" : s.accountType === "9" ? "expired" : s.accountType === "2" ? "test" : "free"}`}>
                      {s.accountType === "1" ? t("filterPaid") : s.accountType === "9" ? t("filterExpired") : s.accountType === "2" ? "Test" : t("filterFree")}
                    </span>
                    {s.name && s.name !== s.shopId && (
                      <span style={{ fontSize: 13, color: "#868e96" }}>
                        {s.shopId}
                      </span>
                    )}
                    {s.domains.length > 0 && (
                      <span style={{ fontSize: 13, color: "#2f9e44" }}>
                        {s.domains[0].domain}
                      </span>
                    )}
                  </div>
                </div>
                <div className="dash-col-manage">
                  <Link
                    href={s.pages.length > 0 ? `/dashboard/site/pages/${(s.pages.find(p => p.isHome && p.lang === s.defaultLanguage) || s.pages.find(p => p.isHome) || s.pages[0]).id}/edit` : "/dashboard/site/pages"}
                    className="dash-manage-btn"
                  >
                    {t("btnDesign")}
                  </Link>
                  <Link href={`/dashboard/site/${s.id}/manage`} className="dash-manage-btn">
                    {t("btnData")}
                  </Link>
                  <Link href={`/dashboard/site/settings?id=${s.id}`} className="dash-manage-btn">
                    {t("btnInfo")}
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
          <p>
            {tFooter("footerCompany")} | {tFooter("footerBizNo")} | {tFooter("footerCeo")}
            <br />
            {tFooter("footerAddress")} |{" "}
            <Link href="/terms">{tFooter("footerTerms")}</Link> |{" "}
            <Link href="/privacy">{tFooter("footerPrivacy")}</Link>
            <br />
            {tFooter("footerContact")}{" "}
            <a href="mailto:help@homenshop.com">help@homenshop.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
