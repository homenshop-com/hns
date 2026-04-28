import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { atomizeBodyHtml } from "@/lib/atomic-transform";

/**
 * One-shot endpoint: re-atomize all pages of an existing site so the design
 * editor can select / edit objects. Useful for sites created via the
 * Claude Designs zip flow before atomic-transform was wired in.
 *
 * Auth: site owner only. Idempotent (atomizeBodyHtml skips elements already
 * wrapped in .dragable).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  if (site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pages = await prisma.page.findMany({
    where: { siteId: id },
    select: { id: true, slug: true, content: true },
  });

  let updated = 0;
  for (const page of pages) {
    const content = (page.content as { html?: string } | null) || {};
    const oldHtml = typeof content.html === "string" ? content.html : "";
    if (!oldHtml.trim()) continue;
    const newHtml = atomizeBodyHtml(oldHtml, page.slug);
    if (newHtml === oldHtml) continue;
    const merged = { ...content, html: newHtml };
    await prisma.page.update({
      where: { id: page.id },
      data: { content: merged as unknown as Prisma.InputJsonValue },
    });
    updated += 1;
  }

  return NextResponse.json({ ok: true, pagesScanned: pages.length, pagesUpdated: updated });
}
