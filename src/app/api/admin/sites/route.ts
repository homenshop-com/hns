import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function checkAdmin() {
  const session = await auth();
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (user?.role !== "ADMIN") return null;
  return session;
}

// DELETE — bulk delete sites (cascade deletes pages, posts, products, etc.)
export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
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
