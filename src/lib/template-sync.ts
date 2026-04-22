/**
 * Template sync — propagate edits from a template's "storage site" back
 * to the Template row.
 *
 * When an admin (or a user managing their own template) edits a site
 * that has `isTemplateStorage: true`, we want the changes to show up
 * in the Template table so new sites created from that template get
 * the latest design.
 *
 * Called from:
 *   - POST /api/admin/templates/:id/sync-from-site  (manual "적용" button)
 *   - PUT  /api/sites/:id                           (auto on save)
 *   - PUT  /api/sites/:id/pages/:pageId             (auto on save)
 *
 * Idempotent. Safe to call on every save — it's a handful of SELECTs +
 * one UPDATE.
 *
 * What it reads:
 *   - Site.cssText                    → Template.cssText
 *   - SiteHmf(siteId, lang=default)   → Template.headerHtml/menuHtml/footerHtml
 *     (falls back to Site.headerHtml if no SiteHmf row exists for the lang)
 *   - All Page rows for the site      → Template.pagesSnapshot
 *
 * Existing sites already created from the template are unaffected — they
 * keep their own snapshotted copies in Site.cssText / Page.content.
 */

import { prisma } from "@/lib/db";
import { canEditTemplates } from "@/lib/permissions";

export interface TemplateSyncResult {
  templateId: string;
  pages: number;
  headerChars: number;
  menuChars: number;
  footerChars: number;
  cssChars: number;
}

/**
 * Sync the Template row tied to `siteId` via `Template.demoSiteId`.
 *
 * Returns `null` if:
 *   - the site isn't a template storage
 *   - no Template is linked
 *   - the caller isn't allowed to update this particular template
 *     (system templates require `canEditTemplates(email)`; user templates
 *     require ownership)
 *
 * Safe to call unconditionally from save handlers — the no-op path is
 * cheap and the permission check protects the golden-copy invariant.
 */
export async function syncTemplateFromSiteIfLinked(
  siteId: string,
  sessionEmail?: string | null,
): Promise<TemplateSyncResult | null> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      userId: true,
      isTemplateStorage: true,
      defaultLanguage: true,
      headerHtml: true,
      menuHtml: true,
      footerHtml: true,
      cssText: true,
    },
  });
  if (!site || !site.isTemplateStorage) return null;

  // Find the Template that points at this site.
  const template = await prisma.template.findFirst({
    where: { demoSiteId: siteId },
    select: { id: true, userId: true },
  });
  if (!template) return null;

  // Permission check:
  //   - System template (Template.userId === null): only allowlisted
  //     operators may sync — protects the golden copy from drift.
  //   - User template (Template.userId === <owner>): only the owner
  //     may sync (the storage site's userId is already the owner, so
  //     the existing Site save guard enforces this — double-check here
  //     for defense in depth).
  if (template.userId === null) {
    if (!canEditTemplates(sessionEmail)) return null;
  } else {
    if (site.userId !== template.userId) return null;
  }

  return syncTemplateFromSite(template.id);
}

/**
 * Force-sync a specific Template from its linked storage site.
 * Called by the admin's "적용" button directly.
 */
export async function syncTemplateFromSite(
  templateId: string,
): Promise<TemplateSyncResult | null> {
  const template = await prisma.template.findUnique({
    where: { id: templateId },
    select: { id: true, demoSiteId: true },
  });
  if (!template || !template.demoSiteId) return null;

  const site = await prisma.site.findUnique({
    where: { id: template.demoSiteId },
    select: {
      id: true,
      defaultLanguage: true,
      headerHtml: true,
      menuHtml: true,
      footerHtml: true,
      cssText: true,
    },
  });
  if (!site) return null;

  // HMF: prefer per-language SiteHmf row, fall back to the site-level
  // columns. Editor saves to SiteHmf (design-editor.tsx sends hmfLang),
  // so without this, auto-sync would read stale template snapshots.
  const lang = site.defaultLanguage || "ko";
  const hmf = await prisma.siteHmf.findUnique({
    where: { siteId_lang: { siteId: site.id, lang } },
    select: { headerHtml: true, menuHtml: true, footerHtml: true },
  });
  const headerHtml = hmf?.headerHtml ?? site.headerHtml ?? null;
  const menuHtml = hmf?.menuHtml ?? site.menuHtml ?? null;
  const footerHtml = hmf?.footerHtml ?? site.footerHtml ?? null;

  // Pages — include per-page CSS (@media overrides for mobile, theme
  // variable blocks, etc.) so create-from-template can restore them.
  const pages = await prisma.page.findMany({
    where: { siteId: site.id },
    orderBy: { sortOrder: "asc" },
    select: {
      slug: true,
      title: true,
      lang: true,
      isHome: true,
      showInMenu: true,
      sortOrder: true,
      content: true,
      css: true,
    },
  });

  const pagesSnapshot = pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    lang: p.lang,
    isHome: p.isHome,
    showInMenu: p.showInMenu,
    sortOrder: p.sortOrder,
    content: p.content,
    css: p.css ?? null,
  }));

  await prisma.template.update({
    where: { id: template.id },
    data: {
      headerHtml,
      menuHtml,
      footerHtml,
      cssText: site.cssText ?? null,
      pagesSnapshot: pagesSnapshot as unknown as object,
    },
  });

  return {
    templateId: template.id,
    pages: pagesSnapshot.length,
    headerChars: headerHtml?.length ?? 0,
    menuChars: menuHtml?.length ?? 0,
    footerChars: footerHtml?.length ?? 0,
    cssChars: site.cssText?.length ?? 0,
  };
}
