import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import DashboardShell from "../../dashboard-shell";
import PagesWithLangFilter from "./pages-with-lang-filter";

export default async function PagesPage() {
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

  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];

  return (
    <DashboardShell
      active="sites"
      breadcrumbs={[
        { label: "홈", href: "/dashboard" },
        { label: "내 홈페이지", href: "/dashboard/site" },
        { label: "페이지" },
      ]}
    >
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
    </DashboardShell>
  );
}
