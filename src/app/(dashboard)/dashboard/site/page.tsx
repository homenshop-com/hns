import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DashboardShell from "../dashboard-shell";
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

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
    include: {
      pages: { orderBy: { sortOrder: "asc" } },
      domains: true,
    },
  });

  const siteLanguages = (site as typeof site & { languages?: string[] })?.languages || ["ko"];

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: t("title"), href: "/dashboard" },
        { label: site ? tSite("title") : tSite("createSite") },
      ]}
    >
      <div>
        {!site ? (
          <TemplateGallery userId={session.user.id} />
        ) : (
          <>
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
      </div>
    </DashboardShell>
  );
}
