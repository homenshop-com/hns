import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SignOutButton from "../../../sign-out-button";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MenuManager from "./menu-manager";
import LanguageSettings from "@/components/LanguageSettings";

export default async function MenusPage() {
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
  const siteLanguages = (site as typeof site & { languages?: string[] })
    .languages || ["ko"];

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
        <div style={{ marginBottom: 16 }}>
          <Link href="/dashboard/site/pages" style={{ fontSize: 13, color: "#868e96", textDecoration: "none" }}>
            &larr; 페이지 관리
          </Link>
        </div>
        {/* 언어 설정 */}
        <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-bold mb-3">사이트 언어 설정</h2>
          <LanguageSettings
            siteId={site.id}
            languages={siteLanguages}
            defaultLanguage={site.defaultLanguage}
            variant="compact"
          />
        </div>

        {/* 메뉴 관리 */}
        <MenuManager
          siteId={site.id}
          pages={site.pages.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            lang: p.lang,
            isHome: p.isHome,
            sortOrder: p.sortOrder,
            parentId: p.parentId,
            showInMenu: p.showInMenu,
            menuTitle: p.menuTitle,
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
