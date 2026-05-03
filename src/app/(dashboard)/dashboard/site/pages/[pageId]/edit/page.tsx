import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { renderBoardPluginContent, renderProductPluginContent } from "@/lib/plugin-renderer";
import { readTemplateCss, rewriteAssetUrls } from "@/lib/template-parser";
import { isEditorV2Enabled } from "@/lib/editor-flags";
import DesignEditor from "./design-editor";
import { getTempDomain } from "@/lib/temp-domains";

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
  // Pull the source template's isResponsive flag so the editor can hide
  // the PC/Mobile toggle for new responsive templates (Agency, Plus
  // Academy, HomeBuilder…) where mobile is auto-handled by the layout.
  const sourceTemplate = site.templateId
    ? await prisma.template.findUnique({
        where: { id: site.templateId },
        select: { isResponsive: true },
      })
    : null;
  // Responsive determination — three signals (any one wins):
  //   1. Source template flagged isResponsive (Agency/Plus Academy/HomeBuilder)
  //   2. Site.cssText carries the modern-template marker (AI-generated
  //      sites are stamped with this on creation; legacy migrations are not)
  //   3. (future) explicit Site.isResponsive column
  // Falsey case = legacy fix-coord templates (jeune-au, ybsurplus, etc.)
  const cssTextStr = site.cssText ?? "";
  const cssMarkerResponsive = cssTextStr.includes("/* HNS-MODERN-TEMPLATE */");
  const isResponsiveTemplate = !!sourceTemplate?.isResponsive || cssMarkerResponsive;
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
  const menuHtml = hmf?.menuHtml || site.menuHtml || "";
  const footerHtml = hmf?.footerHtml ?? site.footerHtml ?? "";

  // Extract page body HTML from content JSON
  const pageContent = currentPage.content as { html?: string; layers?: unknown[] } | null;
  let bodyHtml = pageContent?.html || "";

  // Server-side render BoardPlugin/ProductPlugin content (replace stale plugin HTML)
  if (bodyHtml) {
    bodyHtml = await renderBoardPluginContent(site.id, site.shopId, currentLang, currentPage.slug, bodyHtml);
    bodyHtml = await renderProductPluginContent(site.id, site.shopId, currentLang, currentPage.slug, bodyHtml);
  }

  // Page-level CSS (z-index, position overrides for body elements)
  const pageCss = (currentPage as typeof currentPage & { css?: string }).css || "";

  // Template CSS (default.css + site-upgrade.css)
  const templatePath = site.templatePath || "";
  const templateCss = templatePath ? readTemplateCss(templatePath) : "";

  // Rewrite relative asset URLs (`../files/...`, `./files/...`) to absolute
  // `/tpl/<templatePath>/files/...`. The published route does this at
  // render time (route.ts:605-607); without it, images in the editor
  // iframe 404 and the page looks empty. Migrated legacy templates in
  // particular have tons of these relative paths in Page.content.
  let headerHtmlFinal = headerHtml;
  let footerHtmlFinal = footerHtml;
  let menuHtmlFinal = menuHtml;
  if (templatePath) {
    bodyHtml = rewriteAssetUrls(bodyHtml, templatePath);
    headerHtmlFinal = rewriteAssetUrls(headerHtml, templatePath);
    footerHtmlFinal = rewriteAssetUrls(footerHtml, templatePath);
    menuHtmlFinal = rewriteAssetUrls(menuHtml, templatePath);
  }

  return (
    <DesignEditor
      siteId={site.id}
      shopId={site.shopId}
      siteName={site.name}
      defaultLanguage={site.defaultLanguage}
      tempDomain={getTempDomain(site)}
      templatePath={templatePath}
      headerHtml={headerHtmlFinal}
      menuHtml={menuHtmlFinal}
      footerHtml={footerHtmlFinal}
      cssText={site.cssText || ""}
      pageCss={pageCss}
      templateCss={templateCss}
      pageId={currentPage.id}
      pageTitle={currentPage.title}
      pageSlug={currentPage.slug}
      pages={pages}
      bodyHtml={bodyHtml}
      published={site.published}
      currentLang={currentLang}
      siteLanguages={siteLanguages}
      langPageMap={langPageMap}
      editorV2Enabled={isEditorV2Enabled(session.user?.email)}
      isResponsiveTemplate={isResponsiveTemplate}
    />
  );
}
