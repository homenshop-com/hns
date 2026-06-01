import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePageParam } from "@/lib/pagination";
import { getAdminAccess, scopeResellerId } from "@/lib/admin-access";

const PAGE_SIZE = 20;

// GET /api/admin/orders — List orders (admin + scoped reseller)
export async function GET(request: NextRequest) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rid = scopeResellerId(access);

  const { searchParams } = request.nextUrl;
  const page = parsePageParam(searchParams.get("page"));
  const status = searchParams.get("status") || "";

  const where: { status?: never; user?: { resellerId: string } } = {};
  if (status) where.status = status as never;
  if (rid) where.user = { resellerId: rid };

  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: {
          select: { email: true, name: true },
        },
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return NextResponse.json({
    orders,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  });
}
