import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
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

  const siteLanguages = (site as typeof site & { languages?: string[] })
    .languages || ["ko"];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/site/pages"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              &larr; 페이지 관리
            </Link>
            <h1 className="text-xl font-bold">메뉴 관리</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
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
    </div>
  );
}
