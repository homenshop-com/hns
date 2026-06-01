import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePageParam } from "@/lib/pagination";
import { getAdminAccess, scopeResellerId } from "@/lib/admin-access";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rid = scopeResellerId(access);

  const { searchParams } = request.nextUrl;
  const page = parsePageParam(searchParams.get("page"));
  const search = searchParams.get("search") || "";

  // Prospect placeholders are managed in /admin/prospects — exclude them
  // here so the regular member listing reflects real customers only.
  const where = {
    isProspect: false,
    ...(rid ? { resellerId: rid } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        shopId: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    users,
    totalCount,
    page,
    totalPages: Math.ceil(totalCount / PAGE_SIZE),
  });
}

// DELETE — bulk delete members (cascade deletes sites, pages, products, etc.)
export async function DELETE(request: NextRequest) {
  const access = await getAdminAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rid = scopeResellerId(access);

  const { ids } = await request.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No IDs provided" }, { status: 400 });
  }

  // Prevent deleting ADMIN accounts
  const adminUsers = await prisma.user.findMany({
    where: { id: { in: ids }, role: "ADMIN" },
    select: { id: true },
  });
  if (adminUsers.length > 0) {
    return NextResponse.json({ error: "Cannot delete admin accounts" }, { status: 400 });
  }

  // Reseller operators may only delete members attributed to them.
  if (rid) {
    const ownCount = await prisma.user.count({
      where: { id: { in: ids }, resellerId: rid },
    });
    if (ownCount !== ids.length) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
  }

  // Delete related records without cascade first
  await prisma.orderItem.deleteMany({ where: { order: { userId: { in: ids } } } });
  await prisma.order.deleteMany({ where: { userId: { in: ids } } });
  await prisma.domain.deleteMany({ where: { userId: { in: ids } } });

  // Delete users (cascade handles Site → Page, Product, Board, etc.)
  const result = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  return NextResponse.json({ deleted: result.count });
}
