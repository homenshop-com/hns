import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TemplateGallery from "./template-gallery";
import PageListWithLang from "./page-list-with-lang";

export default async function SitePage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard");
  const tSite = await getTranslations("site");
  const tSettings = await getTranslations("settings");
  const tFooter = await getTranslations("home");

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
    include: {
      pages: { orderBy: { sortOrder: "asc" } },
      domains: true,
    },
  });

  const siteLanguages = (site as typeof site & { languages?: string[] })?.languages || ["ko"];

  return (
    <div className="dash-page">
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
            <Link href="/dashboard" className="dash-header-btn">
              {t("dashboard")}
            </Link>
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
        {!site ? (
          <>
            {/* BREADCRUMB */}
            <div className="tpl-breadcrumb">
              <Link href="/dashboard">{t("title")}</Link>
              <span className="sep">&gt;</span>
              {tSite("createSite")}
            </div>

            {/* TEMPLATE GALLERY */}
            <TemplateGallery userId={session.user.id} />
          </>
        ) : (
          <>
            {/* BREADCRUMB */}
            <div className="tpl-breadcrumb">
              <Link href="/dashboard">{t("title")}</Link>
              <span className="sep">&gt;</span>
              {tSite("title")}
            </div>

            {/* SITE INFO BAR */}
            <div className="site-info-bar">
              <div className="site-info-left">
                <div>
                  <div className="site-info-name">{site.name}</div>
                  {site.domains.length > 0 && (
                    <div className="site-info-url">{site.domains[0].domain}</div>
                  )}
                </div>
                <span className={`site-info-badge ${site.published ? "published" : "draft"}`}>
                  {site.published ? tSettings("published") : tSettings("unpublished")}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Link href="/dashboard/site/pages" className="dash-manage-btn">
                  {t("btnDesign")}
                </Link>
                <Link href="/dashboard/products" className="dash-manage-btn">
                  {t("btnData")}
                </Link>
                <Link href="/dashboard/site/settings" className="dash-manage-btn">
                  {t("cards.settings")}
                </Link>
              </div>
            </div>

            {/* PAGE LIST */}
            <PageListWithLang
              pages={site.pages.map((p) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                lang: p.lang,
                isHome: p.isHome,
                sortOrder: p.sortOrder,
              }))}
              languages={siteLanguages}
              defaultLanguage={site.defaultLanguage}
            />
          </>
        )}
      </main>

      {/* FOOTER */}
      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
          <p>
            {tFooter("footerCompany")} | {tFooter("footerBizNo")} | {tFooter("footerCeo")}
          </p>
        </div>
      </footer>
    </div>
  );
}
