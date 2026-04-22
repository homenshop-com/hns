/**
 * Admin-only CRUD for the Template table.
 *
 * GET    /api/admin/templates/[id]  — fetch one template (basic info)
 * PUT    /api/admin/templates/[id]  — update name/desc/category/price/
 *                                      isActive/isPublic/sortOrder/thumbnail
 * DELETE /api/admin/templates/[id]  — hard delete (admin only; use with care
 *                                      because sites already created from
 *                                      this template keep their snapshot
 *                                      and are unaffected)
 *
 * Auth: session.user.role === "ADMIN" required.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canEditTemplates } from "@/lib/permissions";

/**
 * Two-tier guard: ADMIN role (everything under /admin) + template-editor
 * allowlist (canEditTemplates). Returns 401 for anonymous, 403 for every
 * non-allowlisted caller including regular admins.
 */
async function requireTemplateEditor() {
  const session = await auth();
  if (!session) return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, email: true },
  });
  if (user?.role !== "ADMIN" || !canEditTemplates(user.email)) {
    return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;
  const { id } = await params;
  const template = await prisma.template.findUnique({
    where: { id },
    select: {
      id: true, name: true, path: true, thumbnailUrl: true, category: true,
      price: true, keywords: true, description: true, isActive: true,
      isPublic: true, sortOrder: true, clicks: true, userId: true,
      demoSiteId: true, createdAt: true, updatedAt: true,
      // Lengths as stats (don't ship the full blobs to the list UI).
      headerHtml: true, menuHtml: true, footerHtml: true, cssText: true,
      pagesSnapshot: true,
    },
  });
  if (!template) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ template });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;
  const { id } = await params;

  const body = await req.json() as Partial<{
    name: string; description: string; keywords: string; category: string;
    thumbnailUrl: string; sortOrder: number; price: number;
    isActive: boolean; isPublic: boolean;
  }>;

  // Whitelist — admin can't tamper with headerHtml/cssText/pagesSnapshot
  // directly through this endpoint. Those fields are mutated via the
  // design-edit flow (edit the linked storage site → sync back).
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 100);
  if (typeof body.description === "string") data.description = body.description.trim().slice(0, 2000);
  if (typeof body.keywords === "string") data.keywords = body.keywords.trim().slice(0, 500);
  if (typeof body.category === "string") data.category = body.category.trim().slice(0, 50) || null;
  if (typeof body.thumbnailUrl === "string") data.thumbnailUrl = body.thumbnailUrl.trim() || null;
  if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
    data.sortOrder = Math.max(0, Math.round(body.sortOrder));
  }
  if (typeof body.price === "number" && Number.isFinite(body.price)) {
    data.price = Math.max(0, Math.round(body.price));
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body.isPublic === "boolean") data.isPublic = body.isPublic;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const template = await prisma.template.update({ where: { id }, data });
  return NextResponse.json({ template });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTemplateEditor();
  if (!guard.ok) return guard.res;
  const { id } = await params;

  // Soft-link check: if a demoSiteId is set, we leave the storage site
  // behind (admin can clean it up separately via 계정 관리 if desired).
  await prisma.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
