import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PagesWithLangFilter from "./pages-with-lang-filter";

export default async function PagesPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!site) {
    redirect("/dashboard/site");
  }

  const td = await getTranslations("dashboard");
  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];

  return (
    <div className="dash-page">
      <header className="dash-header">
        <div className="dash-header-inner">
          <div style={{ display: "flex", alignItems: "center" }}>
            <Link href="/dashboard" className="dash-logo">homeNshop</Link>
            <span className="dash-logo-sub">{td("cards.site")}</span>
          </div>
          <div className="dash-header-right">
            <Link href="/dashboard" className="dash-header-btn">{td("dashboard")}</Link>
            <Link href="/dashboard/profile" className="dash-header-btn">{td("memberInfo")}</Link>
            <SignOutButton />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="dash-main">
        <PagesWithLangFilter
          siteId={site.id}
          pages={site.pages.filter((p) => siteLanguages.includes(p.lang)).map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            lang: p.lang,
            isHome: p.isHome,
            sortOrder: p.sortOrder,
            updatedAt: p.updatedAt.toISOString(),
            parentId: p.parentId,
            showInMenu: p.showInMenu,
            externalUrl: p.externalUrl,
          }))}
          languages={siteLanguages}
          defaultLanguage={site.defaultLanguage}
        />
      </main>

      <footer className="dash-footer">
        <div className="dash-footer-inner">
          <p>&copy; {new Date().getFullYear()} homenshop.com. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
