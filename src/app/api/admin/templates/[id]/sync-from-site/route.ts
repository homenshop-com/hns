/**
 * POST /api/admin/templates/[id]/sync-from-site
 *
 * Manual "적용" action from the admin templates list. Copies the
 * template's linked storage site back into the Template row so new
 * sites created from the template get the admin's latest edits.
 *
 * Shares logic with the auto-sync hook in Site/Page PUT handlers —
 * both call `syncTemplateFromSite()` from lib/template-sync.ts.
 *
 * Sites that were already created from the template keep their own
 * snapshot (unchanged).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { syncTemplateFromSite } from "@/lib/template-sync";
import { canEditTemplates } from "@/lib/permissions";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, email: true },
  });
  if (user?.role !== "ADMIN" || !canEditTemplates(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const template = await prisma.template.findUnique({
    where: { id },
    select: { id: true, name: true, demoSiteId: true },
  });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!template.demoSiteId) {
    return NextResponse.json({
      error: "no linked design site — click 디자인 수정 first",
    }, { status: 400 });
  }

  const stats = await syncTemplateFromSite(id);
  if (!stats) {
    return NextResponse.json({
      error: "linked site missing — clear demoSiteId and retry",
    }, { status: 404 });
  }
  return NextResponse.json({
    template: { id: template.id, name: template.name },
    stats,
  });
}
