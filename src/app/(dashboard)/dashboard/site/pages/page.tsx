import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
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

  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/site"
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              &larr; 사이트
            </Link>
            <h1 className="text-xl font-bold">페이지 관리</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/site/pages/menus"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              메뉴 관리
            </Link>
            <Link
              href="/dashboard/site/pages/new"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              새 페이지
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
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
    </div>
  );
}
