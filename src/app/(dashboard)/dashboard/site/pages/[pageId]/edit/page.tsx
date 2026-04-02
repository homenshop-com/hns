import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDbPath, renderBoardPluginContent, renderProductPluginContent } from "@/lib/plugin-renderer";
import DesignEditor from "./design-editor";

interface EditPageProps {
  params: Promise<{ pageId: string }>;
}

export default async function EditPagePage({ params }: EditPageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { pageId } = await params;

  // Find the page first, then verify ownership
  const currentPage = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      site: {
        include: {
          pages: { orderBy: { sortOrder: "asc" } },
          hmfTranslations: true,
        },
      },
    },
  });

  if (!currentPage || currentPage.site.userId !== session.user.id) {
    redirect("/dashboard");
  }

  const site = currentPage.site;
  const siteLanguages = (site as typeof site & { languages?: string[] }).languages || ["ko"];
  // Use the page's language if it's in configured languages, otherwise fall back to default
  const currentLang = siteLanguages.includes(currentPage.lang)
    ? currentPage.lang
    : site.defaultLanguage;

  const pages = site.pages
    .filter((p) => p.lang === currentLang)
    .map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      isHome: p.isHome,
      parentId: p.parentId,
      showInMenu: p.showInMenu,
      menuTitle: p.menuTitle,
      externalUrl: p.externalUrl,
    }))
    .sort((a, b) => {
      // HOME page always first
      if (a.isHome && !b.isHome) return -1;
      if (!a.isHome && b.isHome) return 1;
      return 0; // preserve sortOrder from DB
    });

  // Build language→pageId map for the current slug (for language switching)
  const langPageMap: Record<string, string> = {};
  for (const lang of siteLanguages) {
    const matchingPage = site.pages.find(
      (p) => p.lang === lang && p.slug === currentPage.slug
    );
    if (matchingPage) {
      langPageMap[lang] = matchingPage.id;
    }
  }

  // Select HMF for current language, fallback to default language, then Site-level
  const hmf = site.hmfTranslations?.find((h) => h.lang === currentLang)
    || site.hmfTranslations?.find((h) => h.lang === site.defaultLanguage);
  const headerHtml = hmf?.headerHtml ?? site.headerHtml ?? "";
  const menuHtml = hmf?.menuHtml ?? site.menuHtml ?? "";
  const footerHtml = hmf?.footerHtml ?? site.footerHtml ?? "";

  // Extract page body HTML from content JSON
  const pageContent = currentPage.content as { html?: string; layers?: unknown[] } | null;
  let bodyHtml = pageContent?.html || "";

  // Server-side render BoardPlugin/ProductPlugin content (replace stale <script> tags)
  const dbPath = getDbPath(site.shopId);
  if (dbPath && bodyHtml) {
    bodyHtml = renderBoardPluginContent(dbPath, site.shopId, currentLang, currentPage.slug, bodyHtml);
    bodyHtml = renderProductPluginContent(dbPath, site.shopId, currentLang, currentPage.slug, bodyHtml);
  }

  // Page-level CSS (z-index, position overrides for body elements)
  const pageCss = (currentPage as typeof currentPage & { css?: string }).css || "";

  return (
    <DesignEditor
      siteId={site.id}
      shopId={site.shopId}
      siteName={site.name}
      defaultLanguage={site.defaultLanguage}
      templatePath={site.templatePath || ""}
      headerHtml={headerHtml}
      menuHtml={menuHtml}
      footerHtml={footerHtml}
      cssText={site.cssText || ""}
      pageCss={pageCss}
      pageId={currentPage.id}
      pageTitle={currentPage.title}
      pageSlug={currentPage.slug}
      pages={pages}
      bodyHtml={bodyHtml}
      published={site.published}
      currentLang={currentLang}
      siteLanguages={siteLanguages}
      langPageMap={langPageMap}
    />
  );
}
