/**
 * POST /api/admin/templates/[id]/design-edit
 *
 * Prepare a template for visual editing in the standard design editor.
 *
 * Flow:
 *   1. If the template already has a `demoSiteId`, return the first page's
 *      edit URL — admin resumes where they left off.
 *   2. Otherwise, clone the template's header/menu/footer/css/pagesSnapshot
 *      into a fresh hidden site (`isTemplateStorage: true`) under the
 *      admin's own userId. The site is invisible to the normal site list
 *      and its shopId is prefixed with `_tpl_` so it's obvious on disk.
 *   3. Link the new site back to the Template via `demoSiteId` so future
 *      edits hit the same storage site.
 *   4. Return `{ editUrl }` — the admin UI navigates to it.
 *
 * The admin then edits as if it's a normal site. To push changes back to
 * the Template row, call `/api/admin/templates/[id]/sync-from-site`.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { canEditTemplates } from "@/lib/permissions";

async function requireTemplateEditor(): Promise<
  | { ok: true; userId: string }
  | { ok: false; res: NextResponse }
> {
  const session = await auth();
  if (!session) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, id: true, email: true },
  });
  if (user?.role !== "ADMIN" || !canEditTemplates(user.email)) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, userId: user.id };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;
  const { id } = await params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });

  // If a storage site already exists, reuse it.
  if (template.demoSiteId) {
    const page = await prisma.page.findFirst({
      where: { siteId: template.demoSiteId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (page) {
      return NextResponse.json({
        editUrl: `/dashboard/site/pages/${page.id}/edit`,
        siteId: template.demoSiteId,
        reused: true,
      });
    }
    // Storage site existed but has no pages — fall through to recreate.
  }

  // Build page snapshot — prefer DB pagesSnapshot, else minimal skeleton.
  type SnapshotPage = {
    slug: string; title: string; content: unknown; css?: string | null;
    lang?: string; sortOrder?: number; isHome?: boolean; showInMenu?: boolean;
  };
  const snap: SnapshotPage[] = Array.isArray(template.pagesSnapshot)
    ? (template.pagesSnapshot as unknown as SnapshotPage[])
    : [];
  const pageData: Prisma.PageCreateWithoutSiteInput[] = snap.length > 0
    ? snap.map((p, i) => ({
        title: p.title ?? p.slug ?? `Page ${i + 1}`,
        slug: p.slug,
        lang: p.lang ?? "ko",
        isHome: p.isHome ?? p.slug === "index",
        showInMenu: p.showInMenu ?? true,
        sortOrder: p.sortOrder ?? i,
        content: (p.content ?? { html: "" }) as Prisma.InputJsonValue,
        css: p.css ?? null,
      }))
    : [{ title: "홈", slug: "index", isHome: true, sortOrder: 0, content: { html: "" } }];

  // ShopId: `_tpl_<templateId>` — obviously marked + stable for re-sync.
  // `.slice(0, 40)` to respect DB varchar limits.
  const storageShopId = `_tpl_${id}`.slice(0, 40);

  // Upsert — if a stray storage site with this shopId exists, adopt it.
  const existing = await prisma.site.findUnique({ where: { shopId: storageShopId } });
  let siteId: string;
  if (existing) {
    // Replace pages wholesale so edit always starts from the latest snapshot.
    await prisma.page.deleteMany({ where: { siteId: existing.id } });
    await prisma.site.update({
      where: { id: existing.id },
      data: {
        name: `[Template] ${template.name}`,
        userId: guard.userId,
        templateId: template.id,
        templatePath: template.path,
        headerHtml: template.headerHtml || null,
        menuHtml: template.menuHtml || null,
        footerHtml: template.footerHtml || null,
        cssText: template.cssText || null,
        isTemplateStorage: true,
        published: false,
        pages: { create: pageData },
      },
    });
    siteId = existing.id;
  } else {
    const created = await prisma.site.create({
      data: {
        userId: guard.userId,
        shopId: storageShopId,
        name: `[Template] ${template.name}`,
        defaultLanguage: "ko",
        templateId: template.id,
        templatePath: template.path,
        headerHtml: template.headerHtml || null,
        menuHtml: template.menuHtml || null,
        footerHtml: template.footerHtml || null,
        cssText: template.cssText || null,
        isTemplateStorage: true,
        pages: { create: pageData },
      },
    });
    siteId = created.id;
  }

  // Link the template back to the storage site.
  await prisma.template.update({
    where: { id: template.id },
    data: { demoSiteId: siteId },
  });

  // Fetch the first page for the edit URL (separate query — .include can't
  // be chained onto the conditional branches cleanly).
  const firstPage = await prisma.page.findFirst({
    where: { siteId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  if (!firstPage) {
    return NextResponse.json({ error: "no pages" }, { status: 500 });
  }

  return NextResponse.json({
    editUrl: `/dashboard/site/pages/${firstPage.id}/edit`,
    siteId,
    reused: false,
  });
}
