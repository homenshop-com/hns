/**
 * POST /api/admin/templates/[id]/sync-from-site
 *
 * Copies the template's linked storage site (Template.demoSiteId) back
 * into the Template row:
 *   - Site.headerHtml   → Template.headerHtml
 *   - Site.menuHtml     → Template.menuHtml
 *   - Site.footerHtml   → Template.footerHtml
 *   - Site.cssText      → Template.cssText
 *   - All Page(siteId)  → Template.pagesSnapshot (sorted by sortOrder)
 *
 * After this call, new sites created from the template pick up the
 * admin's design changes. Sites that were already created from the
 * older version keep their original snapshot (unchanged).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!template.demoSiteId) {
    return NextResponse.json({
      error: "no linked design site — click 디자인 수정 first",
    }, { status: 400 });
  }

  const site = await prisma.site.findUnique({
    where: { id: template.demoSiteId },
    include: {
      pages: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!site) {
    return NextResponse.json({
      error: "linked site missing — clear demoSiteId and retry",
    }, { status: 404 });
  }

  const pagesSnapshot = site.pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    lang: p.lang,
    isHome: p.isHome,
    showInMenu: p.showInMenu,
    sortOrder: p.sortOrder,
    content: p.content,
    css: p.css ?? null,
  }));

  const updated = await prisma.template.update({
    where: { id },
    data: {
      headerHtml: site.headerHtml ?? null,
      menuHtml: site.menuHtml ?? null,
      footerHtml: site.footerHtml ?? null,
      cssText: site.cssText ?? null,
      pagesSnapshot: pagesSnapshot as unknown as object,
    },
    select: {
      id: true, name: true, updatedAt: true,
    },
  });

  return NextResponse.json({
    template: updated,
    stats: {
      pages: pagesSnapshot.length,
      headerChars: site.headerHtml?.length ?? 0,
      footerChars: site.footerHtml?.length ?? 0,
      cssChars: site.cssText?.length ?? 0,
    },
  });
}
