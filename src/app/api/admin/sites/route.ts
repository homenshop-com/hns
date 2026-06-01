import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminAccess, scopeResellerId } from "@/lib/admin-access";

// DELETE — bulk delete sites (cascade deletes pages, posts, products, etc.)
export async function DELETE(request: NextRequest) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rid = scopeResellerId(access);

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }

  // Reseller operators may only delete sites attributed to them.
  if (rid) {
    const ownCount = await prisma.site.count({
      where: { id: { in: ids }, user: { resellerId: rid } },
    });
    if (ownCount !== ids.length) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  // Get site info for confirmation log
  const sites = await prisma.site.findMany({
    where: { id: { in: ids } },
    select: { id: true, shopId: true, _count: { select: { pages: true, products: true } } },
  });

  // Delete sites (cascade will handle related records)
  const result = await prisma.site.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({
    deleted: result.count,
    sites: sites.map(s => ({ shopId: s.shopId, pages: s._count.pages, products: s._count.products })),
  });
}
