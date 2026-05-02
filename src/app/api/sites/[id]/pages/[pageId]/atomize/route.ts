import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { atomizeBodyHtml } from "@/lib/atomic-transform";

// POST /api/sites/[id]/pages/[pageId]/atomize
// Wraps bare h1/h2/p/img/a.btn/ul/table in .dragable so the design editor
// can select, label, and edit them. Idempotent — safe to re-run.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, pageId } = await params;

  const site = await prisma.site.findUnique({ where: { id } });
  if (!site || site.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page || page.siteId !== id) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  const content = (page.content as { html?: string } | null) || {};
  const oldHtml = typeof content.html === "string" ? content.html : "";
  if (!oldHtml.trim()) {
    return NextResponse.json({ ok: true, changed: false, reason: "empty" });
  }

  const newHtml = atomizeBodyHtml(oldHtml, page.slug);
  if (newHtml === oldHtml) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const merged = { ...content, html: newHtml };
  await prisma.page.update({
    where: { id: pageId },
    data: { content: merged as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({ ok: true, changed: true });
}
