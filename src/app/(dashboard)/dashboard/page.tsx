import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import SignOutButton from "./sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default async function DashboardPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard");
  const tFooter = await getTranslations("home");

  const sites = await prisma.site.findMany({
    where: { userId: session.user.id },
    include: {
      domains: true,
      pages: { select: { id: true, isHome: true, lang: true }, orderBy: { sortOrder: "asc" } },
      products: { select: { id: true } },
      boards: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="dash-page">
      {/* HEADER */}
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">
              HomeNShop
            </Link>
            <span className="dash-logo-sub">{t("title")}</span>
          </div>
          <div className="dash-header-right">
            <span className="dash-user-info">
              {session.user.name} ({session.user.email})
            </span>
            <Link href="/dashboard" className="dash-header-btn">
              {t("memberInfo")}
            </Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="dash-main">
        {/* TOOLBAR */}
        <div className="dash-toolbar">
          <div className="dash-toolbar-left">
            <h1 className="dash-title">{t("title")}</h1>
            <button className="dash-filter-btn active">
              {t("filterAll")}
            </button>
            <button className="dash-filter-btn">
              {t("filterFree")} ({sites.length})
            </button>
            <button className="dash-filter-btn">
              {t("filterPaid")} (0)
            </button>
            <button className="dash-filter-btn">
              {t("filterExpired")} (0)
            </button>
          </div>
          <div className="dash-toolbar-right">
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
                  <span className="dash-status-dot active" />
                  <div>
                    <div className="dash-site-id">
                      {s.shopId}
                    </div>
                    {s.name && s.name !== s.shopId && (
                      <div style={{ fontSize: 12, color: "#868e96", marginTop: 1 }}>
                        {s.name}
                      </div>
                    )}
                    {s.domains.length > 0 && (
                      <div style={{ fontSize: 12, color: "#2f9e44", marginTop: 2 }}>
                        {s.domains[0].domain}
                      </div>
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
