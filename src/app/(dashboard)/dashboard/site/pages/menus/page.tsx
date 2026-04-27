import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import DashboardShell from "../../../dashboard-shell";
import MenuManager from "./menu-manager";
import LanguageSettings from "@/components/LanguageSettings";

export default async function MenusPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const site = await prisma.site.findFirst({
    where: { userId: session.user.id, isTemplateStorage: false },
    include: {
      pages: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!site) {
    redirect("/dashboard/site");
  }

  const siteLanguages = (site as typeof site & { languages?: string[] })
    .languages || ["ko"];

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "내 홈페이지", href: "/dashboard/site" },
        { label: "페이지", href: "/dashboard/site/pages" },
        { label: "메뉴 관리" },
      ]}
    >
      <div>
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
      </div>
    </DashboardShell>
  );
}
