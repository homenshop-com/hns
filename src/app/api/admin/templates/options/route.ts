/**
 * GET /api/admin/templates/options
 *
 * Lightweight template list for admin pickers (e.g. "create a site for this
 * member from a template"). Returns active templates only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess } from "@/lib/admin-access";

export async function GET() {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates = await prisma.template.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      isResponsive: true,
      isPublic: true,
      thumbnailUrl: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ templates });
}
